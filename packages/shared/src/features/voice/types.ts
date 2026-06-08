import type { VoicePresenceStateRow, VoiceSidebarParticipant } from "@shared/types/types";
import type { VoiceSettings } from "@shared/types/settings";

export type VoiceControllerChannel = {
  communityId: string;
  channelId: string;
  channelName: string;
};

export type ForceDisconnectVoiceReason = "access_lost" | "kicked" | "ban";

export type VoiceParticipant = {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  isSpeaking?: boolean;
  muted: boolean;
  deafened: boolean;
};

export type VoicePeerDiagnostics = {
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

export type VoiceSessionControllerState = {
  activeChannel: VoiceControllerChannel | null;
  joined: boolean;
  joining: boolean;
  participants: VoiceParticipant[];
  remoteStreams: Record<string, MediaStream>;
  isMuted: boolean;
  isDeafened: boolean;
  error: string | null;
  notice: string | null;
  iceSource: "xirsys" | "fallback" | null;
  inputDevices: MediaDeviceInfo[];
  outputDevices: MediaDeviceInfo[];
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  switchingInput: boolean;
  supportsOutputSelection: boolean;
  localInputLevel: number;
  voiceActivityGateOpen: boolean;
  pushToTalkPressed: boolean;
  diagnosticsRows: VoicePeerDiagnostics[];
  diagnosticsUpdatedAt: string | null;
  diagnosticsLoading: boolean;
  remoteVolumes: Record<string, number>;
};

export type VoiceSessionControllerActions = {
  joinVoiceChannel: () => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  kickFromVoice: (targetUserId: string, channelId: string) => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  retryIce: () => Promise<void>;
  refreshVoiceDiagnostics: () => Promise<void>;
  switchInputDevice: (deviceId: string) => Promise<void>;
  setOutputDevice: (deviceId: string) => void;
  updateVoiceSettingsPatch: (patch: Partial<VoiceSettings>) => void;
  setMemberVolume: (userId: string, volume: number) => void;
  resetMemberVolume: (userId: string) => void;
  resetAllMemberVolumes: () => void;
  getMemberVolume: (userId: string) => number;
  bindAudioElement: (userId: string, element: HTMLAudioElement | null) => void;
};

export type VoiceConnectionPhase =
  | "idle"
  | "connecting"
  | "connected"
  | "switching"
  | "disconnecting"
  | "error";

export type VoiceKickPayload = {
  targetUserId: string;
  channelId: string;
  kickedBy: string;
};

export type VoiceRealtimeStatus =
  | "SUBSCRIBED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | "CLOSED"
  | string;

export type VoiceRealtimeEventPayload = {
  payload?: unknown;
};

export type VoiceRealtimeChannel = {
  topic?: string;
  on: (
    type: "broadcast" | "presence",
    filter: { event: string },
    callback: (payload: VoiceRealtimeEventPayload) => void,
  ) => VoiceRealtimeChannel;
  subscribe: (callback?: (status: VoiceRealtimeStatus) => void) => unknown;
  send: (payload: {
    type: "broadcast";
    event: string;
    payload: unknown;
  }) => Promise<string>;
  track?: (payload: VoicePresenceStateRow) => Promise<string>;
  untrack?: () => Promise<string>;
  presenceState: () => Record<string, VoicePresenceStateRow[]>;
};

export type VoiceRealtimeTransport = {
  channel: (topic: string, options?: unknown) => VoiceRealtimeChannel;
  removeChannel: (channel: VoiceRealtimeChannel) => Promise<unknown> | unknown;
  getChannels?: () => VoiceRealtimeChannel[];
};

export type { VoiceSidebarParticipant };
