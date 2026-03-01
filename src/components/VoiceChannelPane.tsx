import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchIceConfig } from '@/lib/voice/ice';
import { matchesVoicePushToTalkBinding } from '@/lib/voice/pushToTalk';
import { getErrorMessage } from '@/shared/lib/errors';
import type { VoiceSettings } from '@/shared/desktop/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PushToTalkBindingField } from '@/components/PushToTalkBindingField';
import { isEditableKeyboardTarget } from '@/renderer/app/utils';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import { Headphones, Mic, MicOff, PhoneCall, PhoneOff, RefreshCcw, Volume2 } from 'lucide-react';

type VoiceSignalEvent = 'offer' | 'answer' | 'ice';

type VoiceSignalPayload = {
  type: VoiceSignalEvent;
  from: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type VoicePresencePayload = {
  user_id: string;
  display_name: string;
  muted: boolean;
  deafened: boolean;
  listen_only: boolean;
  joined_at: string;
};

type VoiceParticipant = {
  userId: string;
  displayName: string;
  muted: boolean;
  deafened: boolean;
  listenOnly: boolean;
};

type VoicePeerDiagnostics = {
  userId: string;
  displayName: string;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  signalingState: RTCSignalingState;
  iceGatheringState: RTCIceGatheringState;
  selectedCandidatePairId: string | null;
  selectedCandidatePairState: string | null;
  localCandidateType: string | null;
  remoteCandidateType: string | null;
  writable: boolean | null;
  bytesSent: number | null;
  bytesReceived: number | null;
};

type RTCStatsRecord = RTCStats & Record<string, unknown>;

interface VoiceChannelPaneProps {
  communityId: string;
  channelId: string;
  channelName: string;
  currentUserId: string;
  currentUserDisplayName: string;
  canSpeak: boolean;
  voiceSettings: VoiceSettings;
  voiceSettingsSaving?: boolean;
  voiceSettingsError?: string | null;
  onUpdateVoiceSettings?: (next: VoiceSettings) => void;
  onOpenVoiceSettings?: () => void;
  onOpenVoiceHardwareTest?: () => void;
  showDiagnostics?: boolean;
  autoJoin?: boolean;
  onParticipantsChange?: (participants: Array<{ userId: string; displayName: string }>) => void;
  onConnectionChange?: (connected: boolean) => void;
  onLeave?: () => void;
  onSessionStateChange?: (state: {
    joined: boolean;
    joining: boolean;
    isMuted: boolean;
    isDeafened: boolean;
    listenOnly: boolean;
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
}

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  },
];

const REMOTE_VOLUME_OPTIONS = [0, 25, 50, 75, 100, 125, 150, 200] as const;
const VOICE_ACTIVITY_GATE_RELEASE_MS = 220;

const isAudioInput = (device: MediaDeviceInfo) => device.kind === 'audioinput';
const isAudioOutput = (device: MediaDeviceInfo) => device.kind === 'audiooutput';
const hasSelectableDeviceId = (device: MediaDeviceInfo) => device.deviceId.trim().length > 0;
const formatBytes = (value: number | null) => (value == null ? 'n/a' : `${(value / 1024).toFixed(1)} KB`);

export function VoiceChannelPane({
  communityId,
  channelId,
  channelName,
  currentUserId,
  currentUserDisplayName,
  canSpeak,
  voiceSettings,
  voiceSettingsSaving = false,
  voiceSettingsError = null,
  onUpdateVoiceSettings,
  onOpenVoiceSettings,
  onOpenVoiceHardwareTest,
  showDiagnostics = false,
  autoJoin = false,
  onParticipantsChange,
  onConnectionChange,
  onLeave,
  onSessionStateChange,
  onControlActionsReady,
}: VoiceChannelPaneProps) {
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteVolumes, setRemoteVolumes] = useState<Record<string, number>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [listenOnly, setListenOnly] = useState(!canSpeak);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [iceSource, setIceSource] = useState<'xirsys' | 'fallback' | null>(null);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState(
    voiceSettings.preferredInputDeviceId || 'default'
  );
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState(
    voiceSettings.preferredOutputDeviceId || 'default'
  );
  const [switchingInput, setSwitchingInput] = useState(false);
  const [supportsOutputSelection, setSupportsOutputSelection] = useState(false);
  const [localInputLevel, setLocalInputLevel] = useState(0);
  const [voiceActivityGateOpen, setVoiceActivityGateOpen] = useState(false);
  const [pushToTalkPressed, setPushToTalkPressed] = useState(false);
  const [peerDiagnostics, setPeerDiagnostics] = useState<Record<string, VoicePeerDiagnostics>>({});
  const [diagnosticsUpdatedAt, setDiagnosticsUpdatedAt] = useState<string | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audioElementRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);
  const autoJoinAttemptedChannelKeyRef = useRef<string | null>(null);
  const autoEnableMicAttemptedChannelKeyRef = useRef<string | null>(null);
  const localInputMonitorAudioContextRef = useRef<AudioContext | null>(null);
  const localInputMonitorSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const localInputMonitorAnalyserNodeRef = useRef<AnalyserNode | null>(null);
  const localInputMonitorTimeDomainRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const localInputMonitorRafIdRef = useRef<number | null>(null);
  const localInputMonitorActiveRef = useRef(false);
  const lastVoiceActivityAtRef = useRef<number>(0);
  const activePushToTalkCodeRef = useRef<string | null>(null);
  const voiceSettingsRef = useRef(voiceSettings);
  const joinVoiceChannelActionRef = useRef<(() => Promise<void>) | null>(null);
  const leaveVoiceChannelActionRef = useRef<(() => Promise<void>) | null>(null);
  const toggleMuteActionRef = useRef<(() => void) | null>(null);
  const toggleDeafenActionRef = useRef<(() => void) | null>(null);

  const remoteParticipantIds = useMemo(
    () => participants.map((participant) => participant.userId),
    [participants]
  );
  const diagnosticsRows = useMemo(
    () => Object.values(peerDiagnostics).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [peerDiagnostics]
  );

  const applySinkId = async (audioElement: HTMLAudioElement) => {
    if (!supportsOutputSelection) return;
    const mediaElementWithSink = audioElement as HTMLAudioElement & {
      setSinkId?: (sinkId: string) => Promise<void>;
    };
    if (!mediaElementWithSink.setSinkId) return;

    try {
      await mediaElementWithSink.setSinkId(selectedOutputDeviceId || 'default');
    } catch (sinkError) {
      console.error('Failed to set output device:', sinkError);
    }
  };

  const refreshAudioDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => isAudioInput(device) && hasSelectableDeviceId(device));
      const audioOutputs = devices.filter((device) => isAudioOutput(device) && hasSelectableDeviceId(device));
      setInputDevices(audioInputs);
      setOutputDevices(audioOutputs);

      if (
        audioInputs.length > 0 &&
        !audioInputs.some((device) => device.deviceId === selectedInputDeviceId)
      ) {
        setSelectedInputDeviceId(audioInputs[0].deviceId);
      } else if (audioInputs.length === 0 && selectedInputDeviceId !== 'default') {
        setSelectedInputDeviceId('default');
      }

      if (
        audioOutputs.length > 0 &&
        !audioOutputs.some((device) => device.deviceId === selectedOutputDeviceId)
      ) {
        setSelectedOutputDeviceId(audioOutputs[0].deviceId);
      } else if (audioOutputs.length === 0 && selectedOutputDeviceId !== 'default') {
        setSelectedOutputDeviceId('default');
      }
    } catch (deviceError) {
      console.error('Failed to enumerate audio devices:', deviceError);
    }
  };

  const persistVoiceSettingsPatch = (patch: Partial<VoiceSettings>) => {
    if (!onUpdateVoiceSettings) return;
    onUpdateVoiceSettings({
      ...voiceSettings,
      ...patch,
    });
  };

  const stopLocalInputMonitor = async () => {
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
      } catch (error) {
        console.warn('Failed to close local input monitor audio context:', error);
      }
      localInputMonitorAudioContextRef.current = null;
    }

    setLocalInputLevel(0);
    setVoiceActivityGateOpen(false);
  };

  const startLocalInputMonitor = async (stream: MediaStream | null) => {
    await stopLocalInputMonitor();
    if (!stream) return;

    const track = stream.getAudioTracks()[0];
    if (!track) return;

    const AudioContextCtor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
      localInputMonitorTimeDomainRef.current = new Uint8Array(analyser.fftSize);
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

        const gateOpen = normalizedLevel >= threshold || now - lastVoiceActivityAtRef.current <= VOICE_ACTIVITY_GATE_RELEASE_MS;

        setLocalInputLevel((prev) => (Math.abs(prev - normalizedLevel) > 0.01 ? normalizedLevel : prev));
        setVoiceActivityGateOpen((prev) => (prev === gateOpen ? prev : gateOpen));

        localInputMonitorRafIdRef.current = window.requestAnimationFrame(frame);
      };

      localInputMonitorRafIdRef.current = window.requestAnimationFrame(frame);
    } catch (monitorError) {
      console.warn('Failed to start local input monitor for voice activity gating:', monitorError);
      void stopLocalInputMonitor();
    }
  };

  const closePeerConnection = (remoteUserId: string) => {
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

    setRemoteStreams((prev) => {
      if (!(remoteUserId in prev)) return prev;
      const next = { ...prev };
      delete next[remoteUserId];
      return next;
    });

    setRemoteVolumes((prev) => {
      if (!(remoteUserId in prev)) return prev;
      const next = { ...prev };
      delete next[remoteUserId];
      return next;
    });
    setPeerDiagnostics((prev) => {
      if (!(remoteUserId in prev)) return prev;
      const next = { ...prev };
      delete next[remoteUserId];
      return next;
    });
  };

  const flushPendingIceCandidates = async (
    remoteUserId: string,
    peerConnection: RTCPeerConnection
  ) => {
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
  };

  const sendSignal = async (payload: Omit<VoiceSignalPayload, 'from'>) => {
    const channel = channelRef.current;
    if (!channel) return;

    const sendStatus = await channel.send({
      type: 'broadcast',
      event: 'webrtc-signal',
      payload: {
        ...payload,
        from: currentUserId,
      },
    });

    if (sendStatus !== 'ok') {
      console.error('Failed to send WebRTC signal:', sendStatus);
    }
  };

  const refreshVoiceDiagnostics = async () => {
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
                  typeof selectedPair.state === 'string' ? selectedPair.state : null;
                writable = typeof selectedPair.writable === 'boolean' ? selectedPair.writable : null;
                bytesSent = typeof selectedPair.bytesSent === 'number' ? selectedPair.bytesSent : null;
                bytesReceived =
                  typeof selectedPair.bytesReceived === 'number' ? selectedPair.bytesReceived : null;

                const localCandidate =
                  typeof selectedPair.localCandidateId === 'string'
                    ? statsById.get(selectedPair.localCandidateId)
                    : null;
                const remoteCandidate =
                  typeof selectedPair.remoteCandidateId === 'string'
                    ? statsById.get(selectedPair.remoteCandidateId)
                    : null;

                localCandidateType =
                  localCandidate && typeof localCandidate.candidateType === 'string'
                    ? localCandidate.candidateType
                    : null;
                remoteCandidateType =
                  remoteCandidate && typeof remoteCandidate.candidateType === 'string'
                    ? remoteCandidate.candidateType
                    : null;
              }
            }
          } catch (statsError) {
            console.error('Failed to collect WebRTC stats:', statsError);
          }

          const participant = participants.find((item) => item.userId === remoteUserId);

          const row: VoicePeerDiagnostics = {
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
          };

          return row;
        })
      );

      const nextRows = rows.reduce<Record<string, VoicePeerDiagnostics>>((acc, row) => {
        acc[row.userId] = row;
        return acc;
      }, {});
      setPeerDiagnostics(nextRows);
      setDiagnosticsUpdatedAt(new Date().toISOString());
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const ensurePeerConnection = (remoteUserId: string) => {
    const existing = peersRef.current.get(remoteUserId);
    if (existing) return existing;

    const peerConnection = new RTCPeerConnection({
      iceServers: iceServersRef.current.length > 0 ? iceServersRef.current : FALLBACK_ICE_SERVERS,
    });

    const localStream = localStreamRef.current;
    if (localStream && !listenOnly) {
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });
    } else {
      peerConnection.addTransceiver('audio', { direction: 'recvonly' });
    }

    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;

      setRemoteStreams((prev) => {
        if (prev[remoteUserId] === stream) return prev;
        return {
          ...prev,
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
      if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
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
  };

  const createAndSendOffer = async (remoteUserId: string) => {
    const peerConnection = ensurePeerConnection(remoteUserId);
    if (peerConnection.signalingState !== 'stable') return;

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await sendSignal({
      type: 'offer',
      to: remoteUserId,
      sdp: offer,
    });
  };

  const handleSignal = async (payload: VoiceSignalPayload) => {
    if (!payload || payload.from === currentUserId) return;
    if (payload.to && payload.to !== currentUserId) return;

    const remoteUserId = payload.from;
    const peerConnection = ensurePeerConnection(remoteUserId);

    try {
      if (payload.type === 'offer' && payload.sdp) {
        if (peerConnection.signalingState !== 'stable') {
          await peerConnection.setLocalDescription({ type: 'rollback' }).catch(() => undefined);
        }

        await peerConnection.setRemoteDescription(payload.sdp);
        await flushPendingIceCandidates(remoteUserId, peerConnection);

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await sendSignal({
          type: 'answer',
          to: remoteUserId,
          sdp: answer,
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
          const pendingCandidates = pendingIceCandidatesRef.current.get(remoteUserId) ?? [];
          pendingCandidates.push(payload.candidate);
          pendingIceCandidatesRef.current.set(remoteUserId, pendingCandidates);
        }
      }
    } catch (signalError) {
      console.error('Failed to handle WebRTC signal:', signalError);
    }
  };

  const reconcilePeerConnections = (remoteUserIds: string[]) => {
    for (const existingRemoteId of peersRef.current.keys()) {
      if (!remoteUserIds.includes(existingRemoteId)) {
        closePeerConnection(existingRemoteId);
      }
    }

    for (const remoteUserId of remoteUserIds) {
      if (!peersRef.current.has(remoteUserId)) {
        ensurePeerConnection(remoteUserId);
        if (currentUserId.localeCompare(remoteUserId) < 0) {
          void createAndSendOffer(remoteUserId);
        }
      }
    }
  };

  const syncParticipantsFromPresence = () => {
    const channel = channelRef.current;
    if (!channel) return;

    const presenceState = channel.presenceState() as Record<string, VoicePresencePayload[]>;
    const nextParticipants: VoiceParticipant[] = [];

    for (const [presenceKey, presenceRows] of Object.entries(presenceState)) {
      const latestPresence = presenceRows[presenceRows.length - 1];
      if (!latestPresence) continue;

      const userId = latestPresence.user_id ?? presenceKey;
      if (userId === currentUserId) continue;

      nextParticipants.push({
        userId,
        displayName: latestPresence.display_name ?? userId.slice(0, 12),
        muted: Boolean(latestPresence.muted),
        deafened: Boolean(latestPresence.deafened),
        listenOnly: Boolean(latestPresence.listen_only),
      });
    }

    nextParticipants.sort((a, b) => a.displayName.localeCompare(b.displayName));
    setParticipants(nextParticipants);
    reconcilePeerConnections(nextParticipants.map((participant) => participant.userId));
  };

  const trackPresenceState = async () => {
    const channel = channelRef.current;
    if (!channel || !joined) return;

    const payload: VoicePresencePayload = {
      user_id: currentUserId,
      display_name: currentUserDisplayName,
      muted: listenOnly ? true : isMuted,
      deafened: isDeafened,
      listen_only: listenOnly,
      joined_at: new Date().toISOString(),
    };

    const trackStatus = await channel.track(payload);
    if (trackStatus !== 'ok') {
      console.error('Failed to update voice presence:', trackStatus);
    }
  };

  const requestLocalAudioStream = async (deviceId: string) => {
    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (deviceId && deviceId !== 'default') {
      constraints.deviceId = { exact: deviceId };
    }

    return navigator.mediaDevices.getUserMedia({ audio: constraints });
  };

  const applyLocalTrackState = () => {
    const localStream = localStreamRef.current;
    if (!localStream) return;

    const baseAllowsSend = !listenOnly && !isMuted && !isDeafened;
    let modeAllowsSend = true;

    if (baseAllowsSend) {
      switch (voiceSettings.transmissionMode) {
        case 'push_to_talk':
          modeAllowsSend = Boolean(voiceSettings.pushToTalkBinding) && pushToTalkPressed;
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
  };

  const applyOutgoingTrackToPeers = async (stream: MediaStream, renegotiate: boolean) => {
    const nextTrack = stream.getAudioTracks()[0];
    if (!nextTrack) {
      throw new Error('Selected input device has no audio track.');
    }

    const shouldSendAudio = !listenOnly && !isMuted && !isDeafened;
    nextTrack.enabled = shouldSendAudio;

    const previousStream = localStreamRef.current;
    localStreamRef.current = stream;
    await startLocalInputMonitor(stream);

    for (const [remoteUserId, peerConnection] of peersRef.current.entries()) {
      const audioSender = peerConnection
        .getSenders()
        .find((sender) => !sender.track || sender.track.kind === 'audio');

      if (audioSender) {
        // If the peer was created in listen-only mode, the audio transceiver can remain recvonly.
        // Flip it before renegotiation so replacing the track actually sends microphone audio.
        const audioTransceiver = peerConnection
          .getTransceivers()
          .find((transceiver) => transceiver.sender === audioSender);
        if (
          audioTransceiver &&
          (audioTransceiver.direction === 'recvonly' || audioTransceiver.direction === 'inactive')
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
  };

  const cleanupVoiceSession = async () => {
    const channel = channelRef.current;
    channelRef.current = null;

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
    setRemoteStreams({});
    setRemoteVolumes({});
    setPeerDiagnostics({});
    setJoined(false);
    setJoining(false);
    setIsMuted(false);
    setIsDeafened(false);
    setListenOnly(!canSpeak);
    setIceSource(null);
    setDiagnosticsUpdatedAt(null);
    setLocalInputLevel(0);
    setVoiceActivityGateOpen(false);
    setPushToTalkPressed(false);
    activePushToTalkCodeRef.current = null;
    autoEnableMicAttemptedChannelKeyRef.current = null;

    if (channel) {
      try {
        await channel.untrack();
      } catch {
        // no-op
      }
      await supabase.removeChannel(channel);
    }
  };

  const joinVoiceChannel = async () => {
    if (joining || joined) return;

    setJoining(true);
    setError(null);
    setNotice(null);

    const iceConfig = await fetchIceConfig({ communityId, channelId });
    if (iceConfig.blockedReason) {
      setError(iceConfig.blockedReason);
      if (iceConfig.warning) {
        setNotice(iceConfig.warning);
      }
      setJoining(false);
      return;
    }

    iceServersRef.current =
      iceConfig.iceServers.length > 0 ? iceConfig.iceServers : FALLBACK_ICE_SERVERS;
    setIceSource(iceConfig.source);
    if (iceConfig.warning) setNotice(iceConfig.warning);

    let joinAsListener = !canSpeak;
    let localStream: MediaStream | null = null;

    if (canSpeak) {
      try {
        localStream = await requestLocalAudioStream(selectedInputDeviceId);
      } catch (mediaError) {
        console.error('Microphone permission failed, switching to listener mode:', mediaError);
        joinAsListener = true;
        setNotice('Microphone access denied. Joined in listen-only mode.');
      }
    }

    localStreamRef.current = localStream;
    await startLocalInputMonitor(localStream);
    setListenOnly(joinAsListener);
    if (localStream) {
      const shouldSendAudio = !joinAsListener && !isMuted && !isDeafened;
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = shouldSendAudio;
      });
    }

    await refreshAudioDevices();

    const voiceChannel = supabase.channel(`voice:${communityId}:${channelId}`, {
      config: {
        presence: { key: currentUserId },
      },
    });

    voiceChannel
      .on('presence', { event: 'sync' }, () => {
        syncParticipantsFromPresence();
      })
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
            setJoined(true);
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
      console.error('Failed to join voice channel:', joinError);
      await cleanupVoiceSession();
      setError(getErrorMessage(joinError, 'Failed to join voice channel.'));
    } finally {
      setJoining(false);
    }
  };

  const switchInputDevice = async (deviceId: string) => {
    setSelectedInputDeviceId(deviceId);
    persistVoiceSettingsPatch({ preferredInputDeviceId: deviceId });
    if (!joined || listenOnly) return;

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
  };

  const enableMicrophone = async () => {
    if (!canSpeak || !joined || !listenOnly) return;
    setError(null);

    try {
      const stream = await requestLocalAudioStream(selectedInputDeviceId);
      setListenOnly(false);
      setIsMuted(false);
      await applyOutgoingTrackToPeers(stream, true);
      await refreshAudioDevices();
    } catch (micError: unknown) {
      console.error('Failed to enable microphone:', micError);
      setError(getErrorMessage(micError, 'Failed to enable microphone.'));
    }
  };

  const retryIce = async () => {
    for (const [remoteUserId, peerConnection] of peersRef.current.entries()) {
      if (typeof peerConnection.restartIce === 'function') {
        peerConnection.restartIce();
      }
      if (peerConnection.signalingState === 'stable') {
        await createAndSendOffer(remoteUserId);
      }
    }
  };

  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);

  useEffect(() => {
    setSupportsOutputSelection(
      typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
    );
    void refreshAudioDevices();

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;

    const onDeviceChange = () => {
      void refreshAudioDevices();
    };

    mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => {
      mediaDevices.removeEventListener('devicechange', onDeviceChange);
    };
  }, []);

  useEffect(() => {
    const nextInputId = voiceSettings.preferredInputDeviceId || 'default';
    setSelectedInputDeviceId((prev) => (prev === nextInputId ? prev : nextInputId));
  }, [voiceSettings.preferredInputDeviceId]);

  useEffect(() => {
    const nextOutputId = voiceSettings.preferredOutputDeviceId || 'default';
    setSelectedOutputDeviceId((prev) => (prev === nextOutputId ? prev : nextOutputId));
  }, [voiceSettings.preferredOutputDeviceId]);

  useEffect(() => {
    applyLocalTrackState();
    void trackPresenceState();
  }, [
    isMuted,
    isDeafened,
    listenOnly,
    joined,
    currentUserDisplayName,
    pushToTalkPressed,
    voiceActivityGateOpen,
    voiceSettings.transmissionMode,
    voiceSettings.pushToTalkBinding,
  ]);

  useEffect(() => {
    if (!localStreamRef.current) return;
    void startLocalInputMonitor(localStreamRef.current);
  }, [voiceSettings.voiceActivationThreshold]);

  useEffect(() => {
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
      if (!activeCode) return;
      if (event.code !== activeCode) return;
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

  useEffect(() => {
    setRemoteVolumes((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const participant of participants) {
        if (typeof next[participant.userId] !== 'number') {
          next[participant.userId] = 100;
          changed = true;
        }
      }

      for (const existingUserId of Object.keys(next)) {
        if (!remoteParticipantIds.includes(existingUserId)) {
          delete next[existingUserId];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [participants, remoteParticipantIds]);

  useEffect(() => {
    for (const [remoteUserId, audioElement] of Object.entries(audioElementRefs.current)) {
      if (!audioElement) continue;
      audioElement.muted = isDeafened;
      audioElement.volume = (remoteVolumes[remoteUserId] ?? 100) / 100;
      void applySinkId(audioElement);
    }
  }, [isDeafened, remoteVolumes, remoteStreams, selectedOutputDeviceId, supportsOutputSelection]);

  useEffect(() => {
    onConnectionChange?.(joined);
  }, [joined, onConnectionChange]);

  useEffect(() => {
    onSessionStateChange?.({
      joined,
      joining,
      isMuted,
      isDeafened,
      listenOnly,
    });
  }, [joined, joining, isMuted, isDeafened, listenOnly, onSessionStateChange]);

  useEffect(() => {
    if (joined || joining) return;
    setListenOnly(!canSpeak);
  }, [canSpeak, joined, joining]);

  useEffect(() => {
    if (!joined || !listenOnly || !canSpeak) return;

    const channelKey = `${communityId}:${channelId}`;
    if (autoEnableMicAttemptedChannelKeyRef.current === channelKey) {
      return;
    }

    autoEnableMicAttemptedChannelKeyRef.current = channelKey;
    void enableMicrophone();
  }, [canSpeak, channelId, communityId, joined, listenOnly, enableMicrophone]);

  useEffect(() => {
    if (!onParticipantsChange) return;
    if (!joined) {
      onParticipantsChange([]);
      return;
    }

    onParticipantsChange(
      participants.map((participant) => ({
        userId: participant.userId,
        displayName: participant.displayName,
      }))
    );
  }, [joined, onParticipantsChange, participants]);

  useEffect(() => {
    if (!autoJoin) return;

    const channelKey = `${communityId}:${channelId}`;
    if (joined || joining || autoJoinAttemptedChannelKeyRef.current === channelKey) {
      return;
    }

    autoJoinAttemptedChannelKeyRef.current = channelKey;
    void joinVoiceChannel();
  }, [autoJoin, channelId, communityId, joined, joining]);

  useEffect(() => {
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
  }, [showDiagnostics, joined, participants]);

  useEffect(() => {
    return () => {
      void cleanupVoiceSession();
    };
  }, [communityId, channelId, currentUserId]);

  const toggleMute = () => {
    if (listenOnly) return;
    setIsMuted((prev) => !prev);
  };

  const toggleDeafen = () => {
    setIsDeafened((prev) => {
      const next = !prev;
      if (next) {
        setIsMuted(true);
      }
      return next;
    });
  };

  const leaveVoiceChannel = async () => {
    await cleanupVoiceSession();
    onLeave?.();
  };

  joinVoiceChannelActionRef.current = joinVoiceChannel;
  leaveVoiceChannelActionRef.current = leaveVoiceChannel;
  toggleMuteActionRef.current = toggleMute;
  toggleDeafenActionRef.current = toggleDeafen;

  useEffect(() => {
    if (!onControlActionsReady) return;
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
  }, [onControlActionsReady]);

  return (
    <div className="scrollbar-inset flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
      <Card className="bg-[#1c2a43] border-[#263a58] text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Headphones className="size-5" />
            <span>{channelName}</span>
          </CardTitle>
          <CardDescription className="text-[#a9b8cf]">
            P2P voice with Supabase signaling. Relay credentials are fetched via provider-agnostic ICE
            endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={joined ? 'default' : 'outline'}>
              {joined ? 'Connected' : 'Disconnected'}
            </Badge>
            {listenOnly && <Badge variant="secondary">Listen only</Badge>}
            {!canSpeak && <Badge variant="outline">No speak permission</Badge>}
            {iceSource && (
              <Badge variant={iceSource === 'xirsys' ? 'default' : 'outline'}>
                ICE: {iceSource === 'xirsys' ? 'Xirsys' : 'STUN fallback'}
              </Badge>
            )}
          </div>

          {notice && <p className="text-sm text-amber-300">{notice}</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex flex-wrap gap-2">
            {!joined ? (
              <Button
                type="button"
                onClick={() => void joinVoiceChannel()}
                disabled={joining}
                className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
              >
                <PhoneCall className="size-4" />
                {joining ? 'Joining...' : listenOnly ? 'Join as Listener' : 'Join Voice'}
              </Button>
            ) : (
              <>
                <Toggle
                  pressed={isMuted}
                  onPressedChange={(pressed) => {
                    if (pressed !== isMuted) {
                      toggleMute();
                    }
                  }}
                  disabled={listenOnly}
                  variant="outline"
                  aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  className={`h-9 gap-2 px-3 text-white ${
                    isMuted
                      ? 'border-red-500/40 bg-red-500/15 hover:bg-red-500/20'
                      : 'border-[#304867] bg-[#142033] hover:bg-[#22334f]'
                  } ${listenOnly ? 'opacity-50' : ''}`}
                >
                  {isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                  {isMuted ? 'Unmute' : 'Mute'}
                </Toggle>
                <Toggle
                  pressed={isDeafened}
                  onPressedChange={(pressed) => {
                    if (pressed !== isDeafened) {
                      toggleDeafen();
                    }
                  }}
                  variant="outline"
                  aria-label={isDeafened ? 'Undeafen audio' : 'Deafen audio'}
                  className={`h-9 gap-2 px-3 text-white ${
                    isDeafened
                      ? 'border-red-500/40 bg-red-500/15 hover:bg-red-500/20'
                      : 'border-[#304867] bg-[#142033] hover:bg-[#22334f]'
                  }`}
                >
                  <Headphones className="size-4" />
                  {isDeafened ? 'Undeafen' : 'Deafen'}
                </Toggle>
                {listenOnly && canSpeak && (
                  <Button type="button" variant="secondary" onClick={() => void enableMicrophone()}>
                    Enable Mic
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => void retryIce()}>
                  <RefreshCcw className="size-4" />
                  Retry ICE
                </Button>
                <Button
                  type="button"
                  onClick={() => void leaveVoiceChannel()}
                  variant="outline"
                >
                  <PhoneOff className="size-4" />
                  Leave Voice
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#1c2a43] border-[#263a58] text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="size-5" />
            <span>Voice Transmission</span>
          </CardTitle>
          <CardDescription className="text-[#a9b8cf]">
            Control how your mic transmits while unmuted. These settings are stored locally on this
            device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Mode: {voiceSettings.transmissionMode.replace(/_/g, ' ')}</Badge>
            {voiceSettings.transmissionMode === 'voice_activity' && (
              <Badge variant={voiceActivityGateOpen ? 'default' : 'outline'}>
                Gate {voiceActivityGateOpen ? 'Open' : 'Closed'}
              </Badge>
            )}
            {voiceSettings.transmissionMode === 'push_to_talk' && (
              <Badge variant={pushToTalkPressed ? 'default' : 'outline'}>
                PTT {pushToTalkPressed ? 'Held' : 'Idle'}
              </Badge>
            )}
            <Badge variant="outline">Input {Math.round(localInputLevel * 100)}%</Badge>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Transmission mode</p>
            <Select
              value={voiceSettings.transmissionMode}
              onValueChange={(value) =>
                persistVoiceSettingsPatch({ transmissionMode: value as VoiceSettings['transmissionMode'] })
              }
              disabled={voiceSettingsSaving}
            >
              <SelectTrigger className="w-full bg-[#142033] border-[#304867] text-white">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent className="bg-[#142033] border-[#304867] text-white">
                <SelectItem value="voice_activity">Voice Activity</SelectItem>
                <SelectItem value="push_to_talk">Push to Talk</SelectItem>
                <SelectItem value="open_mic">Open Mic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {voiceSettings.transmissionMode === 'voice_activity' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs text-[#a9b8cf]">
                <span>Gate threshold</span>
                <span>{voiceSettings.voiceActivationThreshold}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[voiceSettings.voiceActivationThreshold]}
                onValueChange={(values) => {
                  const nextValue = values[0];
                  if (typeof nextValue !== 'number') return;
                  persistVoiceSettingsPatch({
                    voiceActivationThreshold: nextValue,
                  });
                }}
                disabled={voiceSettingsSaving}
                className="w-full py-1"
                aria-label="Voice activity gate threshold"
              />
              <p className="text-[11px] text-[#90a5c4]">
                Lower values open the mic more easily. Use Voice Hardware Test for tuning.
              </p>
            </div>
          )}

          {voiceSettings.transmissionMode === 'push_to_talk' && (
            <PushToTalkBindingField
              value={voiceSettings.pushToTalkBinding}
              disabled={voiceSettingsSaving}
              onChange={(nextBinding) => persistVoiceSettingsPatch({ pushToTalkBinding: nextBinding })}
              helperText="PTT works while Haven is focused. F13-F24 bindings work when your pedal/driver emits those key events."
            />
          )}

          <div className="flex flex-wrap gap-2">
            {onOpenVoiceSettings && (
              <Button type="button" variant="secondary" onClick={onOpenVoiceSettings}>
                Open Full Voice Settings
              </Button>
            )}
            {onOpenVoiceHardwareTest && (
              <Button
                type="button"
                variant="outline"
                className="border-[#304867] text-white"
                onClick={onOpenVoiceHardwareTest}
              >
                Open Voice Hardware Test
              </Button>
            )}
          </div>

          {voiceSettingsError && <p className="text-sm text-red-300">{voiceSettingsError}</p>}
        </CardContent>
      </Card>

      <Card className="bg-[#1c2a43] border-[#263a58] text-white">
        <CardHeader>
          <CardTitle>Devices</CardTitle>
          <CardDescription className="text-[#a9b8cf]">
            Select microphone and speaker devices. Input switching applies live while connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Microphone</p>
            <Select value={selectedInputDeviceId} onValueChange={(value) => void switchInputDevice(value)}>
              <SelectTrigger className="w-full bg-[#142033] border-[#304867] text-white">
                <SelectValue placeholder="Select microphone" />
              </SelectTrigger>
              <SelectContent className="bg-[#142033] border-[#304867] text-white">
                {inputDevices.length === 0 ? (
                  <SelectItem value="default">Default microphone</SelectItem>
                ) : (
                  inputDevices.map((device, index) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {switchingInput && <p className="text-xs text-[#a9b8cf]">Switching microphone...</p>}
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Speaker</p>
            <Select
              value={selectedOutputDeviceId}
              onValueChange={(value) => {
                setSelectedOutputDeviceId(value);
                persistVoiceSettingsPatch({ preferredOutputDeviceId: value });
              }}
              disabled={!supportsOutputSelection}
            >
              <SelectTrigger className="w-full bg-[#142033] border-[#304867] text-white">
                <SelectValue placeholder="Select speaker" />
              </SelectTrigger>
              <SelectContent className="bg-[#142033] border-[#304867] text-white">
                {outputDevices.length === 0 ? (
                  <SelectItem value="default">Default speaker</SelectItem>
                ) : (
                  outputDevices.map((device, index) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Speaker ${index + 1}`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {!supportsOutputSelection && (
              <p className="text-xs text-[#a9b8cf]">
                Output selection is not supported by this runtime. Your system default speaker is used.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {showDiagnostics && (
        <Card className="bg-[#1c2a43] border-[#263a58] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Voice Diagnostics</span>
              <Badge variant="outline">Staff only</Badge>
            </CardTitle>
            <CardDescription className="text-[#a9b8cf]">
              Live WebRTC state and selected ICE route details for debugging.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#a9b8cf]">
              <span>Peers: {diagnosticsRows.length}</span>
              <span>ICE source: {iceSource === 'xirsys' ? 'xirsys' : iceSource ?? 'unknown'}</span>
              <span>
                Last refresh:{' '}
                {diagnosticsUpdatedAt ? new Date(diagnosticsUpdatedAt).toLocaleTimeString() : 'never'}
              </span>
            </div>

            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refreshVoiceDiagnostics()}
                disabled={!joined || diagnosticsLoading}
              >
                <RefreshCcw className="size-4" />
                {diagnosticsLoading ? 'Refreshing...' : 'Refresh Diagnostics'}
              </Button>
            </div>

            {!joined ? (
              <p className="text-sm text-[#a9b8cf]">Join voice to view diagnostics.</p>
            ) : diagnosticsRows.length === 0 ? (
              <p className="text-sm text-[#a9b8cf]">No peer connections yet.</p>
            ) : (
              <div className="space-y-2">
                {diagnosticsRows.map((diag) => (
                  <details
                    key={diag.userId}
                    className="rounded-md border border-[#304867] bg-[#142033] px-3 py-2"
                  >
                    <summary className="cursor-pointer text-sm font-medium text-white">
                      {diag.displayName} ({diag.connectionState})
                    </summary>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-[#a9b8cf]">
                      <p>Connection: {diag.connectionState}</p>
                      <p>ICE connection: {diag.iceConnectionState}</p>
                      <p>Signaling: {diag.signalingState}</p>
                      <p>ICE gathering: {diag.iceGatheringState}</p>
                      <p>Pair ID: {diag.selectedCandidatePairId ?? 'n/a'}</p>
                      <p>Pair state: {diag.selectedCandidatePairState ?? 'n/a'}</p>
                      <p>Local candidate: {diag.localCandidateType ?? 'n/a'}</p>
                      <p>Remote candidate: {diag.remoteCandidateType ?? 'n/a'}</p>
                      <p>Writable: {diag.writable == null ? 'n/a' : diag.writable ? 'yes' : 'no'}</p>
                      <p>Bytes sent: {formatBytes(diag.bytesSent)}</p>
                      <p>Bytes received: {formatBytes(diag.bytesReceived)}</p>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-[#1c2a43] border-[#263a58] text-white">
        <CardHeader>
          <CardTitle>Participants ({participants.length + (joined ? 1 : 0)})</CardTitle>
          <CardDescription className="text-[#a9b8cf]">
            Per-user volume is local to your client.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {joined && (
            <div className="flex items-center justify-between rounded-md border border-[#304867] bg-[#142033] px-3 py-2">
              <div>
                <p className="text-sm font-medium text-white">{currentUserDisplayName} (You)</p>
                <div className="mt-1 flex items-center gap-2">
                  {listenOnly && <Badge variant="secondary">Listen only</Badge>}
                  {isMuted && <Badge variant="outline">Muted</Badge>}
                  {isDeafened && <Badge variant="outline">Deafened</Badge>}
                </div>
              </div>
              <Badge variant="secondary">Local</Badge>
            </div>
          )}

          {participants.length === 0 ? (
            <p className="text-sm text-[#a9b8cf]">No other participants are connected.</p>
          ) : (
            participants.map((participant) => (
              <div
                key={participant.userId}
                className="flex items-center justify-between rounded-md border border-[#304867] bg-[#142033] px-3 py-2 gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{participant.displayName}</p>
                  <div className="mt-1 flex items-center gap-2">
                    {participant.listenOnly && <Badge variant="secondary">Listen only</Badge>}
                    {participant.muted && <Badge variant="outline">Muted</Badge>}
                    {participant.deafened && <Badge variant="outline">Deafened</Badge>}
                  </div>
                </div>

                <div className="flex min-w-[180px] items-center gap-3">
                  <Volume2 className="size-4 text-[#a9b8cf]" />
                  <Slider
                    min={REMOTE_VOLUME_OPTIONS[0]}
                    max={REMOTE_VOLUME_OPTIONS[REMOTE_VOLUME_OPTIONS.length - 1]}
                    step={25}
                    value={[remoteVolumes[participant.userId] ?? 100]}
                    onValueChange={(values) => {
                      const numericValue = values[0];
                      setRemoteVolumes((prev) => ({
                        ...prev,
                        [participant.userId]: Number.isFinite(numericValue) ? numericValue : 100,
                      }));
                    }}
                    disabled={isDeafened}
                    className="w-full"
                    aria-label={`Volume for ${participant.displayName}`}
                  />
                  <span className="w-10 shrink-0 text-right text-xs text-[#c8d7ee]">
                    {remoteVolumes[participant.userId] ?? 100}%
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="hidden" aria-hidden="true">
        {participants.map((participant) => (
          <audio
            key={participant.userId}
            autoPlay
            playsInline
            ref={(element) => {
              audioElementRefs.current[participant.userId] = element;
              if (!element) return;
              const nextRemoteStream = remoteStreams[participant.userId] ?? null;
              element.srcObject = nextRemoteStream;
              element.muted = isDeafened;
              element.volume = (remoteVolumes[participant.userId] ?? 100) / 100;
              void applySinkId(element);
              if (nextRemoteStream) {
                void element.play().catch((playError) => {
                  const errorName = playError instanceof Error ? playError.name : '';
                  if (errorName === 'AbortError') return;
                  console.error('Failed to start remote audio playback:', playError);
                });
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

