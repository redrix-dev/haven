import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchIceConfig } from '@/lib/voice/ice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

interface VoiceChannelPaneProps {
  communityId: string;
  channelId: string;
  channelName: string;
  currentUserId: string;
  currentUserDisplayName: string;
  canSpeak: boolean;
  showDiagnostics?: boolean;
  accessToken?: string | null;
}

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  },
];

const REMOTE_VOLUME_OPTIONS = [0, 25, 50, 75, 100, 125, 150, 200] as const;

const isAudioInput = (device: MediaDeviceInfo) => device.kind === 'audioinput';
const isAudioOutput = (device: MediaDeviceInfo) => device.kind === 'audiooutput';
const formatBytes = (value: number | null) => (value == null ? 'n/a' : `${(value / 1024).toFixed(1)} KB`);

export function VoiceChannelPane({
  communityId,
  channelId,
  channelName,
  currentUserId,
  currentUserDisplayName,
  canSpeak,
  showDiagnostics = false,
  accessToken = null,
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
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState('default');
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState('default');
  const [switchingInput, setSwitchingInput] = useState(false);
  const [supportsOutputSelection, setSupportsOutputSelection] = useState(false);
  const [peerDiagnostics, setPeerDiagnostics] = useState<Record<string, VoicePeerDiagnostics>>({});
  const [diagnosticsUpdatedAt, setDiagnosticsUpdatedAt] = useState<string | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audioElementRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);

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
      const audioInputs = devices.filter(isAudioInput);
      const audioOutputs = devices.filter(isAudioOutput);
      setInputDevices(audioInputs);
      setOutputDevices(audioOutputs);

      if (
        audioInputs.length > 0 &&
        !audioInputs.some((device) => device.deviceId === selectedInputDeviceId)
      ) {
        setSelectedInputDeviceId(audioInputs[0].deviceId);
      }

      if (
        audioOutputs.length > 0 &&
        !audioOutputs.some((device) => device.deviceId === selectedOutputDeviceId)
      ) {
        setSelectedOutputDeviceId(audioOutputs[0].deviceId);
      }
    } catch (deviceError) {
      console.error('Failed to enumerate audio devices:', deviceError);
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
            const statsById = new Map<string, any>();

            stats.forEach((report: any) => {
              statsById.set(report.id, report);

              if (
                !selectedCandidatePairId &&
                report.type === 'transport' &&
                typeof report.selectedCandidatePairId === 'string'
              ) {
                selectedCandidatePairId = report.selectedCandidatePairId;
              }

              if (!selectedCandidatePairId && report.type === 'candidate-pair' && report.selected) {
                selectedCandidatePairId = report.id;
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

    const shouldSendAudio = !listenOnly && !isMuted && !isDeafened;
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

    for (const [remoteUserId, peerConnection] of peersRef.current.entries()) {
      const audioSender = peerConnection
        .getSenders()
        .find((sender) => !sender.track || sender.track.kind === 'audio');

      if (audioSender) {
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

    const iceConfig = await fetchIceConfig({ communityId, channelId, accessToken });
    iceServersRef.current = iceConfig.iceServers;
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
    } catch (joinError: any) {
      console.error('Failed to join voice channel:', joinError);
      await cleanupVoiceSession();
      setError(joinError?.message ?? 'Failed to join voice channel.');
    } finally {
      setJoining(false);
    }
  };

  const switchInputDevice = async (deviceId: string) => {
    setSelectedInputDeviceId(deviceId);
    if (!joined || listenOnly) return;

    setSwitchingInput(true);
    setError(null);
    try {
      const newStream = await requestLocalAudioStream(deviceId);
      await applyOutgoingTrackToPeers(newStream, false);
    } catch (switchError: any) {
      console.error('Failed to switch input device:', switchError);
      setError(switchError?.message ?? 'Failed to switch input device.');
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
    } catch (micError: any) {
      console.error('Failed to enable microphone:', micError);
      setError(micError?.message ?? 'Failed to enable microphone.');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyLocalTrackState();
    void trackPresenceState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMuted, isDeafened, listenOnly, joined, currentUserDisplayName]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDeafened, remoteVolumes, remoteStreams, selectedOutputDeviceId, supportsOutputSelection]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDiagnostics, joined, participants]);

  useEffect(() => {
    return () => {
      void cleanupVoiceSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
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
                <Button
                  type="button"
                  onClick={toggleMute}
                  disabled={listenOnly}
                  variant={isMuted ? 'destructive' : 'secondary'}
                >
                  {isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                  {isMuted ? 'Unmute' : 'Mute'}
                </Button>
                <Button
                  type="button"
                  onClick={toggleDeafen}
                  variant={isDeafened ? 'destructive' : 'secondary'}
                >
                  <Headphones className="size-4" />
                  {isDeafened ? 'Undeafen' : 'Deafen'}
                </Button>
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
                  onClick={() => void cleanupVoiceSession()}
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
              onValueChange={setSelectedOutputDeviceId}
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

                <div className="flex items-center gap-2">
                  <Volume2 className="size-4 text-[#a9b8cf]" />
                  <Select
                    value={String(remoteVolumes[participant.userId] ?? 100)}
                    onValueChange={(value) => {
                      const numericValue = Number(value);
                      setRemoteVolumes((prev) => ({
                        ...prev,
                        [participant.userId]: Number.isFinite(numericValue) ? numericValue : 100,
                      }));
                    }}
                    disabled={isDeafened}
                  >
                    <SelectTrigger className="w-[110px] bg-[#111214] border-[#304867] text-white">
                      <SelectValue placeholder="100%" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#142033] border-[#304867] text-white">
                      {REMOTE_VOLUME_OPTIONS.map((volume) => (
                        <SelectItem key={volume} value={String(volume)}>
                          {volume}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              element.srcObject = remoteStreams[participant.userId] ?? null;
              element.muted = isDeafened;
              element.volume = (remoteVolumes[participant.userId] ?? 100) / 100;
              void applySinkId(element);
            }}
          />
        ))}
      </div>
    </div>
  );
}

