import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { AndroidAudioTypePresets, AudioSession } from "@livekit/react-native";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
} from "livekit-client";
import { useHavenCore } from "@mobile-data";
import { useVoiceSession } from "@mobile-data/hooks";
import { useVoiceMemberVolumes } from "@/features/voice/hooks/useVoiceMemberVolumes";
import type {
  VoiceControllerChannel,
  VoiceParticipant,
} from "@shared/features/voice/types";
import type { VoiceSettings } from "@shared/types/settings";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import {
  startVoiceForegroundService,
  stopVoiceForegroundService,
} from "@/features/voice/mobileVoiceForegroundService";

type VoiceKickPayload = {
  targetUserId: string;
  channelId: string;
  kickedBy: string;
};

export type MobileVoiceOutputOption = {
  id: string;
  label: string;
};

export type MobileVoiceControllerState = {
  activeChannel: VoiceControllerChannel | null;
  joined: boolean;
  joining: boolean;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  error: string | null;
  notice: string | null;
  localInputLevel: number;
  voiceActivityGateOpen: boolean;
  remoteVolumes: Record<string, number>;
  outputDevices: MobileVoiceOutputOption[];
  selectedOutputDeviceId: string;
  supportsOutputSelection: boolean;
  connectionState: ConnectionState;
};

export type MobileVoiceControllerActions = {
  joinVoiceChannel: () => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  updateVoiceSettingsPatch: (patch: Partial<VoiceSettings>) => void;
  setMemberVolume: (userId: string, volume: number) => void;
  resetMemberVolume: (userId: string) => void;
  resetAllMemberVolumes: () => void;
  getMemberVolume: (userId: string) => number;
  setOutputDevice: (deviceId: string) => void;
  showSystemRoutePicker: () => void;
};

type UseMobileLiveKitVoiceSessionInput = {
  activeChannel: VoiceControllerChannel | null;
  currentUserId: string | null | undefined;
  currentUserDisplayName: string;
  currentUserAvatarUrl?: string | null;
  voiceSettings: VoiceSettings;
  onUpdateVoiceSettings: (patch: Partial<VoiceSettings>) => void;
  onSessionError?: (message: string) => void;
  onVoiceKick?: (payload: VoiceKickPayload) => void;
  onInterrupted?: () => void;
};

const VOICE_ACTIVITY_GATE_RELEASE_MS = 220;
const INPUT_LEVEL_INTERVAL_MS = 80;
const VOICE_CONTROL_CHANNEL_FAILURE_MESSAGE =
  "We're having trouble connecting you to voice services. Please try again, and contact support if this keeps happening.";

function playVoiceControlFeedback(enabled: boolean): void {
  void Haptics.impactAsync(
    enabled
      ? Haptics.ImpactFeedbackStyle.Medium
      : Haptics.ImpactFeedbackStyle.Light,
  ).catch(() => {
    // Haptics are best-effort and may be unavailable on some devices/settings.
  });
}

type VoiceJoinTimer = {
  mark: (label: string, details?: Record<string, unknown>) => void;
};

function createVoiceJoinTimer(channelName: string): VoiceJoinTimer {
  const enabled = typeof __DEV__ !== "undefined" && __DEV__;
  const startedAt = Date.now();
  let previousAt = startedAt;

  return {
    mark: (label, details = {}) => {
      if (!enabled) return;
      const now = Date.now();
      console.info("[voice:join]", label, {
        channelName,
        elapsedMs: now - startedAt,
        deltaMs: now - previousAt,
        ...details,
      });
      previousAt = now;
    },
  };
}

function tryParseAvatarUrl(metadata: string | undefined): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (typeof parsed !== "object" || parsed == null) return null;
    const value = (parsed as Record<string, unknown>).avatarUrl;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function createRoom(): Room {
  return new Room({
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    },
  });
}

function formatOutputLabel(id: string): string {
  switch (id) {
    case "default":
      return "Auto";
    case "force_speaker":
      return "Speaker";
    case "speaker":
      return "Speaker";
    case "earpiece":
      return "Earpiece";
    case "headset":
      return "Headset";
    case "bluetooth":
      return "Bluetooth";
    default:
      return id;
  }
}

async function ensureAndroidVoicePermissions(): Promise<void> {
  if (Platform.OS !== "android") return;
  const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (Number(Platform.Version) >= 33) {
    permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  const results = await PermissionsAndroid.requestMultiple(permissions);
  const microphoneResult = results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (microphoneResult !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error("Microphone permission is required to join voice.");
  }
}

export function useMobileLiveKitVoiceSession({
  activeChannel,
  currentUserId,
  currentUserDisplayName,
  currentUserAvatarUrl,
  voiceSettings,
  onUpdateVoiceSettings,
  onSessionError,
  onVoiceKick,
}: UseMobileLiveKitVoiceSessionInput): {
  state: MobileVoiceControllerState;
  actions: MobileVoiceControllerActions;
  livekitRoom: Room;
} {
  const core = useHavenCore();
  const voiceSession = useVoiceSession(core.voice);
  const joined = voiceSession.joined;
  const isMuted = voiceSession.isMuted;
  const isDeafened = voiceSession.isDeafened;
  const [joining, setJoining] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [localInputLevel, setLocalInputLevel] = useState(0);
  const [voiceActivityGateOpen, setVoiceActivityGateOpen] = useState(false);
  const [outputDevices, setOutputDevices] = useState<MobileVoiceOutputOption[]>(
    [{ id: "default", label: "Auto" }],
  );
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState(
    voiceSettings.preferredOutputDeviceId || "default",
  );
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );

  const roomRef = useRef<Room | null>(null);
  if (!roomRef.current) {
    roomRef.current = createRoom();
  }

  const activeChannelRef = useRef(activeChannel);
  const voiceSettingsRef = useRef(voiceSettings);
  const onUpdateVoiceSettingsRef = useRef(onUpdateVoiceSettings);
  const onSessionErrorRef = useRef(onSessionError);
  const onVoiceKickRef = useRef(onVoiceKick);
  const currentUserRef = useRef({
    id: currentUserId,
    displayName: currentUserDisplayName,
    avatarUrl: currentUserAvatarUrl ?? null,
  });
  const inputLevelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const lastVoiceActivityAtRef = useRef(0);
  const previousChannelKeyRef = useRef<string | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const joinGenerationRef = useRef(0);

  const remoteParticipantIds = useMemo(
    () => participants.map((participant) => participant.userId),
    [participants],
  );
  const {
    remoteVolumes,
    setMemberVolume,
    resetMemberVolume,
    resetAllMemberVolumes,
    getMemberVolume,
  } = useVoiceMemberVolumes(
    activeChannel?.communityId ?? "voice",
    activeChannel?.channelId ?? "inactive",
    remoteParticipantIds,
  );

  const buildParticipantsFromRoom = useCallback(
    (room: Room): VoiceParticipant[] => {
      const activeSpeakerIds = new Set(
        room.activeSpeakers.map((participant) => participant.identity),
      );
      return Array.from(room.remoteParticipants.values()).map(
        (participant: RemoteParticipant) => {
          const micPublication = participant.getTrackPublication(
            Track.Source.Microphone,
          );
          return {
            userId: participant.identity,
            displayName: participant.name || participant.identity,
            avatarUrl: tryParseAvatarUrl(participant.metadata),
            isSpeaking: activeSpeakerIds.has(participant.identity),
            muted: !micPublication || micPublication.isMuted,
            deafened: false,
          };
        },
      );
    },
    [],
  );

  const applyParticipants = useCallback(
    (room: Room) => {
      const next = buildParticipantsFromRoom(room);
      setParticipants(next);
      core.voice.setParticipants(
        next.map((participant) => ({
          userId: participant.userId,
          displayName: participant.displayName,
          avatarUrl: participant.avatarUrl ?? null,
          isSpeaking: participant.isSpeaking ?? false,
        })),
      );
    },
    [buildParticipantsFromRoom, core.voice],
  );

  const applyRemoteVolumes = useCallback(
    (room: Room, volumes: Record<string, number>, deafened: boolean) => {
      room.remoteParticipants.forEach((participant) => {
        const volume = deafened
          ? 0
          : (volumes[participant.identity] ?? 100) / 100;
        participant.setVolume(volume, Track.Source.Microphone);
      });
    },
    [],
  );

  const refreshAudioOutputs = useCallback(async () => {
    try {
      const rawOutputs = await AudioSession.getAudioOutputs();
      const ids = Array.from(new Set(["default", ...rawOutputs]));
      setOutputDevices(ids.map((id) => ({ id, label: formatOutputLabel(id) })));
    } catch {
      setOutputDevices([{ id: "default", label: "Auto" }]);
    }
  }, []);

  const stopInputLevelPolling = useCallback(() => {
    if (inputLevelIntervalRef.current) {
      clearInterval(inputLevelIntervalRef.current);
      inputLevelIntervalRef.current = null;
    }
    setLocalInputLevel(0);
    setVoiceActivityGateOpen(false);
  }, []);

  const startInputLevelPolling = useCallback(() => {
    stopInputLevelPolling();
    inputLevelIntervalRef.current = setInterval(() => {
      const room = roomRef.current;
      if (!room) return;
      const level = Math.max(
        0,
        Math.min(1, room.localParticipant.audioLevel ?? 0),
      );
      const threshold = Math.max(
        0,
        Math.min(1, voiceSettingsRef.current.voiceActivationThreshold / 100),
      );
      const now = Date.now();
      if (level >= threshold) {
        lastVoiceActivityAtRef.current = now;
      }
      const gateOpen =
        level >= threshold ||
        now - lastVoiceActivityAtRef.current <= VOICE_ACTIVITY_GATE_RELEASE_MS;
      setLocalInputLevel((previous) =>
        Math.abs(previous - level) > 0.01 ? level : previous,
      );
      setVoiceActivityGateOpen((previous) =>
        previous === gateOpen ? previous : gateOpen,
      );
    }, INPUT_LEVEL_INTERVAL_MS);
  }, [stopInputLevelPolling]);

  const cleanupVoiceSession = useCallback(async () => {
    const room = roomRef.current;
    joinGenerationRef.current += 1;
    intentionalDisconnectRef.current = true;
    stopInputLevelPolling();
    setJoining(false);
    setError(null);
    setNotice(null);
    setParticipants([]);
    core.voice.setParticipants([]);
    core.voice.setVoiceConnected(false);
    core.voice.setJoined(false);
    core.voice.setSessionState({
      joined: false,
      isMuted: core.voice.getSnapshot().isMuted,
      isDeafened: core.voice.getSnapshot().isDeafened,
    });
    try {
      await core.voice.disconnectKickChannel();
    } catch {
      // The kick channel is best-effort cleanup.
    }
    try {
      await core.voice.disconnectPresenceChannel();
    } catch {
      // Presence cleanup is best-effort; Supabase also removes presence on socket close.
    }
    try {
      room?.disconnect();
    } catch {
      // Ignore disconnect races.
    }
    try {
      await AudioSession.stopAudioSession();
    } catch {
      // Native audio session might already be stopped.
    }
    await stopVoiceForegroundService();
    setConnectionState(ConnectionState.Disconnected);
    intentionalDisconnectRef.current = false;
  }, [core.voice, stopInputLevelPolling]);

  const joinVoiceChannel = useCallback(async () => {
    const targetChannel = activeChannelRef.current;
    const user = currentUserRef.current;
    if (
      !targetChannel ||
      !user.id ||
      joining ||
      core.voice.getSnapshot().joined
    ) {
      return;
    }

    setJoining(true);
    setError(null);
    setNotice(null);
    intentionalDisconnectRef.current = false;
    const joinGeneration = (joinGenerationRef.current += 1);
    const timer = createVoiceJoinTimer(targetChannel.channelName);
    timer.mark("start", { channelId: targetChannel.channelId });

    try {
      await ensureAndroidVoicePermissions();
      timer.mark("permissions ready");

      const credentialsPromise = core.voice
        .fetchJoinCredentials(
          targetChannel.communityId,
          targetChannel.channelId,
        )
        .then((credentials) => {
          timer.mark("token ready");
          return credentials;
        });
      void credentialsPromise.catch(() => {});
      timer.mark("token request started");

      await AudioSession.configureAudio({
        android: {
          preferredOutputList: ["bluetooth", "headset", "speaker", "earpiece"],
          audioTypeOptions: AndroidAudioTypePresets.communication,
        },
        ios: { defaultOutput: "speaker" },
      });
      timer.mark("audio configured");
      await AudioSession.startAudioSession();
      timer.mark("audio session started");
      await refreshAudioOutputs();
      timer.mark("audio outputs refreshed");
      await startVoiceForegroundService(targetChannel.channelName);
      timer.mark("foreground service ready");

      const room = roomRef.current ?? createRoom();
      roomRef.current = room;
      const { token, serverUrl } = await credentialsPromise;

      timer.mark("room connect started");
      await room.connect(serverUrl, token, { autoSubscribe: true });
      timer.mark("room connected");

      void room.localParticipant
        .setMetadata(JSON.stringify({ avatarUrl: user.avatarUrl ?? null }))
        .then(() => {
          timer.mark("local metadata set");
        })
        .catch((metadataError: unknown) => {
          timer.mark("local metadata failed", {
            message: getErrorMessage(metadataError, "Unknown metadata error."),
          });
        });
      timer.mark("local metadata queued");
      await room.localParticipant.setMicrophoneEnabled(true);
      timer.mark("microphone enabled");
      if (selectedOutputDeviceId !== "default" || Platform.OS === "ios") {
        await AudioSession.selectAudioOutput(selectedOutputDeviceId).catch(
          () => {},
        );
      }
      timer.mark("audio output selected");

      core.voice.setJoined(true);
      core.voice.setVoiceConnected(true);
      core.voice.markConnected();
      core.voice.setSessionState({
        joined: true,
        isMuted: core.voice.getSnapshot().isMuted,
        isDeafened: core.voice.getSnapshot().isDeafened,
      });
      applyParticipants(room);
      startInputLevelPolling();
      timer.mark("joined");

      void core.voice
        .connectPresenceChannel({
          communityId: targetChannel.communityId,
          channelId: targetChannel.channelId,
          currentUserId: user.id,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl ?? null,
        })
        .then(() => {
          timer.mark("presence published");
        })
        .catch((presenceError) => {
          console.warn("[voice] Failed to publish voice presence.", presenceError);
          timer.mark("presence publish failed", {
            message: getErrorMessage(
              presenceError,
              "Failed to publish voice presence.",
            ),
          });
        });

      void core.voice
        .connectKickChannel({
          communityId: targetChannel.communityId,
          channelId: targetChannel.channelId,
          currentUserId: user.id,
          onKick: (payload) => onVoiceKickRef.current?.(payload),
        })
        .then(() => {
          const currentChannel = activeChannelRef.current;
          if (
            joinGenerationRef.current !== joinGeneration ||
            currentChannel?.communityId !== targetChannel.communityId ||
            currentChannel?.channelId !== targetChannel.channelId
          ) {
            return;
          }
        })
        .catch((controlError) => {
          const currentChannel = activeChannelRef.current;
          if (
            joinGenerationRef.current !== joinGeneration ||
            currentChannel?.communityId !== targetChannel.communityId ||
            currentChannel?.channelId !== targetChannel.channelId
          ) {
            return;
          }
          console.warn(
            "[voice] Voice control channel failed after join.",
            controlError,
          );
          void cleanupVoiceSession().then(() => {
            core.voice.setError(VOICE_CONTROL_CHANNEL_FAILURE_MESSAGE);
            setError(VOICE_CONTROL_CHANNEL_FAILURE_MESSAGE);
            onSessionErrorRef.current?.(VOICE_CONTROL_CHANNEL_FAILURE_MESSAGE);
          });
        });
    } catch (joinError) {
      const message = getErrorMessage(
        joinError,
        "Failed to join voice channel.",
      );
      timer.mark("failed", { message });
      core.voice.setError(message);
      await cleanupVoiceSession();
      setError(message);
      onSessionErrorRef.current?.(message);
    } finally {
      setJoining(false);
    }
  }, [
    applyParticipants,
    cleanupVoiceSession,
    core.voice,
    joining,
    refreshAudioOutputs,
    selectedOutputDeviceId,
    startInputLevelPolling,
  ]);

  const toggleMute = useCallback(() => {
    const next = !core.voice.getSnapshot().isMuted;
    core.voice.setIsMuted(next);
    playVoiceControlFeedback(next);
  }, [core.voice]);

  const toggleDeafen = useCallback(() => {
    const next = !core.voice.getSnapshot().isDeafened;
    core.voice.setIsDeafened(next);
    playVoiceControlFeedback(next);
  }, [core.voice]);

  const updateVoiceSettingsPatch = useCallback(
    (patch: Partial<VoiceSettings>) => {
      onUpdateVoiceSettingsRef.current(patch);
    },
    [],
  );

  const setOutputDevice = useCallback(
    (deviceId: string) => {
      setSelectedOutputDeviceId(deviceId);
      onUpdateVoiceSettingsRef.current({ preferredOutputDeviceId: deviceId });
      if (!core.voice.getSnapshot().joined) return;
      if (deviceId === "default" && Platform.OS !== "ios") return;
      void AudioSession.selectAudioOutput(deviceId).catch((outputError) => {
        console.warn("[voice] Failed to select audio output.", outputError);
      });
    },
    [core.voice],
  );

  const showSystemRoutePicker = useCallback(() => {
    if (Platform.OS !== "ios") return;
    void AudioSession.showAudioRoutePicker().catch((routeError) => {
      console.warn("[voice] Failed to show audio route picker.", routeError);
    });
  }, []);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
    setSelectedOutputDeviceId(
      voiceSettings.preferredOutputDeviceId || "default",
    );
  }, [voiceSettings]);

  useEffect(() => {
    onUpdateVoiceSettingsRef.current = onUpdateVoiceSettings;
    onSessionErrorRef.current = onSessionError;
    onVoiceKickRef.current = onVoiceKick;
  }, [onSessionError, onUpdateVoiceSettings, onVoiceKick]);

  useEffect(() => {
    currentUserRef.current = {
      id: currentUserId,
      displayName: currentUserDisplayName,
      avatarUrl: currentUserAvatarUrl ?? null,
    };
  }, [currentUserAvatarUrl, currentUserDisplayName, currentUserId]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const handleConnectionStateChanged = (state: ConnectionState) => {
      setConnectionState(state);
      core.voice.setVoiceConnected(state === ConnectionState.Connected);
      if (state === ConnectionState.Connected) {
        core.voice.markConnected();
      }
    };
    const handleDisconnected = () => {
      setConnectionState(ConnectionState.Disconnected);
      core.voice.setVoiceConnected(false);
      if (!intentionalDisconnectRef.current) {
        core.voice.setJoined(false);
        setNotice("Voice disconnected.");
      }
    };
    const syncParticipants = () => applyParticipants(room);

    room
      .on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged)
      .on(RoomEvent.Disconnected, handleDisconnected)
      .on(RoomEvent.ParticipantConnected, syncParticipants)
      .on(RoomEvent.ParticipantDisconnected, syncParticipants)
      .on(RoomEvent.TrackSubscribed, syncParticipants)
      .on(RoomEvent.TrackUnsubscribed, syncParticipants)
      .on(RoomEvent.TrackMuted, syncParticipants)
      .on(RoomEvent.TrackUnmuted, syncParticipants)
      .on(RoomEvent.ActiveSpeakersChanged, syncParticipants)
      .on(RoomEvent.ParticipantMetadataChanged, syncParticipants)
      .on(RoomEvent.ParticipantNameChanged, syncParticipants);

    return () => {
      room
        .off(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged)
        .off(RoomEvent.Disconnected, handleDisconnected)
        .off(RoomEvent.ParticipantConnected, syncParticipants)
        .off(RoomEvent.ParticipantDisconnected, syncParticipants)
        .off(RoomEvent.TrackSubscribed, syncParticipants)
        .off(RoomEvent.TrackUnsubscribed, syncParticipants)
        .off(RoomEvent.TrackMuted, syncParticipants)
        .off(RoomEvent.TrackUnmuted, syncParticipants)
        .off(RoomEvent.ActiveSpeakersChanged, syncParticipants)
        .off(RoomEvent.ParticipantMetadataChanged, syncParticipants)
        .off(RoomEvent.ParticipantNameChanged, syncParticipants);
    };
  }, [applyParticipants, core.voice]);

  useEffect(() => {
    if (!joined) return;
    const room = roomRef.current;
    if (!room) return;
    const baseAllowsSend = !isMuted && !isDeafened;
    const shouldSend =
      baseAllowsSend &&
      (voiceSettings.transmissionMode === "open_mic" || voiceActivityGateOpen);

    room.localParticipant.audioTrackPublications.forEach((publication) => {
      const track = publication.audioTrack?.mediaStreamTrack;
      if (track) track.enabled = shouldSend;
    });
  }, [
    isDeafened,
    isMuted,
    joined,
    voiceActivityGateOpen,
    voiceSettings.transmissionMode,
  ]);

  useEffect(() => {
    if (!joined) return;
    const room = roomRef.current;
    if (!room) return;
    applyRemoteVolumes(room, remoteVolumes, isDeafened);
  }, [applyRemoteVolumes, isDeafened, joined, remoteVolumes]);

  useEffect(() => {
    core.voice.setSessionState({ joined, isMuted, isDeafened });
  }, [core.voice, isDeafened, isMuted, joined]);

  const activeChannelKey = activeChannel
    ? `${activeChannel.communityId}:${activeChannel.channelId}`
    : null;

  useEffect(() => {
    if (previousChannelKeyRef.current === activeChannelKey) return;
    previousChannelKeyRef.current = activeChannelKey;

    let cancelled = false;
    const syncChannel = async () => {
      await cleanupVoiceSession();
      if (cancelled || !activeChannelRef.current || !currentUserRef.current.id)
        return;
      await joinVoiceChannel();
    };

    void syncChannel();
    return () => {
      cancelled = true;
    };
  }, [activeChannelKey, cleanupVoiceSession, joinVoiceChannel]);

  useEffect(() => {
    return () => {
      void cleanupVoiceSession();
    };
  }, [cleanupVoiceSession]);

  return {
    state: {
      activeChannel,
      joined,
      joining,
      participants,
      isMuted,
      isDeafened,
      error,
      notice,
      localInputLevel,
      voiceActivityGateOpen,
      remoteVolumes,
      outputDevices,
      selectedOutputDeviceId,
      supportsOutputSelection: outputDevices.length > 0,
      connectionState,
    },
    actions: {
      joinVoiceChannel,
      leaveVoiceChannel: cleanupVoiceSession,
      toggleMute,
      toggleDeafen,
      updateVoiceSettingsPatch,
      setMemberVolume,
      resetMemberVolume,
      resetAllMemberVolumes,
      getMemberVolume,
      setOutputDevice,
      showSystemRoutePicker,
    },
    livekitRoom: roomRef.current!,
  };
}
