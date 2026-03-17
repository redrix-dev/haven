// @vitest-environment jsdom
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_NOTIFICATION_AUDIO_SETTINGS, DEFAULT_VOICE_SETTINGS } from "@client/app/constants";
import { useVoice } from "@client/features/voice/hooks/useVoice";
import { useVoiceSessionController } from "@client/features/voice/hooks/useVoiceSessionController";
import { VoiceDrawer } from "@shared/components/voice/VoiceDrawer";
import type { Channel } from "@shared/lib/backend/types";

const voiceMocks = vi.hoisted(() => {
  type PresenceHandler = () => void;
  type BroadcastHandler = (payload: { payload?: unknown }) => void;
  type MockChannel = {
    topic: string;
    config: unknown;
    setPresenceState: (nextState: Record<string, unknown>) => void;
    emitPresence: (event: "sync" | "join" | "leave") => void;
    emitBroadcast: (event: string, payload: unknown) => void;
    track: ReturnType<typeof vi.fn>;
    untrack: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    presenceState: ReturnType<typeof vi.fn>;
  };

  const channels: MockChannel[] = [];
  const removedChannels: MockChannel[] = [];

  const createChannel = (
    topic: string,
    options?: { autoSubscribe?: boolean; config?: unknown },
  ): MockChannel => {
    const autoSubscribe = options?.autoSubscribe ?? true;
    const presenceHandlers: Partial<Record<"sync" | "join" | "leave", PresenceHandler>> = {};
    const broadcastHandlers: Record<string, BroadcastHandler> = {};
    let presenceStateValue: Record<string, unknown> = {};
    const channel: MockChannel = {
      topic,
      config: options?.config ?? null,
      setPresenceState: (nextState) => {
        presenceStateValue = nextState;
      },
      emitPresence: (event) => {
        presenceHandlers[event]?.();
      },
      emitBroadcast: (event, payload) => {
        broadcastHandlers[event]?.({ payload });
      },
      track: vi.fn(async () => "ok"),
      untrack: vi.fn(async () => "ok"),
      send: vi.fn(async () => "ok"),
      on: vi.fn((kind: string, filter: { event?: string }, handler: unknown) => {
        if (
          kind === "presence" &&
          (filter.event === "sync" ||
            filter.event === "join" ||
            filter.event === "leave")
        ) {
          presenceHandlers[filter.event] = handler as PresenceHandler;
        }
        if (kind === "broadcast" && typeof filter.event === "string") {
          broadcastHandlers[filter.event] = handler as BroadcastHandler;
        }
        return channel;
      }),
      subscribe: vi.fn((callback?: (status: string) => void) => {
        if (autoSubscribe && callback) {
          Promise.resolve().then(() => callback("SUBSCRIBED"));
        }
        return channel;
      }),
      presenceState: vi.fn(() => presenceStateValue),
    };

    channels.push(channel);
    return channel;
  };

  const removeChannel = vi.fn(async (channel: MockChannel) => {
    removedChannels.push(channel);
    const index = channels.indexOf(channel);
    if (index >= 0) {
      channels.splice(index, 1);
    }
    return "ok";
  });

  const fetchIceConfig = vi.fn(async () => ({
    source: "fallback" as const,
    iceServers: [],
    warning: undefined,
    blockedReason: undefined,
  }));

  const playVoicePresenceSound = vi.fn(async () => {});

  const reset = () => {
    channels.splice(0, channels.length);
    removedChannels.splice(0, removedChannels.length);
    removeChannel.mockClear();
    fetchIceConfig.mockClear();
    playVoicePresenceSound.mockClear();
  };

  return {
    channels,
    removedChannels,
    createChannel,
    removeChannel,
    fetchIceConfig,
    playVoicePresenceSound,
    reset,
  };
});

vi.mock("@shared/lib/supabase", () => ({
  supabase: {
    channel: (topic: string, options?: { config?: unknown }) =>
      voiceMocks.createChannel(topic, { config: options?.config }),
    getChannels: () => voiceMocks.channels,
    removeChannel: voiceMocks.removeChannel,
  },
}));

vi.mock("@shared/lib/voice/ice", () => ({
  fetchIceConfig: voiceMocks.fetchIceConfig,
}));

vi.mock("@shared/lib/notifications/sound", () => ({
  playVoicePresenceSound: voiceMocks.playVoicePresenceSound,
}));

const nowIso = new Date("2026-03-16T12:00:00.000Z").toISOString();

function makeChannel(
  id: string,
  name: string,
  kind: Channel["kind"],
  communityId: string,
): Channel {
  return {
    id,
    name,
    kind,
    community_id: communityId,
    created_at: nowIso,
    updated_at: nowIso,
    created_by_user_id: "user-1",
    position: 0,
    topic: null,
  };
}

const VOICE_SERVER_CHANNELS: Channel[] = [
  makeChannel("text-1", "general", "text", "server-voice"),
  makeChannel("voice-1", "Lobby", "voice", "server-voice"),
  makeChannel("voice-2", "Raid", "voice", "server-voice"),
];

const OTHER_SERVER_CHANNELS: Channel[] = [
  makeChannel("text-2", "ops", "text", "server-other"),
  makeChannel("voice-3", "War Room", "voice", "server-other"),
];

type VoiceControllerHarnessProps = {
  currentServerId: string | null;
  channels: Channel[];
};

function VoiceControllerHarness({
  currentServerId,
  channels,
}: VoiceControllerHarnessProps) {
  const [currentChannelId, setCurrentChannelId] = React.useState<string | null>(
    channels.find((channel) => channel.kind === "text")?.id ?? null,
  );
  const [voiceSettings, setVoiceSettings] = React.useState({
    ...DEFAULT_VOICE_SETTINGS,
  });

  const voice = useVoice({
    currentServerId,
    currentUserId: "user-1",
    currentUserDisplayName: "Test User",
    currentUserAvatarUrl: null,
    currentChannelId,
    setCurrentChannelId,
    voiceHardwareDebugPanelEnabled: false,
    channels,
  });
  const activeControllerChannel = React.useMemo(
    () =>
      voice.derived.activeVoiceChannel
        ? {
            communityId: voice.derived.activeVoiceChannel.community_id,
            channelId: voice.derived.activeVoiceChannel.id,
            channelName: voice.derived.activeVoiceChannel.name,
          }
        : null,
    [voice.derived.activeVoiceChannel],
  );

  const controller = useVoiceSessionController({
    activeChannel: activeControllerChannel,
    currentUserId: "user-1",
    currentUserDisplayName: "Test User",
    currentUserAvatarUrl: null,
    voiceSettings,
    notificationAudioSettings: DEFAULT_NOTIFICATION_AUDIO_SETTINGS,
    onUpdateVoiceSettings: setVoiceSettings,
    onParticipantsChange: voice.actions.setVoiceParticipants,
    onConnectionChange: voice.actions.setVoiceConnected,
    onSessionStateChange: voice.actions.setVoiceSessionState,
    onControlActionsReady: voice.actions.setVoiceControlActions,
    onSessionError: () => undefined,
  });

  const activeVoiceChannelId = voice.derived.activeVoiceChannel?.id ?? null;

  return (
    <div>
      <button
        type="button"
        onClick={() => voice.actions.requestVoiceChannelJoin("voice-1")}
      >
        Request Voice 1
      </button>
      <button
        type="button"
        onClick={() => voice.actions.requestVoiceChannelJoin("voice-2")}
      >
        Request Voice 2
      </button>
      <button
        type="button"
        onClick={() => voice.actions.requestVoiceChannelJoin("voice-3")}
      >
        Request Voice 3
      </button>
      <button
        type="button"
        onClick={() => {
          void voice.actions.confirmVoiceChannelJoin();
        }}
      >
        Confirm Voice Join
      </button>
      <button
        type="button"
        onClick={() => {
          void voice.actions.disconnectVoiceSession({ triggerPaneLeave: false });
        }}
      >
        Disconnect Quietly
      </button>

      <div data-testid="active-voice-channel">
        {voice.derived.activeVoiceChannel?.id ?? "none"}
      </div>
      <div data-testid="voice-connected">{String(controller.state.joined)}</div>
      <div data-testid="voice-panel-open">
        {String(voice.state.voicePanelOpen)}
      </div>

      {voice.derived.activeVoiceChannel && (
        <VoiceDrawer
          surface="sidebar"
          serverName="Voice Server"
          channelName={voice.derived.activeVoiceChannel.name}
          participantCount={
            controller.state.participants.length + (controller.state.joined ? 1 : 0)
          }
          participantPreview={
            activeVoiceChannelId
              ? voice.derived.voiceChannelParticipants[activeVoiceChannelId] ?? []
              : []
          }
          voiceConnected={controller.state.joined}
          voicePanelOpen={voice.state.voicePanelOpen}
          joining={controller.state.joining}
          voiceSessionState={{
            joined: controller.state.joined,
            isMuted: controller.state.isMuted,
            isDeafened: controller.state.isDeafened,
          }}
          transmissionMode={voiceSettings.transmissionMode}
          inputDevices={controller.state.inputDevices}
          outputDevices={controller.state.outputDevices}
          selectedInputDeviceId={controller.state.selectedInputDeviceId}
          selectedOutputDeviceId={controller.state.selectedOutputDeviceId}
          supportsOutputSelection={controller.state.supportsOutputSelection}
          onOpenChange={voice.actions.setVoicePanelOpen}
          onJoin={() => {
            void controller.actions.joinVoiceChannel();
          }}
          onToggleMute={controller.actions.toggleMute}
          onToggleDeafen={controller.actions.toggleDeafen}
          onDisconnect={() => {
            void voice.actions.disconnectVoiceSession();
          }}
          onSelectTransmissionMode={(mode) => {
            controller.actions.updateVoiceSettingsPatch({
              transmissionMode: mode,
            });
          }}
          onSelectInputDevice={(deviceId) => {
            void controller.actions.switchInputDevice(deviceId);
          }}
          onSelectOutputDevice={controller.actions.setOutputDevice}
          onOpenAdvancedOptions={() => undefined}
          onOpenVoiceHardwareTest={() => undefined}
        />
      )}
    </div>
  );
}

type VoiceStoreHarnessProps = {
  currentServerId: string | null;
  channels: Channel[];
  controlActions: {
    join: () => void;
    leave: () => Promise<void>;
    toggleMute: () => void;
    toggleDeafen: () => void;
  } | null;
};

function VoiceStoreHarness({
  currentServerId,
  channels,
  controlActions,
}: VoiceStoreHarnessProps) {
  const [currentChannelId, setCurrentChannelId] = React.useState<string | null>(
    channels.find((channel) => channel.kind === "text")?.id ?? null,
  );
  const voice = useVoice({
    currentServerId,
    currentUserId: "user-1",
    currentUserDisplayName: "Test User",
    currentUserAvatarUrl: null,
    currentChannelId,
    setCurrentChannelId,
    voiceHardwareDebugPanelEnabled: false,
    channels,
  });

  React.useEffect(() => {
    voice.actions.setVoiceControlActions(controlActions);
  }, [controlActions, voice.actions.setVoiceControlActions]);

  return (
    <div>
      <button
        type="button"
        onClick={() => voice.actions.requestVoiceChannelJoin("voice-1")}
      >
        Request Voice 1
      </button>
      <button
        type="button"
        onClick={() => voice.actions.requestVoiceChannelJoin("voice-2")}
      >
        Request Voice 2
      </button>
      <button
        type="button"
        onClick={() => voice.actions.requestVoiceChannelJoin("voice-3")}
      >
        Request Voice 3
      </button>
      <button
        type="button"
        onClick={() => {
          void voice.actions.confirmVoiceChannelJoin();
        }}
      >
        Confirm Voice Join
      </button>

      <div data-testid="active-voice-channel">
        {voice.derived.activeVoiceChannel?.id ?? "none"}
      </div>
    </div>
  );
}

describe("voice lifecycle regressions", () => {
  beforeEach(() => {
    voiceMocks.reset();
    const consoleError = console.error;
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      const firstArg = args[0];
      if (
        typeof firstArg === "string" &&
        firstArg.includes("Microphone permission failed during voice join")
      ) {
        return;
      }
      consoleError(...args);
    });

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          throw new Error("Microphone unavailable in test");
        }),
        enumerateDevices: vi.fn(async () => []),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    class MockRTCPeerConnection {
      connectionState: RTCPeerConnectionState = "new";
      iceConnectionState: RTCIceConnectionState = "new";
      signalingState: RTCSignalingState = "stable";
      iceGatheringState: RTCIceGatheringState = "new";
      localDescription: RTCSessionDescriptionInit | null = null;
      remoteDescription: RTCSessionDescriptionInit | null = null;
      ontrack: ((event: RTCTrackEvent) => void) | null = null;
      onicecandidate:
        | ((event: RTCPeerConnectionIceEvent) => void)
        | null = null;
      onconnectionstatechange: (() => void) | null = null;
      oniceconnectionstatechange: (() => void) | null = null;
      onsignalingstatechange: (() => void) | null = null;
      onicegatheringstatechange: (() => void) | null = null;

      addTrack = vi.fn();
      addTransceiver = vi.fn(() => ({
        sender: { track: null },
        direction: "sendrecv" as RTCRtpTransceiverDirection,
      }));
      getTransceivers = vi.fn(() => []);
      getSenders = vi.fn(() => []);
      createOffer = vi.fn(async () => ({ type: "offer" as const, sdp: "offer" }));
      createAnswer = vi.fn(async () => ({ type: "answer" as const, sdp: "answer" }));
      setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
        this.localDescription = description;
      });
      setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
        this.remoteDescription = description;
      });
      addIceCandidate = vi.fn(async () => undefined);
      restartIce = vi.fn(() => undefined);
      getStats = vi.fn(async () => new Map());
      close = vi.fn(() => undefined);
    }

    Object.defineProperty(globalThis, "RTCPeerConnection", {
      configurable: true,
      value: MockRTCPeerConnection,
    });

    if (!globalThis.crypto?.randomUUID) {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: {
          randomUUID: () => "11111111-1111-4111-8111-111111111111",
        },
      });
    } else {
      vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
        "11111111-1111-4111-8111-111111111111",
      );
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts the voice controller when join is confirmed with the drawer closed", async () => {
    const user = userEvent.setup();

    render(
      <VoiceControllerHarness
        currentServerId={null}
        channels={VOICE_SERVER_CHANNELS}
      />,
    );

    expect(screen.getByTestId("voice-panel-open").textContent).toBe("false");

    await user.click(screen.getByRole("button", { name: "Request Voice 1" }));
    await user.click(screen.getByRole("button", { name: "Confirm Voice Join" }));

    await waitFor(() => {
      expect(screen.getByTestId("voice-connected").textContent).toBe("true");
    });

    const joinedChannel = voiceMocks.channels.find(
      (channel) => channel.topic === "voice:presence:server-voice:voice-1",
    );

    expect(joinedChannel).toBeTruthy();
    expect(joinedChannel?.track).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("voice-panel-open").textContent).toBe("false");
  });

  it("keeps the voice session alive when quick settings are opened and closed", async () => {
    const user = userEvent.setup();

    render(
      <VoiceControllerHarness
        currentServerId={null}
        channels={VOICE_SERVER_CHANNELS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Request Voice 1" }));
    await user.click(screen.getByRole("button", { name: "Confirm Voice Join" }));

    await waitFor(() => {
      expect(screen.getByTestId("voice-connected").textContent).toBe("true");
    });

    expect(voiceMocks.removeChannel).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /voice quick settings/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("voice-panel-open").textContent).toBe("true");
    });

    await user.click(
      screen.getByRole("button", { name: /voice quick settings/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("voice-panel-open").textContent).toBe("false");
    });

    expect(screen.getByTestId("voice-connected").textContent).toBe("true");
    expect(voiceMocks.removeChannel).not.toHaveBeenCalled();
  });

  it("plays voice join and leave sounds when remote presence changes", async () => {
    const user = userEvent.setup();

    render(
      <VoiceControllerHarness
        currentServerId={null}
        channels={VOICE_SERVER_CHANNELS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Request Voice 1" }));
    await user.click(screen.getByRole("button", { name: "Confirm Voice Join" }));

    await waitFor(() => {
      expect(screen.getByTestId("voice-connected").textContent).toBe("true");
    });

    const activeChannel = voiceMocks.channels.find(
      (channel) => channel.topic === "voice:presence:server-voice:voice-1",
    );

    expect(activeChannel).toBeTruthy();
    voiceMocks.playVoicePresenceSound.mockClear();

    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1000);
    await act(async () => {
      activeChannel?.setPresenceState({});
      activeChannel?.emitPresence("sync");
    });

    expect(voiceMocks.playVoicePresenceSound).not.toHaveBeenCalled();

    await act(async () => {
      activeChannel?.setPresenceState({
        "remote-1": [
          {
            user_id: "remote-1",
            display_name: "Remote User",
            muted: false,
            deafened: false,
            is_speaking: false,
            joined_at: nowIso,
          },
        ],
      });
      activeChannel?.emitPresence("join");
    });

    await waitFor(() => {
      expect(voiceMocks.playVoicePresenceSound).toHaveBeenCalledWith({
        event: "voice_presence_join",
        audioSettings: DEFAULT_NOTIFICATION_AUDIO_SETTINGS,
      });
    });

    voiceMocks.playVoicePresenceSound.mockClear();
    nowSpy.mockReturnValue(2500);
    await act(async () => {
      activeChannel?.setPresenceState({});
      activeChannel?.emitPresence("leave");
    });

    await waitFor(() => {
      expect(voiceMocks.playVoicePresenceSound).toHaveBeenCalledWith({
        event: "voice_presence_leave",
        audioSettings: DEFAULT_NOTIFICATION_AUDIO_SETTINGS,
      });
    });
  });

  it("switches channels on the same server by leaving first and advancing the active channel", async () => {
    const user = userEvent.setup();
    const leave = vi.fn(async () => undefined);

    render(
      <VoiceStoreHarness
        currentServerId={null}
        channels={VOICE_SERVER_CHANNELS}
        controlActions={{
          join: () => undefined,
          leave,
          toggleMute: () => undefined,
          toggleDeafen: () => undefined,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Request Voice 1" }));
    await user.click(screen.getByRole("button", { name: "Confirm Voice Join" }));

    await waitFor(() => {
      expect(screen.getByTestId("active-voice-channel").textContent).toBe("voice-1");
    });

    const staleChannel = voiceMocks.createChannel(
      "voice:presence:server-voice:voice-1",
      { autoSubscribe: false },
    );

    await user.click(screen.getByRole("button", { name: "Request Voice 2" }));
    await user.click(screen.getByRole("button", { name: "Confirm Voice Join" }));

    await waitFor(() => {
      expect(screen.getByTestId("active-voice-channel").textContent).toBe("voice-2");
    });

    expect(leave).toHaveBeenCalledTimes(1);
    expect(voiceMocks.removeChannel).toHaveBeenCalledWith(staleChannel);
  });

  it("switches across servers while cleaning up the active voice topic instead of the browsed server topic", async () => {
    const user = userEvent.setup();
    const leave = vi.fn(async () => undefined);

    const { rerender } = render(
      <VoiceStoreHarness
        currentServerId={null}
        channels={VOICE_SERVER_CHANNELS}
        controlActions={{
          join: () => undefined,
          leave,
          toggleMute: () => undefined,
          toggleDeafen: () => undefined,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Request Voice 1" }));
    await user.click(screen.getByRole("button", { name: "Confirm Voice Join" }));

    await waitFor(() => {
      expect(screen.getByTestId("active-voice-channel").textContent).toBe("voice-1");
    });

    const activeTopic = voiceMocks.createChannel(
      "voice:presence:server-voice:voice-1",
      { autoSubscribe: false },
    );
    const realtimeActiveTopic = voiceMocks.createChannel(
      "realtime:voice:presence:server-voice:voice-1",
      { autoSubscribe: false },
    );
    const wrongCurrentServerTopic = voiceMocks.createChannel(
      "voice:presence:server-other:voice-1",
      { autoSubscribe: false },
    );

    rerender(
      <VoiceStoreHarness
        currentServerId="server-other"
        channels={OTHER_SERVER_CHANNELS}
        controlActions={{
          join: () => undefined,
          leave,
          toggleMute: () => undefined,
          toggleDeafen: () => undefined,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Request Voice 3" }));
    await user.click(screen.getByRole("button", { name: "Confirm Voice Join" }));

    await waitFor(() => {
      expect(screen.getByTestId("active-voice-channel").textContent).toBe("voice-3");
    });

    const removedTopics = voiceMocks.removedChannels.map((channel) => channel.topic);

    expect(leave).toHaveBeenCalledTimes(1);
    expect(removedTopics).toContain(activeTopic.topic);
    expect(removedTopics).toContain(realtimeActiveTopic.topic);
    expect(removedTopics).not.toContain(wrongCurrentServerTopic.topic);
  });
});
