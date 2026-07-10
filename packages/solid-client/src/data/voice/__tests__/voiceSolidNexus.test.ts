import { describe, expect, it } from "vitest";
import {
  createDefaultViewerMessagePolicyState,
  type ViewerMessagePolicyStore,
} from "@shared/core/viewerMessagePolicy";
import type { VoiceSidebarParticipant } from "@shared/types/types";
import { VoiceSolidNexus } from "../voiceSolidNexus";

function createViewerPolicyStore(): ViewerMessagePolicyStore {
  const state = createDefaultViewerMessagePolicyState();
  return {
    getState: () => state,
    getInitialState: () => state,
    subscribe: () => () => {},
    setState: () => {},
  };
}

describe("VoiceSolidNexus", () => {
  it("patches speaking state without replacing participant rows", () => {
    const nexus = new VoiceSolidNexus(createViewerPolicyStore());
    const participants: VoiceSidebarParticipant[] = [
      { userId: "ada", displayName: "Ada", isSpeaking: false },
      { userId: "grace", displayName: "Grace", isSpeaking: true },
    ];

    nexus.setParticipants(participants);
    const roster = nexus.state.participants;
    const ada = roster[0];
    const grace = roster[1];

    nexus.setSpeakingIds(["ada"]);

    expect(nexus.state.participants).toBe(roster);
    expect(nexus.state.participants[0]).toBe(ada);
    expect(nexus.state.participants[1]).toBe(grace);
    expect(nexus.state.participants[0]?.isSpeaking).toBe(true);
    expect(nexus.state.participants[1]?.isSpeaking).toBe(false);
  });
});
