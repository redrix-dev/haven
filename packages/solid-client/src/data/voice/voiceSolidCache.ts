import { createStore } from "solid-js/store";
import type { VoiceChannelReference, VoiceSidebarParticipant } from "@shared/types/types";
import type { VoiceConnectionPhase } from "@shared/features/voice/types";

export type VoiceSolidState = {
  phase: VoiceConnectionPhase;
  activeChannel: VoiceChannelReference | null;
  participants: VoiceSidebarParticipant[];
};

/** Solid-native voice cache stub for typecheck:solid. */
export class VoiceSolidCache {
  private readonly state: VoiceSolidState;

  constructor() {
    const [state] = createStore<VoiceSolidState>({
      phase: "idle",
      activeChannel: null,
      participants: [],
    });
    this.state = state;
  }

  clear(): void {
    void this.state;
  }
}
