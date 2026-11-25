import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { createSolidTestCore } from "@solid-client/test-support/solidTestCore";
import { VoiceDock } from "./VoiceDock";

let core: any;
let controller: any;
vi.mock("@solid-client/core", () => ({ requireHavenSolidCore: () => core }));
vi.mock("@solid-client/contexts/VoiceProvider", () => ({
  useVoice: () => controller,
}));

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

describe("voice drawer", () => {
  it("expands, opens the full call and saves threshold without leaving or refetching on speaking updates", async () => {
    const test = createSolidTestCore();
    core = test.core;
    // Signed in as "self", owner of the community, with Jamie a member.
    core.state.set({ userId: "self" });
    core.communities.applyCommunity({
      id: "community",
      name: "Hearth",
      owner_id: "self",
      description: null,
      invites_enabled: true,
      report_reason_required: false,
      created_at: "2026-11-14T00:00:00.000Z",
      updated_at: "2026-11-14T00:00:00.000Z",
    });
    core.members.applyMember({
      community_id: "community",
      user_id: "jamie",
      nickname: "Jamie",
      joined_at: "2026-11-14T00:00:00.000Z",
    });
    const [canManage, setCanManage] = createSignal(false);
    vi.spyOn(core.communities, "can").mockImplementation(
      (_id: string, permission: string) =>
        permission === "manage_members" && canManage(),
    );
    const control = vi
      .spyOn(core.voice, "controlParticipant")
      .mockResolvedValue();
    const [voice, setVoice] = createStore({
      activeChannel: {
        communityId: "community",
        channelId: "channel",
        channelName: "Game room",
      },
      joined: true,
      joining: false,
      isMuted: false,
      isDeafened: false,
      participants: [
        {
          userId: "jamie",
          displayName: "Jamie",
          isSpeaking: false,
          sessionId: "jamie-call",
        },
      ],
      localSpeaking: false,
      memberVolumes: {},
      inputDevices: [],
      outputDevices: [],
      selectedInputDeviceId: "default",
      selectedOutputDeviceId: "default",
      supportsOutputSelection: true,
      localInputLevel: 0.18,
      voiceActivityGateOpen: false,
    });
    controller = {
      voice,
      supportsTransmissionModes: true,
      leave: vi.fn(),
      toggleMute: vi.fn(),
      toggleDeafen: vi.fn(),
      setMemberVolume: vi.fn(),
    };
    const host = document.createElement("div");
    document.body.append(host);
    dispose = render(() => <VoiceDock />, host);
    const click = (label: string) => {
      const button = document.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
      expect(button, label).not.toBeNull();
      button!.click();
    };
    expect(
      document.querySelector('[aria-label="Voice participants"]'),
    ).toBeNull();
    click("Expand participants");
    expect(
      document.querySelector('[aria-label="Voice participants"]')?.textContent,
    ).toContain("Jamie");
    setVoice("participants", 0, "isSpeaking", true);
    click("Actions for Jamie");
    await Promise.resolve();
    expect(
      document.querySelector('[aria-label="Volume for Jamie"]'),
    ).not.toBeNull();
    const actionButton = () =>
      Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent === "Remove from channel",
      );
    expect(actionButton()).toBeUndefined();
    setCanManage(true);
    expect(actionButton()).toBeDefined();
    actionButton()!.click();
    expect(control).toHaveBeenCalledWith("jamie", "channel", "remove");
    click("Actions for Jamie");
    click("Expand to full voice screen");
    await Promise.resolve();
    expect(
      document.querySelector('[aria-label="Call participants"]')?.textContent,
    ).toContain("Jamie");
    click("Return to voice drawer");
    click("Microphone and audio settings");
    await Promise.resolve();
    const slider = document.querySelector<HTMLInputElement>(
      '[aria-label="Voice activation threshold"]',
    )!;
    expect(slider).not.toBeNull();
    slider.value = "31";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(core.stores.voice.settings.voiceActivationThreshold).toBe(31);
    click("Close audio settings");
    click("Collapse participants");
    expect(
      document.querySelector('[aria-label="Voice participants"]'),
    ).toBeNull();
    expect(controller.leave).not.toHaveBeenCalled();
  });
});
