import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import { createViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import type { VoiceSidebarParticipant } from "@shared/types/types";
import type { StoreApi, UseBoundStore } from "zustand";

type VoiceSessionSnapshot = {
  joined: boolean;
  isMuted: boolean;
  isDeafened: boolean;
};

export type VoiceNexusState = {
  joined: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  currentChannelId: string | null;
  participants: VoiceSidebarParticipant[];
  voiceConnected: boolean;
  sessionState: VoiceSessionSnapshot | null;
  revision: number;
};

const defaultSession = (): VoiceSessionSnapshot => ({
  joined: false,
  isMuted: false,
  isDeafened: false,
});

export class VoiceNexus {
  private readonly store: UseBoundStore<StoreApi<VoiceNexusState>>;
  private viewerPolicyStore: ViewerMessagePolicyStore;

  constructor(_persistence: NexusPersistence) {
    void _persistence;
    this.viewerPolicyStore = createViewerMessagePolicyStore();
    this.store = create<VoiceNexusState>()(() => ({
      joined: false,
      isMuted: false,
      isDeafened: false,
      currentChannelId: null,
      participants: [],
      voiceConnected: false,
      sessionState: null,
      revision: 0,
    }));
  }

  setViewerPolicyStore(store: ViewerMessagePolicyStore): void {
    this.viewerPolicyStore = store;
  }

  private bump(): void {
    this.store.setState((state) => ({ revision: state.revision + 1 }));
  }

  setJoined(joined: boolean): void {
    this.store.setState({ joined });
    this.bump();
  }

  setIsMuted(isMuted: boolean): void {
    this.store.setState({ isMuted });
    this.bump();
  }

  setIsDeafened(isDeafened: boolean): void {
    this.store.setState({ isDeafened });
    this.bump();
  }

  setCurrentChannelId(currentChannelId: string | null): void {
    this.store.setState({ currentChannelId });
    this.bump();
  }

  setParticipants(participants: VoiceSidebarParticipant[]): void {
    const previous = this.store.getState().participants;
    if (
      previous.length === participants.length &&
      previous.every(
        (entry, index) =>
          entry.userId === participants[index]?.userId &&
          entry.displayName === participants[index]?.displayName &&
          entry.avatarUrl === participants[index]?.avatarUrl &&
          entry.isSpeaking === participants[index]?.isSpeaking,
      )
    ) {
      return;
    }
    this.store.setState({ participants });
    this.bump();
  }

  setVoiceConnected(voiceConnected: boolean): void {
    if (this.store.getState().voiceConnected === voiceConnected) return;
    this.store.setState({ voiceConnected });
    this.bump();
  }

  setSessionState(sessionState: VoiceSessionSnapshot | null): void {
    const previous = this.store.getState().sessionState;
    if (
      previous?.joined === sessionState?.joined &&
      previous?.isMuted === sessionState?.isMuted &&
      previous?.isDeafened === sessionState?.isDeafened
    ) {
      return;
    }
    this.store.setState({ sessionState });
    this.bump();
  }

  useSession(): VoiceNexusState {
    return useStoreWithEqualityFn(this.store, (state) => {
      void state.revision;
      return state;
    });
  }

  useVisibleParticipants(_channelId: string): VoiceSidebarParticipant[] {
    const participants = useStoreWithEqualityFn(
      this.store,
      (state) => state.participants,
    );
    const hiddenAuthorIds = useStoreWithEqualityFn(
      this.viewerPolicyStore,
      (s) => s.hiddenAuthorIds,
      (a, b) => {
        if (a === b) return true;
        if (a.size !== b.size) return false;
        for (const id of a) {
          if (!b.has(id)) return false;
        }
        return true;
      },
    );

    if (hiddenAuthorIds.size === 0) {
      return participants;
    }
    return participants.filter((p) => !hiddenAuthorIds.has(p.userId));
  }

  getSnapshot(): VoiceNexusState {
    return this.store.getState();
  }

  rehydrate(): void {}

  clear(): void {
    this.store.setState({
      joined: false,
      isMuted: false,
      isDeafened: false,
      currentChannelId: null,
      participants: [],
      voiceConnected: false,
      sessionState: defaultSession(),
      revision: 0,
    });
  }
}
