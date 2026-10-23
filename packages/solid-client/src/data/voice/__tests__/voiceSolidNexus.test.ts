import { describe, expect, it } from "vitest";
import type { VoiceSidebarParticipant } from "@shared/types/types";
import { VoiceSolidNexus } from "../voiceSolidNexus";

describe("VoiceSolidNexus", () => {
  it("patches speaking state without replacing participant rows", () => {
    const nexus = new VoiceSolidNexus();
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

  it("removes only the departed row when someone leaves mid-roster", () => {
    const nexus = new VoiceSolidNexus();
    nexus.setParticipants([
      { userId: "ada", displayName: "Ada" },
      { userId: "grace", displayName: "Grace" },
      { userId: "linus", displayName: "Linus" },
    ]);
    const ada = nexus.state.participants[0];
    const linus = nexus.state.participants[2];

    nexus.setParticipants([
      { userId: "ada", displayName: "Ada" },
      { userId: "linus", displayName: "Linus" },
    ]);

    // Matched by userId: Linus's row moves up intact. Matched by position, the
    // second row would be Grace's object morphed into Linus.
    expect(nexus.state.participants[0]).toBe(ada);
    expect(nexus.state.participants[1]).toBe(linus);
    expect(nexus.state.participants[1]?.displayName).toBe("Linus");
  });

  it("keeps presence rows keyed by userId too", () => {
    const nexus = new VoiceSolidNexus();
    nexus.setChannelParticipants("voice-b", [
      { userId: "ada", displayName: "Ada" },
      { userId: "grace", displayName: "Grace" },
    ]);
    const grace = nexus.state.participantsByChannelId["voice-b"]?.[1];

    nexus.setChannelParticipants("voice-b", [
      { userId: "grace", displayName: "Grace" },
    ]);

    expect(nexus.state.participantsByChannelId["voice-b"]?.[0]).toBe(grace);
  });
});
