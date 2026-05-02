import { create } from 'zustand';

/**
 * Incremented when `useSocialWorkspace` receives any `social_graph` realtime payload.
 * Friends UI (modal) subscribes to `revision` to refresh lists without opening a second Realtime channel.
 */
type SocialGraphRealtimeState = {
  revision: number;
  bump: () => void;
};

export const useSocialGraphRealtimeStore = create<SocialGraphRealtimeState>((set) => ({
  revision: 0,
  bump: () => set((s) => ({ revision: s.revision + 1 })),
}));
