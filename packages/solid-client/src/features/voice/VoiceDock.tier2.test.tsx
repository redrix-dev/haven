import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { createStore } from "solid-js/store";
import { VoiceSolidNexus } from "@solid-client/data/voice/voiceSolidNexus";
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
    const memory = new Map<string, string>();
    const persistence = {
      getString: (key: string) => memory.get(key) ?? null,
      set: (key: string, value: string) => void memory.set(key, value),
      remove: (key: string) => void memory.delete(key),
    };
    const nexus = new VoiceSolidNexus(undefined, undefined, persistence);
    const control = vi.spyOn(nexus, "controlParticipant").mockResolvedValue();
    const [permissions, setPermissions] = createStore({
      canManageMembers: false,
      canManageBans: false,
    });
    core = {
      voice: nexus,
      authStore: { getState: () => ({ user: { id: "self" } }) },
      profiles: { viewerProfile: () => () => ({ username: "Cody" }) },
      admin: {
        roleSnapshot: () => () => ({
          roles: [],
          members: [
            { userId: "self", isOwner: true, roleIds: [] },
            { userId: "jamie", isOwner: false, roleIds: [] },
          ],
        }),
        loadRoleManagement: vi.fn(async () => {}),
        members: () => () => [{ userId: "jamie", isOwner: false }],
        ensureMembersLoaded: vi.fn(async () => {}),
      },
      permissions: { getPermissions: () => permissions },
      ensureCommunityPermissions: vi.fn(async () => {}),
    };
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
    expect(core.admin.ensureMembersLoaded).toHaveBeenCalledTimes(1);
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
    setPermissions("canManageMembers", true);
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
    expect(
      new VoiceSolidNexus(undefined, undefined, persistence).getSnapshot()
        .settings.voiceActivationThreshold,
    ).toBe(31);
    click("Close audio settings");
    click("Collapse participants");
    expect(
      document.querySelector('[aria-label="Voice participants"]'),
    ).toBeNull();
    expect(controller.leave).not.toHaveBeenCalled();
  });
});
