import { create } from 'zustand';
import type { VoiceSidebarParticipant } from '@client/app/types';

type VoiceSessionSnapshot = {
  joined: boolean;
  isMuted: boolean;
  isDeafened: boolean;
};

const createDefaultVoiceSessionState = (): VoiceSessionSnapshot => ({
  joined: false,
  isMuted: false,
  isDeafened: false,
});

const createDefaultVoiceStoreState = () => ({
  joined: false,
  isMuted: false,
  isDeafened: false,
  currentChannelId: null as string | null,
  participants: [] as VoiceSidebarParticipant[],
  voiceConnected: false,
  sessionState: createDefaultVoiceSessionState() as VoiceSessionSnapshot | null,
});

export type VoiceStoreState = {
  joined: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  currentChannelId: string | null;
  participants: VoiceSidebarParticipant[];
  voiceConnected: boolean;
  sessionState: VoiceSessionSnapshot | null;
  setJoined: (joined: boolean) => void;
  setIsMuted: (isMuted: boolean) => void;
  setIsDeafened: (isDeafened: boolean) => void;
  setCurrentChannelId: (currentChannelId: string | null) => void;
  setParticipants: (participants: VoiceSidebarParticipant[]) => void;
  setVoiceConnected: (voiceConnected: boolean) => void;
  setSessionState: (sessionState: VoiceSessionSnapshot | null) => void;
  reset: () => void;
};

export const useVoiceStore = create<VoiceStoreState>()((set) => ({
  ...createDefaultVoiceStoreState(),
  setJoined: (joined) => set({ joined }),
  setIsMuted: (isMuted) => set({ isMuted }),
  setIsDeafened: (isDeafened) => set({ isDeafened }),
  setCurrentChannelId: (currentChannelId) => set({ currentChannelId }),
  setParticipants: (participants) => set({ participants }),
  setVoiceConnected: (voiceConnected) => set({ voiceConnected }),
  setSessionState: (sessionState) => set({ sessionState }),
  reset: () => set(createDefaultVoiceStoreState()),
}));
