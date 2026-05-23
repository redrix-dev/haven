import React from 'react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type RemoteAudioTrack,
  type RemoteParticipant,
} from 'livekit-client';
import { useHavenCore } from '@shared/core';
import { matchesVoicePushToTalkBinding } from '@shared/features/voice/utils/pushToTalk';
import { useVoiceMemberVolumes } from '@shared/features/voice/hooks/useVoiceMemberVolumes';
import { isEditableKeyboardTarget } from '@shared/infrastructure/utils/appUtils';
import { playVoicePresenceSound } from '@shared/features/notifications/utils/sound';
import { getErrorMessage } from '@platform/lib/errors';
import type { NotificationAudioSettings, VoiceSettings } from '@shared/types/settings';
import type {
  VoiceControllerChannel,
  VoiceParticipant,
  VoiceSessionControllerActions,
  VoiceSessionControllerState,
} from '@shared/features/voice/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type VoiceKickPayload = {
  targetUserId: string;
  channelId: string;
  kickedBy: string;
};

export type UseLiveKitVoiceSessionInput = {
  activeChannel: VoiceControllerChannel | null;
  currentUserId: string | null | undefined;
  currentUserDisplayName: string;
  currentUserAvatarUrl?: string | null;
  isElevatedInActiveServer: boolean;
  voiceSettings: VoiceSettings;
  notificationAudioSettings: NotificationAudioSettings;
  showDiagnostics?: boolean;
  onUpdateVoiceSettings?: (next: VoiceSettings) => void;
  onParticipantsChange?: (
    participants: Array<{
      userId: string;
      displayName: string;
      avatarUrl?: string | null;
      isSpeaking?: boolean;
    }>,
  ) => void;
  onConnectionChange?: (connected: boolean) => void;
  onSessionStateChange?: (state: {
    joined: boolean;
    isMuted: boolean;
    isDeafened: boolean;
  }) => void;
  onControlActionsReady?: (
    actions: {
      join: () => void;
      leave: () => void;
      toggleMute: () => void;
      toggleDeafen: () => void;
    } | null,
  ) => void;
  onSessionError?: (message: string) => void;
  onVoiceKick?: (payload: VoiceKickPayload) => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const VOICE_ACTIVITY_GATE_RELEASE_MS = 220;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tryParseAvatarUrl(metadata: string): string | null {
  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (typeof parsed === 'object' && parsed !== null && 'avatarUrl' in parsed) {
      const val = (parsed as Record<string, unknown>).avatarUrl;
      return typeof val === 'string' ? val : null;
    }
  } catch {
    // ignore malformed metadata
  }
  return null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Drop-in replacement for useVoiceSessionController using LiveKit Cloud.
 * Returns the same { state, actions } shape plus `livekitRoom` for
 * <RoomAudioRenderer room={livekitRoom} /> in ChatApp.tsx.
 */
export function useLiveKitVoiceSession({
  activeChannel,
  currentUserId,
  currentUserDisplayName,
  currentUserAvatarUrl,
  voiceSettings,
  notificationAudioSettings,
  onUpdateVoiceSettings,
  onParticipantsChange,
  onConnectionChange,
  onSessionStateChange,
  onControlActionsReady,
  onSessionError,
  onVoiceKick,
}: UseLiveKitVoiceSessionInput): {
  state: VoiceSessionControllerState;
  actions: VoiceSessionControllerActions;
  livekitRoom: Room;
} {
  const core = useHavenCore();
  const voiceSession = core.voice.useSession();
  const joined = voiceSession.joined;
  const isMuted = voiceSession.isMuted;
  const isDeafened = voiceSession.isDeafened;

  // ── State ──────────────────────────────────────────────────────────────────

  const [joining, setJoining] = React.useState(false);
  const [participants, setParticipants] = React.useState<VoiceParticipant[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [inputDevices, setInputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = React.useState(
    voiceSettings.preferredInputDeviceId || 'default',
  );
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = React.useState(
    voiceSettings.preferredOutputDeviceId || 'default',
  );
  const [switchingInput, setSwitchingInput] = React.useState(false);
  const [supportsOutputSelection, setSupportsOutputSelection] = React.useState(false);
  const [localInputLevel, setLocalInputLevel] = React.useState(0);
  const [voiceActivityGateOpen, setVoiceActivityGateOpen] = React.useState(false);
  const [pushToTalkPressed, setPushToTalkPressed] = React.useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────

  // Stable Room instance — persists across join/leave cycles
  const roomRef = React.useRef<Room | null>(null);
  if (!roomRef.current) {
    roomRef.current = new Room({
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });
  }

  const isIntentionalDisconnectRef = React.useRef(false);

  // VAD refs
  const vadAudioContextRef = React.useRef<AudioContext | null>(null);
  const vadSourceNodeRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const vadAnalyserNodeRef = React.useRef<AnalyserNode | null>(null);
  const vadTimeDomainRef = React.useRef<Uint8Array<ArrayBuffer> | null>(null);
  const vadRafIdRef = React.useRef<number | null>(null);
  const vadActiveRef = React.useRef(false);
  const lastVoiceActivityAtRef = React.useRef(0);

  // PTT / channel refs
  const activePushToTalkCodeRef = React.useRef<string | null>(null);
  const previousChannelKeyRef = React.useRef<string | null>(null);
  const voiceSettingsRef = React.useRef(voiceSettings);
  const notificationAudioSettingsRef = React.useRef(notificationAudioSettings);
  const activeChannelRef = React.useRef(activeChannel);
  const lastPresenceSoundAtRef = React.useRef(0);

  // Action refs for stable Electron IPC callbacks
  const joinVoiceChannelActionRef = React.useRef<(() => Promise<void>) | null>(null);
  const leaveVoiceChannelActionRef = React.useRef<(() => Promise<void>) | null>(null);
  const toggleMuteActionRef = React.useRef<(() => void) | null>(null);
  const toggleDeafenActionRef = React.useRef<(() => void) | null>(null);

  // ── Member volumes ─────────────────────────────────────────────────────────

  const remoteParticipantIds = React.useMemo(
    () => participants.map((p) => p.userId),
    [participants],
  );

  const { remoteVolumes, setMemberVolume, resetMemberVolume, resetAllMemberVolumes, getMemberVolume } =
    useVoiceMemberVolumes(
      activeChannel?.communityId ?? 'voice',
      activeChannel?.channelId ?? 'inactive',
      remoteParticipantIds,
    );

  // ── Nexus setters ──────────────────────────────────────────────────────────

  const setStoredJoined = React.useCallback((value: boolean) => {
    core.voice.setJoined(value);
  }, []);

  const setStoredIsMuted = React.useCallback((value: boolean) => {
    core.voice.setIsMuted(value);
  }, []);

  const setStoredIsDeafened = React.useCallback((value: boolean) => {
    core.voice.setIsDeafened(value);
  }, []);

  // ── Audio presence sounds ──────────────────────────────────────────────────

  const playDebouncedVoicePresenceSound = React.useCallback(
    (event: 'voice_presence_join' | 'voice_presence_leave') => {
      const now = Date.now();
      if (now - lastPresenceSoundAtRef.current < 900) return;
      lastPresenceSoundAtRef.current = now;
      void playVoicePresenceSound({ event, audioSettings: notificationAudioSettingsRef.current });
    },
    [],
  );

  // ── Voice settings patch ───────────────────────────────────────────────────

  const persistVoiceSettingsPatch = React.useCallback(
    (patch: Partial<VoiceSettings>) => {
      if (!onUpdateVoiceSettings) return;
      onUpdateVoiceSettings({ ...voiceSettingsRef.current, ...patch });
    },
    [onUpdateVoiceSettings],
  );

  // ── Participant sync ───────────────────────────────────────────────────────

  const buildParticipantsFromRoom = React.useCallback(
    (room: Room): VoiceParticipant[] => {
      const activeSpeakerIds = new Set(room.activeSpeakers.map((p) => p.identity));
      return Array.from(room.remoteParticipants.values()).map(
        (rp: RemoteParticipant): VoiceParticipant => {
          const micPub = rp.getTrackPublication(Track.Source.Microphone);
          const avatarUrl = rp.metadata ? tryParseAvatarUrl(rp.metadata) : null;
          return {
            userId: rp.identity,
            displayName: rp.name ?? rp.identity,
            avatarUrl,
            isSpeaking: activeSpeakerIds.has(rp.identity),
            muted: !micPub || micPub.isMuted,
            deafened: false, // LiveKit does not expose remote deafen state
          };
        },
      );
    },
    [],
  );

  const applyParticipants = React.useCallback(
    (room: Room) => {
      const next = buildParticipantsFromRoom(room);
      setParticipants(next);
      core.voice.setParticipants(
        next.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl ?? null,
          isSpeaking: p.isSpeaking ?? false,
        })),
      );
    },
    [buildParticipantsFromRoom, core.voice],
  );

  // ── Per-member volume application ──────────────────────────────────────────

  const applyRemoteVolumes = React.useCallback(
    (room: Room, volumes: Record<string, number>, deafened: boolean) => {
      room.remoteParticipants.forEach((rp) => {
        const micPub = rp.getTrackPublication(Track.Source.Microphone);
        const track = micPub?.audioTrack as RemoteAudioTrack | undefined;
        if (!track) return;
        const vol = deafened ? 0 : (volumes[rp.identity] ?? 100) / 100;
        track.setVolume(vol);
      });
    },
    [],
  );

  // ── VAD ───────────────────────────────────────────────────────────────────

  const stopVad = React.useCallback(async () => {
    vadActiveRef.current = false;
    if (vadRafIdRef.current != null) {
      cancelAnimationFrame(vadRafIdRef.current);
      vadRafIdRef.current = null;
    }
    vadSourceNodeRef.current?.disconnect();
    vadSourceNodeRef.current = null;
    vadAnalyserNodeRef.current?.disconnect();
    vadAnalyserNodeRef.current = null;
    vadTimeDomainRef.current = null;
    if (vadAudioContextRef.current) {
      try {
        await vadAudioContextRef.current.close();
      } catch {
        // ignore close errors
      }
      vadAudioContextRef.current = null;
    }
    setLocalInputLevel(0);
    setVoiceActivityGateOpen(false);
  }, []);

  const startVad = React.useCallback(
    async (mediaStreamTrack: MediaStreamTrack | null) => {
      await stopVad();
      if (!mediaStreamTrack) return;

      const stream = new MediaStream([mediaStreamTrack]);
      const audioContext = new AudioContext();
      try {
        await audioContext.resume();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);

        vadAudioContextRef.current = audioContext;
        vadSourceNodeRef.current = source;
        vadAnalyserNodeRef.current = analyser;
        vadTimeDomainRef.current = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
        vadActiveRef.current = true;

        const frame = (now: number) => {
          if (!vadActiveRef.current) {
            vadRafIdRef.current = null;
            return;
          }
          const analyserNode = vadAnalyserNodeRef.current;
          const timeDomain = vadTimeDomainRef.current;
          if (!analyserNode || !timeDomain) {
            vadRafIdRef.current = null;
            return;
          }

          analyserNode.getByteTimeDomainData(timeDomain);
          let rmsAcc = 0;
          for (let i = 0; i < timeDomain.length; i++) {
            const centered = (timeDomain[i] - 128) / 128;
            rmsAcc += centered * centered;
          }
          const rms = Math.sqrt(rmsAcc / timeDomain.length);
          const level = Math.min(1, rms * 3);
          const threshold = Math.max(
            0,
            Math.min(1, voiceSettingsRef.current.voiceActivationThreshold / 100),
          );

          if (level >= threshold) {
            lastVoiceActivityAtRef.current = now;
          }
          const gateOpen =
            level >= threshold ||
            now - lastVoiceActivityAtRef.current <= VOICE_ACTIVITY_GATE_RELEASE_MS;

          setLocalInputLevel((prev) => (Math.abs(prev - level) > 0.01 ? level : prev));
          setVoiceActivityGateOpen((prev) => (prev === gateOpen ? prev : gateOpen));
          vadRafIdRef.current = requestAnimationFrame(frame);
        };

        vadRafIdRef.current = requestAnimationFrame(frame);
      } catch (err) {
        console.warn('Failed to start VAD:', err);
        await stopVad();
        try {
          await audioContext.close();
        } catch {
          // ignore
        }
      }
    },
    [stopVad],
  );

  // ── Device refresh ─────────────────────────────────────────────────────────

  const refreshAudioDevices = React.useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === 'audioinput' && d.deviceId.trim().length > 0);
      const outputs = all.filter((d) => d.kind === 'audiooutput' && d.deviceId.trim().length > 0);
      setInputDevices(inputs);
      setOutputDevices(outputs);

      setSelectedInputDeviceId((prev) => {
        if (inputs.length > 0 && !inputs.some((d) => d.deviceId === prev)) return inputs[0].deviceId;
        if (inputs.length === 0 && prev !== 'default') return 'default';
        return prev;
      });
      setSelectedOutputDeviceId((prev) => {
        if (outputs.length > 0 && !outputs.some((d) => d.deviceId === prev))
          return outputs[0].deviceId;
        if (outputs.length === 0 && prev !== 'default') return 'default';
        return prev;
      });
    } catch (err) {
      console.error('Failed to enumerate audio devices:', err);
    }
  }, []);

  // ── Session cleanup ────────────────────────────────────────────────────────

  const cleanupVoiceSession = React.useCallback(async () => {
    const wasJoined = core.voice.getSnapshot().joined;
    const room = roomRef.current;
    isIntentionalDisconnectRef.current = true;

    if (room && room.state !== ConnectionState.Disconnected) {
      room.removeAllListeners();
      try {
        await room.disconnect();
      } catch (err) {
        console.warn('Error disconnecting LiveKit room:', err);
      }
    } else if (room) {
      room.removeAllListeners();
    }

    await stopVad();

    setParticipants([]);
    core.voice.setParticipants([]);
    setStoredJoined(false);
    setJoining(false);
    setStoredIsMuted(false);
    setStoredIsDeafened(false);
    setError(null);
    setLocalInputLevel(0);
    setVoiceActivityGateOpen(false);
    setPushToTalkPressed(false);
    activePushToTalkCodeRef.current = null;

    if (wasJoined) {
      playDebouncedVoicePresenceSound('voice_presence_leave');
    }

    await core.voice.disconnectKickChannel();

    isIntentionalDisconnectRef.current = false;
  }, [
    core.voice,
    playDebouncedVoicePresenceSound,
    setStoredIsDeafened,
    setStoredIsMuted,
    setStoredJoined,
    stopVad,
  ]);

  // ── Join ───────────────────────────────────────────────────────────────────

  const joinVoiceChannel = React.useCallback(
    async (targetChannel: VoiceControllerChannel | null = activeChannel) => {
      if (!targetChannel || !currentUserId) return;
      if (joining || joined) return;

      setJoining(true);
      setError(null);
      setStoredIsMuted(false);
      setStoredIsDeafened(false);

      try {
        const { token, serverUrl } = await core.voice.fetchJoinCredentials(
          targetChannel.communityId,
          targetChannel.channelId,
        );

        await refreshAudioDevices();

        const room = roomRef.current!;

        // ── Room event wiring ──────────────────────────────────────────────

        const syncParticipants = () => applyParticipants(room);

        room.on(RoomEvent.ParticipantConnected, (_rp: RemoteParticipant) => {
          playDebouncedVoicePresenceSound('voice_presence_join');
          syncParticipants();
        });
        room.on(RoomEvent.ParticipantDisconnected, () => {
          playDebouncedVoicePresenceSound('voice_presence_leave');
          syncParticipants();
        });
        room.on(RoomEvent.TrackMuted, syncParticipants);
        room.on(RoomEvent.TrackUnmuted, syncParticipants);
        room.on(RoomEvent.ActiveSpeakersChanged, syncParticipants);
        room.on(RoomEvent.ParticipantMetadataChanged, syncParticipants);

        // Unexpected disconnection (network drop, server eviction, etc.)
        room.on(RoomEvent.Disconnected, () => {
          if (isIntentionalDisconnectRef.current) return;
          void cleanupVoiceSession();
        });

        // ── Connect ────────────────────────────────────────────────────────

        await room.connect(serverUrl, token, { autoSubscribe: true });

        // Publish our avatar URL in metadata so other participants can display it
        await room.localParticipant.setMetadata(
          JSON.stringify({ avatarUrl: currentUserAvatarUrl ?? null }),
        );

        // Explicitly request mic access from the renderer process so macOS
        // shows the permission dialog if needed. The OS grants permission
        // per-process and the Electron Helper (Renderer) is separate from the
        // main process, so systemPreferences.askForMediaAccess alone is not
        // enough. If permission is denied we surface a clear error early.
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
        } catch (err) {
          if (err instanceof DOMException && err.name === 'NotAllowedError') {
            throw new Error(
              'Microphone access was denied. Please grant microphone permission in System Settings → Privacy & Security → Microphone, then restart the app.',
            );
          }
          // Any other error (no mic attached, etc.) — let LiveKit attempt anyway
          console.warn('Pre-check getUserMedia failed, attempting LiveKit mic enable anyway:', err);
        }

        // Enable microphone
        await room.localParticipant.setMicrophoneEnabled(true);

        // Start VAD on the local mic track
        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const localTrack = micPub?.audioTrack?.mediaStreamTrack ?? null;
        await startVad(localTrack);

        // ── Kick broadcast channel ─────────────────────────────────────────

        await core.voice.connectKickChannel({
          communityId: targetChannel.communityId,
          channelId: targetChannel.channelId,
          currentUserId,
          onKick: (payload) => {
            onVoiceKick?.(payload);
          },
        });

        // Apply preferred output device
        const currentOutputId = selectedOutputDeviceId;
        if (currentOutputId && currentOutputId !== 'default') {
          try {
            await room.switchActiveDevice('audiooutput', currentOutputId);
          } catch (err) {
            console.warn('Failed to set initial output device:', err);
          }
        }

        setStoredJoined(true);
        syncParticipants();
        playDebouncedVoicePresenceSound('voice_presence_join');
      } catch (joinError: unknown) {
        const message = getErrorMessage(joinError, 'Failed to join voice channel.');
        console.error('Failed to join voice channel:', joinError);
        await cleanupVoiceSession();
        onSessionError?.(message);
      } finally {
        setJoining(false);
      }
    },
    [
      activeChannel,
      applyParticipants,
      cleanupVoiceSession,
      core.voice,
      currentUserId,
      currentUserAvatarUrl,
      joined,
      joining,
      onSessionError,
      onVoiceKick,
      playDebouncedVoicePresenceSound,
      refreshAudioDevices,
      selectedOutputDeviceId,
      setStoredIsDeafened,
      setStoredIsMuted,
      setStoredJoined,
      startVad,
    ],
  );

  // ── Leave ──────────────────────────────────────────────────────────────────

  const leaveVoiceChannel = React.useCallback(async () => {
    await cleanupVoiceSession();
  }, [cleanupVoiceSession]);

  // ── Mute / Deafen ──────────────────────────────────────────────────────────

  const toggleMute = React.useCallback(() => {
    const next = !core.voice.getSnapshot().isMuted;
    setStoredIsMuted(next);
    // Track enable/disable is handled by the transmission effect below
  }, [core.voice, setStoredIsMuted]);

  const toggleDeafen = React.useCallback(() => {
    const nextDeafened = !core.voice.getSnapshot().isDeafened;
    if (nextDeafened) setStoredIsMuted(true);
    setStoredIsDeafened(nextDeafened);
    // Track enable/disable + remote volume muting handled by effects below
  }, [core.voice, setStoredIsDeafened, setStoredIsMuted]);

  // ── Device management ──────────────────────────────────────────────────────

  const switchInputDevice = React.useCallback(
    async (deviceId: string) => {
      setSelectedInputDeviceId(deviceId);
      persistVoiceSettingsPatch({ preferredInputDeviceId: deviceId });
      if (!joined) return;

      setSwitchingInput(true);
      setError(null);
      try {
        const room = roomRef.current!;
        await room.switchActiveDevice('audioinput', deviceId);
        // Restart VAD on the new track
        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const localTrack = micPub?.audioTrack?.mediaStreamTrack ?? null;
        await startVad(localTrack);
      } catch (err) {
        console.error('Failed to switch input device:', err);
        setError(getErrorMessage(err, 'Failed to switch input device.'));
      } finally {
        setSwitchingInput(false);
      }
    },
    [joined, persistVoiceSettingsPatch, startVad],
  );

  const setOutputDevice = React.useCallback(
    (deviceId: string) => {
      setSelectedOutputDeviceId(deviceId);
      persistVoiceSettingsPatch({ preferredOutputDeviceId: deviceId });
      if (!joined) return;
      void roomRef.current?.switchActiveDevice('audiooutput', deviceId).catch((err) => {
        console.warn('Failed to switch output device:', err);
      });
    },
    [joined, persistVoiceSettingsPatch],
  );

  // ── Kick ───────────────────────────────────────────────────────────────────

  const kickFromVoice = React.useCallback(
    async (targetUserId: string, channelId: string) => {
      await core.voice.kickParticipant(targetUserId, channelId);
    },
    [core.voice],
  );

  // ── Effects: keep refs fresh ───────────────────────────────────────────────

  React.useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);

  React.useEffect(() => {
    notificationAudioSettingsRef.current = notificationAudioSettings;
  }, [notificationAudioSettings]);

  React.useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  // ── Effects: device enumeration ────────────────────────────────────────────

  React.useEffect(() => {
    setSupportsOutputSelection(
      typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype,
    );
  }, []);

  React.useEffect(() => {
    void refreshAudioDevices();
    const handler = () => void refreshAudioDevices();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, [refreshAudioDevices]);

  React.useEffect(() => {
    const next = voiceSettings.preferredInputDeviceId || 'default';
    setSelectedInputDeviceId((prev) => (prev === next ? prev : next));
  }, [voiceSettings.preferredInputDeviceId]);

  React.useEffect(() => {
    const next = voiceSettings.preferredOutputDeviceId || 'default';
    setSelectedOutputDeviceId((prev) => (prev === next ? prev : next));
  }, [voiceSettings.preferredOutputDeviceId]);

  // ── Effects: local mic transmission gating ─────────────────────────────────
  //
  // Instead of setMicrophoneEnabled(false) (which unpublishes), we toggle the
  // underlying MediaStreamTrack.enabled — faster and avoids network renegotiation.
  React.useEffect(() => {
    if (!joined) return;

    const { isMuted: currentMuted, isDeafened: currentDeafened } = core.voice.getSnapshot();
    const baseAllowsSend = !currentMuted && !currentDeafened;

    let shouldSend = baseAllowsSend;
    if (baseAllowsSend) {
      switch (voiceSettingsRef.current.transmissionMode) {
        case 'push_to_talk':
          shouldSend =
            Boolean(voiceSettingsRef.current.pushToTalkBinding) && pushToTalkPressed;
          break;
        case 'voice_activity':
          shouldSend = voiceActivityGateOpen;
          break;
        default:
          shouldSend = true;
      }
    }

    const room = roomRef.current;
    if (!room) return;
    room.localParticipant.audioTrackPublications.forEach((pub) => {
      const track = pub.audioTrack?.mediaStreamTrack;
      if (track) track.enabled = shouldSend;
    });
  }, [
    core.voice,
    isDeafened,
    isMuted,
    joined,
    pushToTalkPressed,
    voiceActivityGateOpen,
    voiceSettings.transmissionMode,
    voiceSettings.pushToTalkBinding,
  ]);

  // ── Effects: VAD threshold change ──────────────────────────────────────────

  React.useEffect(() => {
    if (!joined) return;
    const room = roomRef.current;
    if (!room) return;
    const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const localTrack = micPub?.audioTrack?.mediaStreamTrack ?? null;
    void startVad(localTrack);
  }, [joined, startVad, voiceSettings.voiceActivationThreshold]);

  // ── Effects: remote volume / deafen ───────────────────────────────────────

  React.useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    applyRemoteVolumes(room, remoteVolumes, isDeafened);
  }, [applyRemoteVolumes, isDeafened, remoteVolumes]);

  // ── Effects: PTT keyboard listeners ───────────────────────────────────────

  React.useEffect(() => {
    if (voiceSettings.transmissionMode !== 'push_to_talk') {
      activePushToTalkCodeRef.current = null;
      setPushToTalkPressed(false);
      return;
    }
    const binding = voiceSettings.pushToTalkBinding;
    if (!binding) {
      setPushToTalkPressed(false);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (isEditableKeyboardTarget(event.target)) return;
      if (!matchesVoicePushToTalkBinding(event, binding)) return;
      event.preventDefault();
      event.stopPropagation();
      activePushToTalkCodeRef.current = event.code;
      setPushToTalkPressed(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const activeCode = activePushToTalkCodeRef.current;
      if (!activeCode || event.code !== activeCode) return;
      activePushToTalkCodeRef.current = null;
      setPushToTalkPressed(false);
    };

    const clearPressed = () => {
      activePushToTalkCodeRef.current = null;
      setPushToTalkPressed(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('blur', clearPressed);
    document.addEventListener('visibilitychange', clearPressed);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('blur', clearPressed);
      document.removeEventListener('visibilitychange', clearPressed);
      clearPressed();
    };
  }, [voiceSettings.pushToTalkBinding, voiceSettings.transmissionMode]);

  // ── Effects: channel change → leave + re-join ──────────────────────────────

  const activeChannelKey = activeChannel
    ? `${activeChannel.communityId}:${activeChannel.channelId}`
    : null;

  React.useEffect(() => {
    const nextKey = activeChannelKey;
    if (previousChannelKeyRef.current === nextKey) return;
    previousChannelKeyRef.current = nextKey;

    let cancelled = false;
    const syncSession = async () => {
      await cleanupVoiceSession();
      if (cancelled || !currentUserId) return;
      const nextChannel = activeChannelRef.current;
      const joinAction = joinVoiceChannelActionRef.current;
      if (!nextChannel || !joinAction) return;
      await joinAction();
    };
    void syncSession();
    return () => {
      cancelled = true;
    };
  }, [activeChannelKey, cleanupVoiceSession, currentUserId]);

  // ── Effects: unmount cleanup ───────────────────────────────────────────────

  React.useEffect(() => {
    return () => {
      void cleanupVoiceSession();
    };
  }, [cleanupVoiceSession]);

  // ── Effects: parent callbacks ──────────────────────────────────────────────

  React.useEffect(() => {
    onConnectionChange?.(joined);
  }, [joined, onConnectionChange]);

  React.useEffect(() => {
    onSessionStateChange?.({ joined, isMuted, isDeafened });
  }, [isDeafened, isMuted, joined, onSessionStateChange]);

  React.useEffect(() => {
    if (!onParticipantsChange) return;
    if (!joined) {
      onParticipantsChange([]);
      return;
    }
    onParticipantsChange(
      participants.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl ?? null,
        isSpeaking: p.isSpeaking ?? false,
      })),
    );
  }, [joined, onParticipantsChange, participants]);

  // ── Action refs for stable Electron IPC ───────────────────────────────────

  joinVoiceChannelActionRef.current = () => joinVoiceChannel(activeChannel);
  leaveVoiceChannelActionRef.current = leaveVoiceChannel;
  toggleMuteActionRef.current = toggleMute;
  toggleDeafenActionRef.current = toggleDeafen;

  React.useEffect(() => {
    if (!onControlActionsReady || !activeChannel || !currentUserId) {
      onControlActionsReady?.(null);
      return;
    }
    onControlActionsReady({
      join: () => {
        const action = joinVoiceChannelActionRef.current;
        if (action) void action();
      },
      leave: () => {
        leaveVoiceChannelActionRef.current?.();
      },
      toggleMute: () => {
        toggleMuteActionRef.current?.();
      },
      toggleDeafen: () => {
        toggleDeafenActionRef.current?.();
      },
    });
    return () => {
      onControlActionsReady(null);
    };
  }, [activeChannel, currentUserId, onControlActionsReady]);

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    state: {
      activeChannel,
      joined,
      joining,
      participants,
      // LiveKit manages audio internally via RoomAudioRenderer — no raw MediaStream needed
      remoteStreams: {},
      isMuted,
      isDeafened,
      error,
      notice: null,
      iceSource: null,
      inputDevices,
      outputDevices,
      selectedInputDeviceId,
      selectedOutputDeviceId,
      switchingInput,
      supportsOutputSelection,
      localInputLevel,
      voiceActivityGateOpen,
      pushToTalkPressed,
      // No WebRTC peer diagnostics with an SFU — stubs for type compatibility
      diagnosticsRows: [],
      diagnosticsUpdatedAt: null,
      diagnosticsLoading: false,
      remoteVolumes,
    },
    actions: {
      joinVoiceChannel: () => joinVoiceChannel(activeChannel),
      leaveVoiceChannel,
      kickFromVoice,
      toggleMute,
      toggleDeafen,
      // No-ops: LiveKit handles reconnection internally; no per-peer ICE to retry
      retryIce: async () => {},
      // No-ops: no RTCPeerConnection stats with an SFU
      refreshVoiceDiagnostics: async () => {},
      switchInputDevice,
      setOutputDevice,
      updateVoiceSettingsPatch: persistVoiceSettingsPatch,
      setMemberVolume,
      resetMemberVolume,
      resetAllMemberVolumes,
      getMemberVolume,
      // No-op: RoomAudioRenderer manages audio elements — no manual binding needed
      bindAudioElement: () => {},
    },
    livekitRoom: roomRef.current!,
  };
}
