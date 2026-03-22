import React from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@shared/lib/supabase';
import { fetchIceConfig } from '@shared/lib/voice/ice';
import { matchesVoicePushToTalkBinding } from '@shared/lib/voice/pushToTalk';
import { useVoiceMemberVolumes } from '@client/features/voice/hooks/useVoiceMemberVolumes';
import { isEditableKeyboardTarget } from '@client/app/utils';
import { playVoicePresenceSound } from '@shared/lib/notifications/sound';
import { getErrorMessage } from '@platform/lib/errors';
import { useVoiceStore } from '@shared/stores/voiceStore';
import type {
  NotificationAudioSettings,
  VoiceSettings,
} from '@platform/desktop/types';
import type {
  VoiceControllerChannel,
  VoiceParticipant,
  VoicePeerDiagnostics,
  VoiceSessionControllerActions,
  VoiceSessionControllerState,
} from '@client/features/voice/types';

type VoiceSignalEvent = 'offer' | 'answer' | 'ice';

type VoiceSignalPayload = {
  type: VoiceSignalEvent;
  from: string;
  senderSessionId: string;
  targetSessionId?: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type VoicePresencePayload = {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  muted: boolean;
  deafened: boolean;
  is_speaking?: boolean;
  joined_at: string;
};

type RTCStatsRecord = RTCStats & Record<string, unknown>;

type UseVoiceSessionControllerInput = {
  activeChannel: VoiceControllerChannel | null;
  currentUserId: string | null | undefined;
  currentUserDisplayName: string;
  currentUserAvatarUrl?: string | null;
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
    }>
  ) => void;
  onConnectionChange?: (connected: boolean) => void;
  onSessionStateChange?: (state: {
    joined: boolean;
    isMuted: boolean;
    isDeafened: boolean;
  }) => void;
  onControlActionsReady?: (
    actions:
      | {
          join: () => void;
          leave: () => void;
          toggleMute: () => void;
          toggleDeafen: () => void;
        }
      | null
  ) => void;
  onSessionError?: (message: string) => void;
};

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  },
];

const VOICE_ACTIVITY_GATE_RELEASE_MS = 220;

const isAudioInput = (device: MediaDeviceInfo) => device.kind === 'audioinput';
const isAudioOutput = (device: MediaDeviceInfo) =>
  device.kind === 'audiooutput';
const hasSelectableDeviceId = (device: MediaDeviceInfo) =>
  device.deviceId.trim().length > 0;

export function useVoiceSessionController({
  activeChannel,
  currentUserId,
  currentUserDisplayName,
  currentUserAvatarUrl,
  voiceSettings,
  notificationAudioSettings,
  showDiagnostics = false,
  onUpdateVoiceSettings,
  onParticipantsChange,
  onConnectionChange,
  onSessionStateChange,
  onControlActionsReady,
  onSessionError,
}: UseVoiceSessionControllerInput): {
  state: VoiceSessionControllerState;
  actions: VoiceSessionControllerActions;
} {
  const joined = useVoiceStore((state) => state.joined);
  const [joining, setJoining] = React.useState(false);
  const [participants, setParticipants] = React.useState<VoiceParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = React.useState<
    Record<string, MediaStream>
  >({});
  const isMuted = useVoiceStore((state) => state.isMuted);
  const isDeafened = useVoiceStore((state) => state.isDeafened);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [iceSource, setIceSource] = React.useState<
    'xirsys' | 'fallback' | null
  >(null);
  const [inputDevices, setInputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = React.useState<MediaDeviceInfo[]>(
    []
  );
  const [selectedInputDeviceId, setSelectedInputDeviceId] = React.useState(
    voiceSettings.preferredInputDeviceId || 'default'
  );
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = React.useState(
    voiceSettings.preferredOutputDeviceId || 'default'
  );
  const [switchingInput, setSwitchingInput] = React.useState(false);
  const [supportsOutputSelection, setSupportsOutputSelection] =
    React.useState(false);
  const [localInputLevel, setLocalInputLevel] = React.useState(0);
  const [voiceActivityGateOpen, setVoiceActivityGateOpen] =
    React.useState(false);
  const [pushToTalkPressed, setPushToTalkPressed] = React.useState(false);
  const [peerDiagnostics, setPeerDiagnostics] = React.useState<
    Record<string, VoicePeerDiagnostics>
  >({});
  const [diagnosticsUpdatedAt, setDiagnosticsUpdatedAt] = React.useState<
    string | null
  >(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = React.useState(false);

  const channelRef = React.useRef<RealtimeChannel | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const peersRef = React.useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidatesRef = React.useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  );
  const audioElementRefs = React.useRef<Record<string, HTMLAudioElement | null>>(
    {}
  );
  const iceServersRef = React.useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);
  const signalingSessionIdRef = React.useRef<string | null>(null);
  const localInputMonitorAudioContextRef = React.useRef<AudioContext | null>(
    null
  );
  const localInputMonitorSourceNodeRef =
    React.useRef<MediaStreamAudioSourceNode | null>(null);
  const localInputMonitorAnalyserNodeRef =
    React.useRef<AnalyserNode | null>(null);
  const localInputMonitorTimeDomainRef =
    React.useRef<Uint8Array<ArrayBuffer> | null>(null);
  const localInputMonitorRafIdRef = React.useRef<number | null>(null);
  const localInputMonitorActiveRef = React.useRef(false);
  const lastVoiceActivityAtRef = React.useRef<number>(0);
  const activePushToTalkCodeRef = React.useRef<string | null>(null);
  const voiceSettingsRef = React.useRef(voiceSettings);
  const notificationAudioSettingsRef = React.useRef(notificationAudioSettings);
  const previousRemoteParticipantIdsRef = React.useRef<Set<string>>(new Set());
  const hasPresenceSyncedOnceRef = React.useRef(false);
  const lastPresenceSoundAtRef = React.useRef(0);
  const previousChannelKeyRef = React.useRef<string | null>(null);
  const activeChannelRef = React.useRef<VoiceControllerChannel | null>(
    activeChannel
  );
  const joinVoiceChannelActionRef = React.useRef<(() => Promise<void>) | null>(
    null
  );
  const leaveVoiceChannelActionRef = React.useRef<(() => Promise<void>) | null>(
    null
  );
  const toggleMuteActionRef = React.useRef<(() => void) | null>(null);
  const toggleDeafenActionRef = React.useRef<(() => void) | null>(null);

  const setStoredJoined = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
      const previousValue = useVoiceStore.getState().joined;
      const nextValue =
        typeof value === 'function'
          ? (value as (previousState: boolean) => boolean)(previousValue)
          : value;
      useVoiceStore.getState().setJoined(nextValue);
    },
    []
  );

  const setStoredIsMuted = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
      const previousValue = useVoiceStore.getState().isMuted;
      const nextValue =
        typeof value === 'function'
          ? (value as (previousState: boolean) => boolean)(previousValue)
          : value;
      useVoiceStore.getState().setIsMuted(nextValue);
    },
    []
  );

  const setStoredIsDeafened = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
      const previousValue = useVoiceStore.getState().isDeafened;
      const nextValue =
        typeof value === 'function'
          ? (value as (previousState: boolean) => boolean)(previousValue)
          : value;
      useVoiceStore.getState().setIsDeafened(nextValue);
    },
    []
  );

  const setStoredParticipants = React.useCallback((nextParticipants: VoiceParticipant[]) => {
    useVoiceStore.getState().setParticipants(
      nextParticipants.map((participant) => ({
        userId: participant.userId,
        displayName: participant.displayName,
        avatarUrl: participant.avatarUrl ?? null,
        isSpeaking: participant.isSpeaking ?? false,
      }))
    );
  }, []);

  const activeChannelKey = activeChannel
    ? `${activeChannel.communityId}:${activeChannel.channelId}`
    : null;
  const remoteParticipantIds = React.useMemo(
    () => participants.map((participant) => participant.userId),
    [participants]
  );
  const {
    remoteVolumes,
    setMemberVolume,
    resetMemberVolume,
    resetAllMemberVolumes,
    getMemberVolume,
  } = useVoiceMemberVolumes(
    activeChannel?.communityId ?? 'voice',
    activeChannel?.channelId ?? 'inactive',
    remoteParticipantIds
  );
  const diagnosticsRows = React.useMemo(
    () =>
      Object.values(peerDiagnostics).sort((left, right) =>
        left.displayName.localeCompare(right.displayName)
      ),
    [peerDiagnostics]
  );

  const persistVoiceSettingsPatch = React.useCallback(
    (patch: Partial<VoiceSettings>) => {
      if (!onUpdateVoiceSettings) return;
      onUpdateVoiceSettings({
        ...voiceSettings,
        ...patch,
      });
    },
    [onUpdateVoiceSettings, voiceSettings]
  );

  const applySinkId = React.useCallback(
    async (audioElement: HTMLAudioElement) => {
      if (!supportsOutputSelection) return;
      const mediaElementWithSink = audioElement as HTMLAudioElement & {
        setSinkId?: (sinkId: string) => Promise<void>;
      };
      if (!mediaElementWithSink.setSinkId) return;

      try {
        await mediaElementWithSink.setSinkId(
          selectedOutputDeviceId || 'default'
        );
      } catch (sinkError) {
        console.error('Failed to set output device:', sinkError);
      }
    },
    [selectedOutputDeviceId, supportsOutputSelection]
  );

  const refreshAudioDevices = React.useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(
        (device) => isAudioInput(device) && hasSelectableDeviceId(device)
      );
      const audioOutputs = devices.filter(
        (device) => isAudioOutput(device) && hasSelectableDeviceId(device)
      );
      setInputDevices(audioInputs);
      setOutputDevices(audioOutputs);

      if (
        audioInputs.length > 0 &&
        !audioInputs.some((device) => device.deviceId === selectedInputDeviceId)
      ) {
        setSelectedInputDeviceId(audioInputs[0].deviceId);
      } else if (
        audioInputs.length === 0 &&
        selectedInputDeviceId !== 'default'
      ) {
        setSelectedInputDeviceId('default');
      }

      if (
        audioOutputs.length > 0 &&
        !audioOutputs.some((device) => device.deviceId === selectedOutputDeviceId)
      ) {
        setSelectedOutputDeviceId(audioOutputs[0].deviceId);
      } else if (
        audioOutputs.length === 0 &&
        selectedOutputDeviceId !== 'default'
      ) {
        setSelectedOutputDeviceId('default');
      }
    } catch (deviceError) {
      console.error('Failed to enumerate audio devices:', deviceError);
    }
  }, [selectedInputDeviceId, selectedOutputDeviceId]);

  const stopLocalInputMonitor = React.useCallback(async () => {
    localInputMonitorActiveRef.current = false;
    if (localInputMonitorRafIdRef.current != null) {
      window.cancelAnimationFrame(localInputMonitorRafIdRef.current);
      localInputMonitorRafIdRef.current = null;
    }

    localInputMonitorSourceNodeRef.current?.disconnect();
    localInputMonitorSourceNodeRef.current = null;
    localInputMonitorAnalyserNodeRef.current?.disconnect();
    localInputMonitorAnalyserNodeRef.current = null;
    localInputMonitorTimeDomainRef.current = null;

    if (localInputMonitorAudioContextRef.current) {
      try {
        await localInputMonitorAudioContextRef.current.close();
      } catch (monitorError) {
        console.warn(
          'Failed to close local input monitor audio context:',
          monitorError
        );
      }
      localInputMonitorAudioContextRef.current = null;
    }

    setLocalInputLevel(0);
    setVoiceActivityGateOpen(false);
  }, []);

  const startLocalInputMonitor = React.useCallback(
    async (stream: MediaStream | null) => {
      await stopLocalInputMonitor();
      if (!stream) return;

      const track = stream.getAudioTracks()[0];
      if (!track) return;

      const AudioContextCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextCtor) return;

      try {
        const audioContext = new AudioContextCtor();
        await audioContext.resume();

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);

        localInputMonitorAudioContextRef.current = audioContext;
        localInputMonitorSourceNodeRef.current = source;
        localInputMonitorAnalyserNodeRef.current = analyser;
        localInputMonitorTimeDomainRef.current = new Uint8Array(
          analyser.fftSize
        ) as Uint8Array<ArrayBuffer>;
        localInputMonitorActiveRef.current = true;

        const frame = (now: number) => {
          if (!localInputMonitorActiveRef.current) {
            localInputMonitorRafIdRef.current = null;
            return;
          }

          const analyserNode = localInputMonitorAnalyserNodeRef.current;
          const timeDomain = localInputMonitorTimeDomainRef.current;
          if (!analyserNode || !timeDomain) {
            localInputMonitorRafIdRef.current = null;
            return;
          }

          analyserNode.getByteTimeDomainData(timeDomain);

          let rmsAccumulator = 0;
          for (let index = 0; index < timeDomain.length; index += 1) {
            const centered = (timeDomain[index] - 128) / 128;
            rmsAccumulator += centered * centered;
          }
          const rms = Math.sqrt(rmsAccumulator / timeDomain.length);
          const normalizedLevel = Math.min(1, rms * 3);
          const threshold = Math.max(
            0,
            Math.min(1, voiceSettingsRef.current.voiceActivationThreshold / 100)
          );

          if (normalizedLevel >= threshold) {
            lastVoiceActivityAtRef.current = now;
          }

          const gateOpen =
            normalizedLevel >= threshold ||
            now - lastVoiceActivityAtRef.current <=
              VOICE_ACTIVITY_GATE_RELEASE_MS;

          setLocalInputLevel((previousLevel) =>
            Math.abs(previousLevel - normalizedLevel) > 0.01
              ? normalizedLevel
              : previousLevel
          );
          setVoiceActivityGateOpen((previousGateOpen) =>
            previousGateOpen === gateOpen ? previousGateOpen : gateOpen
          );

          localInputMonitorRafIdRef.current = window.requestAnimationFrame(frame);
        };

        localInputMonitorRafIdRef.current = window.requestAnimationFrame(frame);
      } catch (monitorError) {
        console.warn(
          'Failed to start local input monitor for voice activity gating:',
          monitorError
        );
        void stopLocalInputMonitor();
      }
    },
    [stopLocalInputMonitor]
  );

  const closePeerConnection = React.useCallback((remoteUserId: string) => {
    const peerConnection = peersRef.current.get(remoteUserId);
    if (!peerConnection) return;

    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.oniceconnectionstatechange = null;
    peerConnection.onsignalingstatechange = null;
    peerConnection.onicegatheringstatechange = null;
    peerConnection.close();
    peersRef.current.delete(remoteUserId);
    pendingIceCandidatesRef.current.delete(remoteUserId);

    setRemoteStreams((previousStreams) => {
      if (!(remoteUserId in previousStreams)) return previousStreams;
      const nextStreams = { ...previousStreams };
      delete nextStreams[remoteUserId];
      return nextStreams;
    });

    setPeerDiagnostics((previousDiagnostics) => {
      if (!(remoteUserId in previousDiagnostics)) {
        return previousDiagnostics;
      }
      const nextDiagnostics = { ...previousDiagnostics };
      delete nextDiagnostics[remoteUserId];
      return nextDiagnostics;
    });
  }, []);

  const flushPendingIceCandidates = React.useCallback(
    async (remoteUserId: string, peerConnection: RTCPeerConnection) => {
      const pendingCandidates = pendingIceCandidatesRef.current.get(remoteUserId);
      if (!pendingCandidates || pendingCandidates.length === 0) return;

      for (const candidate of pendingCandidates) {
        try {
          await peerConnection.addIceCandidate(candidate);
        } catch (iceError) {
          console.error('Failed to apply buffered ICE candidate:', iceError);
        }
      }

      pendingIceCandidatesRef.current.delete(remoteUserId);
    },
    []
  );

  const sendSignal = React.useCallback(
    async (payload: Omit<VoiceSignalPayload, 'from' | 'senderSessionId'>) => {
      const channel = channelRef.current;
      const sessionId = signalingSessionIdRef.current;
      if (!channel || !sessionId || !currentUserId) return;

      const sendStatus = await channel.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: {
          ...payload,
          from: currentUserId,
          senderSessionId: sessionId,
        },
      });

      if (sendStatus !== 'ok') {
        console.error('Failed to send WebRTC signal:', sendStatus);
      }
    },
    [currentUserId]
  );

  const refreshVoiceDiagnostics = React.useCallback(async () => {
    if (!showDiagnostics) return;

    const peerEntries = Array.from(peersRef.current.entries());
    setDiagnosticsLoading(true);

    try {
      if (peerEntries.length === 0) {
        setPeerDiagnostics({});
        setDiagnosticsUpdatedAt(new Date().toISOString());
        return;
      }

      const rows = await Promise.all(
        peerEntries.map(async ([remoteUserId, peerConnection]) => {
          let selectedCandidatePairId: string | null = null;
          let selectedCandidatePairState: string | null = null;
          let localCandidateType: string | null = null;
          let remoteCandidateType: string | null = null;
          let writable: boolean | null = null;
          let bytesSent: number | null = null;
          let bytesReceived: number | null = null;

          try {
            const stats = await peerConnection.getStats();
            const statsById = new Map<string, RTCStatsRecord>();

            stats.forEach((report) => {
              const statsRecord = report as RTCStatsRecord;
              statsById.set(statsRecord.id, statsRecord);

              if (
                !selectedCandidatePairId &&
                statsRecord.type === 'transport' &&
                typeof statsRecord.selectedCandidatePairId === 'string'
              ) {
                selectedCandidatePairId = statsRecord.selectedCandidatePairId;
              }

              if (
                !selectedCandidatePairId &&
                statsRecord.type === 'candidate-pair' &&
                statsRecord.selected === true
              ) {
                selectedCandidatePairId = statsRecord.id;
              }
            });

            if (selectedCandidatePairId) {
              const selectedPair = statsById.get(selectedCandidatePairId);
              if (selectedPair) {
                selectedCandidatePairState =
                  typeof selectedPair.state === 'string'
                    ? selectedPair.state
                    : null;
                writable =
                  typeof selectedPair.writable === 'boolean'
                    ? selectedPair.writable
                    : null;
                bytesSent =
                  typeof selectedPair.bytesSent === 'number'
                    ? selectedPair.bytesSent
                    : null;
                bytesReceived =
                  typeof selectedPair.bytesReceived === 'number'
                    ? selectedPair.bytesReceived
                    : null;

                const localCandidate =
                  typeof selectedPair.localCandidateId === 'string'
                    ? statsById.get(selectedPair.localCandidateId)
                    : null;
                const remoteCandidate =
                  typeof selectedPair.remoteCandidateId === 'string'
                    ? statsById.get(selectedPair.remoteCandidateId)
                    : null;

                localCandidateType =
                  localCandidate &&
                  typeof localCandidate.candidateType === 'string'
                    ? localCandidate.candidateType
                    : null;
                remoteCandidateType =
                  remoteCandidate &&
                  typeof remoteCandidate.candidateType === 'string'
                    ? remoteCandidate.candidateType
                    : null;
              }
            }
          } catch (statsError) {
            console.error('Failed to collect WebRTC stats:', statsError);
          }

          const participant = participants.find(
            (entry) => entry.userId === remoteUserId
          );

          return {
            userId: remoteUserId,
            displayName: participant?.displayName ?? remoteUserId.slice(0, 12),
            connectionState: peerConnection.connectionState,
            iceConnectionState: peerConnection.iceConnectionState,
            signalingState: peerConnection.signalingState,
            iceGatheringState: peerConnection.iceGatheringState,
            selectedCandidatePairId,
            selectedCandidatePairState,
            localCandidateType,
            remoteCandidateType,
            writable,
            bytesSent,
            bytesReceived,
          } satisfies VoicePeerDiagnostics;
        })
      );

      setPeerDiagnostics(
        rows.reduce<Record<string, VoicePeerDiagnostics>>((accumulator, row) => {
          accumulator[row.userId] = row;
          return accumulator;
        }, {})
      );
      setDiagnosticsUpdatedAt(new Date().toISOString());
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [participants, showDiagnostics]);

  const ensurePeerConnection = React.useCallback(
    (remoteUserId: string) => {
      const existing = peersRef.current.get(remoteUserId);
      if (existing) return existing;

      const peerConnection = new RTCPeerConnection({
        iceServers:
          iceServersRef.current.length > 0
            ? iceServersRef.current
            : FALLBACK_ICE_SERVERS,
        iceCandidatePoolSize: 10,
      });

      const localStream = localStreamRef.current;
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, localStream);
        });
      } else {
        peerConnection.addTransceiver('audio', { direction: 'recvonly' });
      }

      peerConnection.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);

        setRemoteStreams((previousStreams) => {
          if (previousStreams[remoteUserId] === stream) return previousStreams;
          return {
            ...previousStreams,
            [remoteUserId]: stream,
          };
        });
      };

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) return;

        void sendSignal({
          type: 'ice',
          to: remoteUserId,
          candidate: event.candidate.toJSON(),
        });
      };

      peerConnection.onconnectionstatechange = () => {
        if (
          peerConnection.connectionState === 'failed' ||
          peerConnection.connectionState === 'closed'
        ) {
          closePeerConnection(remoteUserId);
        } else if (showDiagnostics) {
          void refreshVoiceDiagnostics();
        }
      };
      peerConnection.oniceconnectionstatechange = () => {
        if (showDiagnostics) {
          void refreshVoiceDiagnostics();
        }
      };
      peerConnection.onsignalingstatechange = () => {
        if (showDiagnostics) {
          void refreshVoiceDiagnostics();
        }
      };
      peerConnection.onicegatheringstatechange = () => {
        if (showDiagnostics) {
          void refreshVoiceDiagnostics();
        }
      };

      peersRef.current.set(remoteUserId, peerConnection);
      return peerConnection;
    },
    [closePeerConnection, refreshVoiceDiagnostics, sendSignal, showDiagnostics]
  );

  const createAndSendOffer = React.useCallback(
    async (remoteUserId: string) => {
      const peerConnection = ensurePeerConnection(remoteUserId);
      if (peerConnection.signalingState !== 'stable') return;

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await sendSignal({
        type: 'offer',
        to: remoteUserId,
        sdp: offer,
      });
    },
    [ensurePeerConnection, sendSignal]
  );

  const handleSignal = React.useCallback(
    async (payload: VoiceSignalPayload) => {
      if (!payload || payload.from === currentUserId || !currentUserId) return;
      if (payload.to && payload.to !== currentUserId) return;

      const currentSessionId = signalingSessionIdRef.current;
      if (!currentSessionId) return;
      if (
        payload.targetSessionId &&
        payload.targetSessionId !== currentSessionId
      ) {
        return;
      }

      const remoteUserId = payload.from;
      const peerConnection = ensurePeerConnection(remoteUserId);

      try {
        if (payload.type === 'offer' && payload.sdp) {
          if (peerConnection.signalingState !== 'stable') {
            await peerConnection
              .setLocalDescription({ type: 'rollback' })
              .catch(() => undefined);
          }

          await peerConnection.setRemoteDescription(payload.sdp);
          await flushPendingIceCandidates(remoteUserId, peerConnection);

          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          await sendSignal({
            type: 'answer',
            to: remoteUserId,
            sdp: answer,
            targetSessionId: payload.senderSessionId,
          });
          return;
        }

        if (payload.type === 'answer' && payload.sdp) {
          await peerConnection.setRemoteDescription(payload.sdp);
          await flushPendingIceCandidates(remoteUserId, peerConnection);
          return;
        }

        if (payload.type === 'ice' && payload.candidate) {
          if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(payload.candidate);
          } else {
            const pendingCandidates =
              pendingIceCandidatesRef.current.get(remoteUserId) ?? [];
            pendingCandidates.push(payload.candidate);
            pendingIceCandidatesRef.current.set(
              remoteUserId,
              pendingCandidates
            );
          }
        }
      } catch (signalError) {
        console.error('Failed to handle WebRTC signal:', signalError);
      }
    },
    [
      currentUserId,
      ensurePeerConnection,
      flushPendingIceCandidates,
      sendSignal,
    ]
  );

  const reconcilePeerConnections = React.useCallback(
    (remoteUserIds: string[]) => {
      for (const existingRemoteId of peersRef.current.keys()) {
        if (!remoteUserIds.includes(existingRemoteId)) {
          closePeerConnection(existingRemoteId);
        }
      }

      for (const remoteUserId of remoteUserIds) {
        if (!peersRef.current.has(remoteUserId)) {
          ensurePeerConnection(remoteUserId);
          if ((currentUserId ?? '').localeCompare(remoteUserId) < 0) {
            void createAndSendOffer(remoteUserId);
          }
        }
      }
    },
    [closePeerConnection, createAndSendOffer, currentUserId, ensurePeerConnection]
  );

  const syncParticipantsFromPresence = React.useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !currentUserId) return;

    const presenceState = channel.presenceState() as Record<
      string,
      VoicePresencePayload[]
    >;
    const nextParticipants: VoiceParticipant[] = [];

    for (const [presenceKey, presenceRows] of Object.entries(presenceState)) {
      const latestPresence = presenceRows[presenceRows.length - 1];
      if (!latestPresence) continue;

      const userId = latestPresence.user_id ?? presenceKey;
      if (userId === currentUserId) continue;

      nextParticipants.push({
        userId,
        displayName: latestPresence.display_name ?? userId.slice(0, 12),
        avatarUrl: latestPresence.avatar_url ?? null,
        isSpeaking: Boolean(latestPresence.is_speaking),
        muted: Boolean(latestPresence.muted),
        deafened: Boolean(latestPresence.deafened),
      });
    }

    nextParticipants.sort((left, right) =>
      left.displayName.localeCompare(right.displayName)
    );

    const nextParticipantIds = new Set(
      nextParticipants.map((participant) => participant.userId)
    );
    if (hasPresenceSyncedOnceRef.current) {
      const previousIds = previousRemoteParticipantIdsRef.current;
      let nextSoundEvent: 'voice_presence_join' | 'voice_presence_leave' | null =
        null;

      for (const participantId of nextParticipantIds) {
        if (!previousIds.has(participantId)) {
          nextSoundEvent = 'voice_presence_join';
          break;
        }
      }

      if (!nextSoundEvent) {
        for (const participantId of previousIds) {
          if (!nextParticipantIds.has(participantId)) {
            nextSoundEvent = 'voice_presence_leave';
            break;
          }
        }
      }

      if (nextSoundEvent) {
        const now = Date.now();
        if (now - lastPresenceSoundAtRef.current >= 900) {
          lastPresenceSoundAtRef.current = now;
          void playVoicePresenceSound({
            event: nextSoundEvent,
            audioSettings: notificationAudioSettingsRef.current,
          });
        }
      }
    }

    previousRemoteParticipantIdsRef.current = nextParticipantIds;
    hasPresenceSyncedOnceRef.current = true;

    setParticipants(nextParticipants);
    reconcilePeerConnections(
      nextParticipants.map((participant) => participant.userId)
    );
  }, [currentUserId, reconcilePeerConnections]);

  const trackPresenceState = React.useCallback(async () => {
    const channel = channelRef.current;
    if (!channel || !joined || !currentUserId) return;

    const payload: VoicePresencePayload = {
      user_id: currentUserId,
      display_name: currentUserDisplayName,
      avatar_url: currentUserAvatarUrl ?? null,
      muted: isMuted,
      deafened: isDeafened,
      is_speaking:
        voiceSettings.transmissionMode !== 'push_to_talk'
          ? !isMuted && !isDeafened && voiceActivityGateOpen
          : !isMuted && !isDeafened && pushToTalkPressed,
      joined_at: new Date().toISOString(),
    };

    const trackStatus = await channel.track(payload);
    if (trackStatus !== 'ok') {
      console.error('Failed to update voice presence:', trackStatus);
    }
  }, [
    currentUserAvatarUrl,
    currentUserDisplayName,
    currentUserId,
    isDeafened,
    isMuted,
    joined,
    pushToTalkPressed,
    voiceActivityGateOpen,
    voiceSettings.transmissionMode,
  ]);

  const requestLocalAudioStream = React.useCallback(async (deviceId: string) => {
    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    };
    if (deviceId && deviceId !== 'default') {
      constraints.deviceId = { exact: deviceId };
    }

    return navigator.mediaDevices.getUserMedia({ audio: constraints });
  }, []);

  const applyLocalTrackState = React.useCallback(() => {
    const localStream = localStreamRef.current;
    if (!localStream) return;

    const baseAllowsSend = !isMuted && !isDeafened;
    let modeAllowsSend = true;

    if (baseAllowsSend) {
      switch (voiceSettingsRef.current.transmissionMode) {
        case 'push_to_talk':
          modeAllowsSend =
            Boolean(voiceSettingsRef.current.pushToTalkBinding) &&
            pushToTalkPressed;
          break;
        case 'voice_activity':
          modeAllowsSend = voiceActivityGateOpen;
          break;
        case 'open_mic':
        default:
          modeAllowsSend = true;
          break;
      }
    }

    const shouldSendAudio = baseAllowsSend && modeAllowsSend;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = shouldSendAudio;
    });
  }, [isDeafened, isMuted, pushToTalkPressed, voiceActivityGateOpen]);

  const applyOutgoingTrackToPeers = React.useCallback(
    async (stream: MediaStream, renegotiate: boolean) => {
      const nextTrack = stream.getAudioTracks()[0];
      if (!nextTrack) {
        throw new Error('Selected input device has no audio track.');
      }

      const shouldSendAudio = !isMuted && !isDeafened;
      nextTrack.enabled = shouldSendAudio;

      const previousStream = localStreamRef.current;
      localStreamRef.current = stream;
      await startLocalInputMonitor(stream);

      for (const [remoteUserId, peerConnection] of peersRef.current.entries()) {
        const audioSender = peerConnection
          .getSenders()
          .find((sender) => !sender.track || sender.track.kind === 'audio');

        if (audioSender) {
          const audioTransceiver = peerConnection
            .getTransceivers()
            .find((transceiver) => transceiver.sender === audioSender);
          if (
            audioTransceiver &&
            (audioTransceiver.direction === 'recvonly' ||
              audioTransceiver.direction === 'inactive')
          ) {
            audioTransceiver.direction = 'sendrecv';
          }
          await audioSender.replaceTrack(nextTrack);
        } else {
          peerConnection.addTrack(nextTrack, stream);
        }

        if (renegotiate && peerConnection.signalingState === 'stable') {
          await createAndSendOffer(remoteUserId);
        }
      }

      if (previousStream) {
        previousStream.getTracks().forEach((track) => track.stop());
      }
    },
    [createAndSendOffer, isDeafened, isMuted, startLocalInputMonitor]
  );

  const cleanupVoiceSession = React.useCallback(async () => {
    const channel = channelRef.current;
    channelRef.current = null;
    signalingSessionIdRef.current = null;

    for (const remoteUserId of Array.from(peersRef.current.keys())) {
      closePeerConnection(remoteUserId);
    }
    peersRef.current.clear();
    pendingIceCandidatesRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    await stopLocalInputMonitor();

    setParticipants([]);
    setStoredParticipants([]);
    setRemoteStreams({});
    setPeerDiagnostics({});
    setStoredJoined(false);
    setJoining(false);
    setStoredIsMuted(false);
    setStoredIsDeafened(false);
    setError(null);
    setNotice(null);
    setIceSource(null);
    setDiagnosticsUpdatedAt(null);
    setLocalInputLevel(0);
    setVoiceActivityGateOpen(false);
    setPushToTalkPressed(false);
    activePushToTalkCodeRef.current = null;
    previousRemoteParticipantIdsRef.current = new Set();
    hasPresenceSyncedOnceRef.current = false;

    if (channel) {
      try {
        await channel.untrack();
      } catch {
        // no-op
      }
      await supabase.removeChannel(channel);
    }
  }, [closePeerConnection, setStoredIsDeafened, setStoredIsMuted, setStoredJoined, setStoredParticipants, stopLocalInputMonitor]);

  const joinVoiceChannel = React.useCallback(
    async (targetChannel: VoiceControllerChannel | null = activeChannel) => {
      if (!targetChannel || !currentUserId) return;
      if (joining || joined) return;

      setJoining(true);
      setError(null);
      setNotice(null);
      setStoredIsMuted(false);
      setStoredIsDeafened(false);
      signalingSessionIdRef.current = crypto.randomUUID();

      const iceConfig = await fetchIceConfig({
        communityId: targetChannel.communityId,
        channelId: targetChannel.channelId,
      });
      if (iceConfig.blockedReason) {
        setJoining(false);
        onSessionError?.(iceConfig.blockedReason);
        return;
      }

      iceServersRef.current =
        iceConfig.iceServers.length > 0
          ? iceConfig.iceServers
          : FALLBACK_ICE_SERVERS;
      setIceSource(iceConfig.source);
      if (iceConfig.warning) {
        setNotice(iceConfig.warning);
      }

      let localStream: MediaStream | null = null;

      try {
        localStream = await requestLocalAudioStream(selectedInputDeviceId);
      } catch (mediaError) {
        console.error(
          'Microphone permission failed during voice join:',
          mediaError
        );
        setNotice(
          'Microphone access unavailable. Joined with microphone disabled.'
        );
      }

      localStreamRef.current = localStream;
      await startLocalInputMonitor(localStream);
      if (localStream) {
        const shouldSendAudio = !isMuted && !isDeafened;
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = shouldSendAudio;
        });
      }

      await refreshAudioDevices();

      const voiceChannel = supabase.channel(
        `voice:presence:${targetChannel.communityId}:${targetChannel.channelId}`,
        {
          config: {
            presence: { key: currentUserId },
          },
        }
      );

      voiceChannel
        .on('presence', { event: 'sync' }, syncParticipantsFromPresence)
        .on('presence', { event: 'join' }, syncParticipantsFromPresence)
        .on('presence', { event: 'leave' }, syncParticipantsFromPresence)
        .on('broadcast', { event: 'webrtc-signal' }, ({ payload }) => {
          void handleSignal(payload as VoiceSignalPayload);
        });

      channelRef.current = voiceChannel;

      try {
        await new Promise<void>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            reject(new Error('Timed out connecting to voice.'));
          }, 12000);

          voiceChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              window.clearTimeout(timeoutId);
              setStoredJoined(true);
              await trackPresenceState();
              resolve();
            } else if (status === 'CHANNEL_ERROR') {
              window.clearTimeout(timeoutId);
              reject(new Error('Voice channel connection failed.'));
            } else if (status === 'TIMED_OUT') {
              window.clearTimeout(timeoutId);
              reject(new Error('Voice channel connection timed out.'));
            }
          });
        });
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
      cleanupVoiceSession,
      currentUserId,
      handleSignal,
      isDeafened,
      isMuted,
      joined,
      joining,
      onSessionError,
      refreshAudioDevices,
      requestLocalAudioStream,
      selectedInputDeviceId,
      setStoredIsDeafened,
      setStoredIsMuted,
      setStoredJoined,
      startLocalInputMonitor,
      syncParticipantsFromPresence,
      trackPresenceState,
    ]
  );

  const switchInputDevice = React.useCallback(
    async (deviceId: string) => {
      setSelectedInputDeviceId(deviceId);
      persistVoiceSettingsPatch({ preferredInputDeviceId: deviceId });
      if (!joined) return;

      setSwitchingInput(true);
      setError(null);
      try {
        const newStream = await requestLocalAudioStream(deviceId);
        await applyOutgoingTrackToPeers(newStream, false);
      } catch (switchError: unknown) {
        console.error('Failed to switch input device:', switchError);
        setError(getErrorMessage(switchError, 'Failed to switch input device.'));
      } finally {
        setSwitchingInput(false);
      }
    },
    [
      applyOutgoingTrackToPeers,
      joined,
      persistVoiceSettingsPatch,
      requestLocalAudioStream,
    ]
  );

  const setOutputDevice = React.useCallback(
    (deviceId: string) => {
      setSelectedOutputDeviceId(deviceId);
      persistVoiceSettingsPatch({ preferredOutputDeviceId: deviceId });
    },
    [persistVoiceSettingsPatch]
  );

  const retryIce = React.useCallback(async () => {
    for (const [remoteUserId, peerConnection] of peersRef.current.entries()) {
      if (typeof peerConnection.restartIce === 'function') {
        peerConnection.restartIce();
      }
      if (peerConnection.signalingState === 'stable') {
        await createAndSendOffer(remoteUserId);
      }
    }
  }, [createAndSendOffer]);

  const toggleMute = React.useCallback(() => {
    setStoredIsMuted((previousMuted) => !previousMuted);
  }, [setStoredIsMuted]);

  const toggleDeafen = React.useCallback(() => {
    setStoredIsDeafened((previousDeafened) => {
      const nextDeafened = !previousDeafened;
      if (nextDeafened) {
        setStoredIsMuted(true);
      }
      return nextDeafened;
    });
  }, [setStoredIsDeafened, setStoredIsMuted]);

  const leaveVoiceChannel = React.useCallback(async () => {
    await cleanupVoiceSession();
  }, [cleanupVoiceSession]);

  const bindAudioElement = React.useCallback(
    (userId: string, element: HTMLAudioElement | null) => {
      audioElementRefs.current[userId] = element;
      if (!element) return;

      const nextRemoteStream = remoteStreams[userId] ?? null;
      element.srcObject = nextRemoteStream;
      element.muted = isDeafened;
      element.volume = (remoteVolumes[userId] ?? 100) / 100;
      void applySinkId(element);

      if (nextRemoteStream) {
        void element.play().catch((playError) => {
          const errorName = playError instanceof Error ? playError.name : '';
          if (errorName === 'AbortError') return;
          console.error('Failed to start remote audio playback:', playError);
        });
      }
    },
    [applySinkId, isDeafened, remoteStreams, remoteVolumes]
  );

  React.useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);

  React.useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  React.useEffect(() => {
    notificationAudioSettingsRef.current = notificationAudioSettings;
  }, [notificationAudioSettings]);

  React.useEffect(() => {
    setSupportsOutputSelection(
      typeof HTMLMediaElement !== 'undefined' &&
        'setSinkId' in HTMLMediaElement.prototype
    );
    void refreshAudioDevices();

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;

    const handleDeviceChange = () => {
      void refreshAudioDevices();
    };

    mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshAudioDevices]);

  React.useEffect(() => {
    const nextInputId = voiceSettings.preferredInputDeviceId || 'default';
    setSelectedInputDeviceId((previousInputId) =>
      previousInputId === nextInputId ? previousInputId : nextInputId
    );
  }, [voiceSettings.preferredInputDeviceId]);

  React.useEffect(() => {
    const nextOutputId = voiceSettings.preferredOutputDeviceId || 'default';
    setSelectedOutputDeviceId((previousOutputId) =>
      previousOutputId === nextOutputId ? previousOutputId : nextOutputId
    );
  }, [voiceSettings.preferredOutputDeviceId]);

  React.useEffect(() => {
    applyLocalTrackState();
    void trackPresenceState();
  }, [
    applyLocalTrackState,
    currentUserAvatarUrl,
    currentUserDisplayName,
    isDeafened,
    isMuted,
    joined,
    pushToTalkPressed,
    trackPresenceState,
    voiceActivityGateOpen,
    voiceSettings.pushToTalkBinding,
    voiceSettings.transmissionMode,
  ]);

  React.useEffect(() => {
    if (!localStreamRef.current) return;
    void startLocalInputMonitor(localStreamRef.current);
  }, [startLocalInputMonitor, voiceSettings.voiceActivationThreshold]);

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

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', clearPressed);
    document.addEventListener('visibilitychange', clearPressed);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', clearPressed);
      document.removeEventListener('visibilitychange', clearPressed);
      clearPressed();
    };
  }, [voiceSettings.pushToTalkBinding, voiceSettings.transmissionMode]);

  React.useEffect(() => {
    for (const [remoteUserId, audioElement] of Object.entries(
      audioElementRefs.current
    )) {
      if (!audioElement) continue;
      audioElement.muted = isDeafened;
      audioElement.volume = (remoteVolumes[remoteUserId] ?? 100) / 100;
      void applySinkId(audioElement);
    }
  }, [
    applySinkId,
    isDeafened,
    remoteStreams,
    remoteVolumes,
    selectedOutputDeviceId,
    supportsOutputSelection,
  ]);

  React.useEffect(() => {
    setStoredParticipants(participants);
  }, [participants, setStoredParticipants]);

  React.useEffect(() => {
    onConnectionChange?.(joined);
  }, [joined, onConnectionChange]);

  React.useEffect(() => {
    onSessionStateChange?.({
      joined,
      isMuted,
      isDeafened,
    });
  }, [isDeafened, isMuted, joined, onSessionStateChange]);

  React.useEffect(() => {
    if (!onParticipantsChange) return;
    if (!joined) {
      onParticipantsChange([]);
      return;
    }

    onParticipantsChange(
      participants.map((participant) => ({
        userId: participant.userId,
        displayName: participant.displayName,
        avatarUrl: participant.avatarUrl ?? null,
        isSpeaking: participant.isSpeaking ?? false,
      }))
    );
  }, [joined, onParticipantsChange, participants]);

  React.useEffect(() => {
    if (!showDiagnostics) {
      setPeerDiagnostics({});
      setDiagnosticsUpdatedAt(null);
      return;
    }
    if (!joined) return;

    void refreshVoiceDiagnostics();
    const intervalId = window.setInterval(() => {
      void refreshVoiceDiagnostics();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [joined, participants, refreshVoiceDiagnostics, showDiagnostics]);

  React.useEffect(() => {
    const nextChannelKey = activeChannelKey;
    if (previousChannelKeyRef.current === nextChannelKey) return;
    previousChannelKeyRef.current = nextChannelKey;

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
  }, [
    activeChannelKey,
    cleanupVoiceSession,
    currentUserId,
  ]);

  React.useEffect(() => {
    return () => {
      void cleanupVoiceSession();
    };
  }, [cleanupVoiceSession]);

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
        const action = leaveVoiceChannelActionRef.current;
        if (action) void action();
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

  return {
    state: {
      activeChannel,
      joined,
      joining,
      participants,
      remoteStreams,
      isMuted,
      isDeafened,
      error,
      notice,
      iceSource,
      inputDevices,
      outputDevices,
      selectedInputDeviceId,
      selectedOutputDeviceId,
      switchingInput,
      supportsOutputSelection,
      localInputLevel,
      voiceActivityGateOpen,
      pushToTalkPressed,
      diagnosticsRows,
      diagnosticsUpdatedAt,
      diagnosticsLoading,
      remoteVolumes,
    },
    actions: {
      joinVoiceChannel: () => joinVoiceChannel(activeChannel),
      leaveVoiceChannel,
      toggleMute,
      toggleDeafen,
      retryIce,
      refreshVoiceDiagnostics,
      switchInputDevice,
      setOutputDevice,
      updateVoiceSettingsPatch: persistVoiceSettingsPatch,
      setMemberVolume,
      resetMemberVolume,
      resetAllMemberVolumes,
      getMemberVolume,
      bindAudioElement,
    },
  };
}
