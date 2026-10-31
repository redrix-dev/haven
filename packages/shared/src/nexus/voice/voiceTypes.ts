import type {
  VoiceChannelReference,
  VoiceSidebarParticipant,
} from "@shared/types/types";
import type { VoiceConnectionPhase } from "@shared/features/voice/types";
import type { VoiceSoundSettings } from "@shared/features/voice/utils/voiceSounds";

export type VoiceSessionSnapshot = {
  joined: boolean;
  isMuted: boolean;
  isDeafened: boolean;
};

export type VoiceState = {
  soundSettings: VoiceSoundSettings;
  phase: VoiceConnectionPhase;
  activeChannel: VoiceChannelReference | null;
  pendingChannel: VoiceChannelReference | null;
  error: string | null;
  joined: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  currentChannelId: string | null;
  /** The roster of the channel this user is in. */
  participants: VoiceSidebarParticipant[];
  /** Rosters of the community's other voice channels, from presence. */
  participantsByChannelId: Record<string, VoiceSidebarParticipant[]>;
  voiceConnected: boolean;
  sessionState: VoiceSessionSnapshot | null;
};
