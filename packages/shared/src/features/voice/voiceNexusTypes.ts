import type { VoiceChannelReference, VoiceSidebarParticipant } from "@shared/types/types";
import type { VoiceConnectionPhase } from "./types";

export type VoiceSessionSnapshot = {
  joined: boolean;
  isMuted: boolean;
  isDeafened: boolean;
};

export type VoiceNexusState = {
  phase: VoiceConnectionPhase;
  activeChannel: VoiceChannelReference | null;
  pendingChannel: VoiceChannelReference | null;
  error: string | null;
  joined: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  currentChannelId: string | null;
  participants: VoiceSidebarParticipant[];
  participantsByChannelId: Record<string, VoiceSidebarParticipant[]>;
  voiceConnected: boolean;
  sessionState: VoiceSessionSnapshot | null;
  revision: number;
};
