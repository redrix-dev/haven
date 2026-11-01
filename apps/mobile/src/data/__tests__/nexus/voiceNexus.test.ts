import { describe, expect, it, vi } from "vitest";
import { routeRealtimeEvent } from "@shared/core/routeRealtimeEvent";
import type { RealtimeMutationTarget } from "@shared/core/realtimeMutationTarget";
import type {
  VoiceRealtimeChannel,
  VoiceRealtimeTransport,
} from "@shared/features/voice/types";
import { selectChannelParticipants } from "@shared/nexus/voice/voiceNexus";
import { VoiceReactNexus as VoiceNexus } from "@mobile-data/voice/voiceReactNexus";
import type { VoicePresenceStateRow } from "@shared/types/types";

class FakeVoiceRealtimeChannel implements VoiceRealtimeChannel {
  readonly sent: Array<{
    type: "broadcast";
    event: string;
    payload: unknown;
  }> = [];
  readonly tracked: VoicePresenceStateRow[] = [];
  untracked = false;
  private readonly callbacks = new Map<
    string,
    (payload: { payload?: unknown }) => void
  >();
  private presence: Record<string, VoicePresenceStateRow[]> = {};

  constructor(
    readonly topic: string,
    private readonly status: string = "SUBSCRIBED",
    private readonly sendStatus: string = "ok",
  ) {}

  on(
    type: "broadcast" | "presence",
    filter: { event: string },
    callback: (payload: { payload?: unknown }) => void,
  ): VoiceRealtimeChannel {
    this.callbacks.set(`${type}:${filter.event}`, callback);
    return this;
  }

  subscribe(callback?: (status: string) => void): unknown {
    callback?.(this.status);
    return this;
  }

  async send(payload: {
    type: "broadcast";
    event: string;
    payload: unknown;
  }): Promise<string> {
    this.sent.push(payload);
    return this.sendStatus;
  }

  async track(payload: VoicePresenceStateRow): Promise<string> {
    this.tracked.push(payload);
    this.presence[payload.user_id ?? this.topic] = [payload];
    return "ok";
  }

  async untrack(): Promise<string> {
    this.untracked = true;
    return "ok";
  }

  presenceState(): Record<string, VoicePresenceStateRow[]> {
    return this.presence;
  }

  setPresenceState(presence: Record<string, VoicePresenceStateRow[]>): void {
    this.presence = presence;
  }

  emitBroadcast(event: string, payload: unknown): void {
    this.callbacks.get(`broadcast:${event}`)?.({ payload });
  }

  emitPresence(event: string): void {
    this.callbacks.get(`presence:${event}`)?.({});
  }
}

class FakeVoiceRealtimeTransport implements VoiceRealtimeTransport {
  readonly channels: FakeVoiceRealtimeChannel[] = [];
  readonly removed: FakeVoiceRealtimeChannel[] = [];

  channel(topic: string): VoiceRealtimeChannel {
    const channel = new FakeVoiceRealtimeChannel(topic);
    this.channels.push(channel);
    return channel;
  }

  async removeChannel(channel: VoiceRealtimeChannel): Promise<void> {
    this.removed.push(channel as FakeVoiceRealtimeChannel);
  }

  getChannels(): VoiceRealtimeChannel[] {
    return this.channels;
  }
}

class DeferredVoiceRealtimeChannel extends FakeVoiceRealtimeChannel {
  private subscribeCallback: ((status: string) => void) | null = null;

  subscribe(callback?: (status: string) => void): unknown {
    this.subscribeCallback = callback ?? null;
    return this;
  }

  emitStatus(status: string): void {
    this.subscribeCallback?.(status);
  }
}

const buildNexus = () => {
  const tokenBackend = {
    sendControl: vi.fn(async () => {}),
    fetchToken: vi.fn(async () => ({
      token: "voice-token",
      serverUrl: "wss://voice.example.test",
    })),
  };
  const realtime = new FakeVoiceRealtimeTransport();
  const nexus = new VoiceNexus(tokenBackend, realtime);

  return { nexus, realtime, tokenBackend };
};

describe("VoiceNexus", () => {
  it("owns voice session phase transitions and clear behavior", () => {
    const { nexus } = buildNexus();
    const first = { id: "voice-a", name: "Alpha", community_id: "server-1" };
    const second = { id: "voice-b", name: "Bravo", community_id: "server-1" };

    nexus.startConnect(first);
    expect(nexus.getSnapshot().phase).toBe("connecting");
    expect(nexus.getSnapshot().activeChannel?.id).toBe("voice-a");

    nexus.markConnected();
    expect(nexus.getSnapshot().phase).toBe("connected");

    nexus.startSwitch(second);
    expect(nexus.getSnapshot().phase).toBe("switching");
    expect(nexus.getSnapshot().pendingChannel?.id).toBe("voice-b");

    nexus.completeDisconnect();
    expect(nexus.getSnapshot().phase).toBe("connecting");
    expect(nexus.getSnapshot().activeChannel?.id).toBe("voice-b");
    expect(nexus.getSnapshot().pendingChannel).toBeNull();

    nexus.startDisconnect();
    nexus.completeDisconnect();
    expect(nexus.getSnapshot().phase).toBe("idle");
    expect(nexus.getSnapshot().activeChannel).toBeNull();

    nexus.startConnect(first);
    nexus.setParticipants([{ userId: "u1", displayName: "Uma" }]);
    nexus.clear();
    expect(nexus.getSnapshot().phase).toBe("idle");
    expect(nexus.getSnapshot().participants).toEqual([]);
  });

  it("stores mute and deafen state consistently", () => {
    const { nexus } = buildNexus();

    nexus.setMuted(true);
    expect(nexus.getSnapshot().isMuted).toBe(true);

    nexus.setMuted(false);
    nexus.setDeafened(true);
    expect(nexus.getSnapshot().isDeafened).toBe(true);
    expect(nexus.getSnapshot().isMuted).toBe(true);

    nexus.setDeafened(false);
    expect(nexus.getSnapshot().isDeafened).toBe(false);
  });

  it("tracks active and per-channel participants", () => {
    const { nexus } = buildNexus();

    nexus.startConnect({
      id: "voice-a",
      name: "Alpha",
      community_id: "server-1",
    });
    nexus.setParticipants([{ userId: "u1", displayName: "Uma" }]);
    nexus.setChannelParticipants("voice-b", [
      { userId: "u2", displayName: "Bea" },
    ]);

    expect(selectChannelParticipants(nexus.getSnapshot(), "voice-a")).toEqual([
      { userId: "u1", displayName: "Uma" },
    ]);
    expect(selectChannelParticipants(nexus.getSnapshot(), "voice-b")).toEqual([
      { userId: "u2", displayName: "Bea" },
    ]);

    nexus.retainChannelParticipants(["voice-a"]);
    expect(nexus.getSnapshot().participantsByChannelId).toEqual({});
  });

  it("fetches join credentials through the injected voice token backend", async () => {
    const { nexus, tokenBackend } = buildNexus();

    await expect(
      nexus.fetchJoinCredentials("server-1", "voice-a"),
    ).resolves.toEqual({
      token: "voice-token",
      serverUrl: "wss://voice.example.test",
    });
    expect(tokenBackend.fetchToken).toHaveBeenCalledWith("server-1", "voice-a");
  });

  it("routes courtesy controls through the backend and scopes receipt to the active call", async () => {
    const { nexus, realtime, tokenBackend } = buildNexus();
    const onKick = vi.fn();
    await nexus.connectKickChannel({
      communityId: "server-1",
      channelId: "voice-a",
      currentUserId: "target",
      sessionId: "current-call",
      onKick,
    });
    nexus.setJoined(true);
    nexus.setParticipantSessions([
      { userId: "other", sessionId: "other-call" },
    ]);
    await nexus.kickParticipant("other", "voice-a");
    expect(tokenBackend.sendControl).toHaveBeenCalledWith({
      communityId: "server-1",
      channelId: "voice-a",
      targetUserId: "other",
      targetSessionId: "other-call",
      action: "remove",
    });
    expect(realtime.channels).toHaveLength(0);
    const event = {
      community_id: "server-1",
      channel_id: "voice-a",
      channel_name: "Alpha",
      target_user_id: "target",
      target_session_id: "old-call",
      actor_user_id: "moderator",
      actor_name: "Jamie",
      action: "remove",
    };
    nexus.applyRemoteControl(event);
    expect(onKick).not.toHaveBeenCalled();
    // This event touches only voice; other domains are deliberately absent.
    routeRealtimeEvent({ voice: nexus } as unknown as RealtimeMutationTarget, {
      type: "VOICE_CONTROL",
      payload: { ...event, target_session_id: "current-call" },
    });
    expect(onKick).toHaveBeenCalledWith({
      targetUserId: "target",
      channelId: "voice-a",
      kickedBy: "moderator",
      kickedByName: "Jamie",
      channelName: "Alpha",
    });
    nexus.setJoined(false);
    expect(nexus.getSnapshot().controlNotice?.action).toBe("remove");
    // Teardown may still be awaiting presence cleanup when a command arrives.
    nexus.applyRemoteControl({ ...event, target_session_id: "current-call" });
    expect(onKick).toHaveBeenCalledOnce();
    await nexus.disconnectKickChannel();
    nexus.applyRemoteControl({ ...event, target_session_id: "current-call" });
    expect(onKick).toHaveBeenCalledOnce();
  });

  it("lets self and a moderator reverse mute/deafen without a lock", async () => {
    const { nexus } = buildNexus();
    await nexus.connectKickChannel({
      communityId: "server-1",
      channelId: "voice-a",
      currentUserId: "target",
      sessionId: "current-call",
      onKick: vi.fn(),
    });
    nexus.setJoined(true);
    const event = {
      community_id: "server-1",
      channel_id: "voice-a",
      channel_name: "Alpha",
      target_user_id: "target",
      target_session_id: "current-call",
      actor_user_id: "moderator",
      actor_name: "Jamie",
      action: "mute",
    };
    nexus.applyRemoteControl(event);
    expect(nexus.getSnapshot().isMuted).toBe(true);
    expect(nexus.getSnapshot().controlNotice?.actorName).toBe("Jamie");
    nexus.setMuted(false);
    expect(nexus.getSnapshot().isMuted).toBe(false);
    expect(nexus.getSnapshot().controlNotice).toBeNull();
    nexus.applyRemoteControl({ ...event, action: "deafen" });
    expect(nexus.getSnapshot().isDeafened).toBe(true);
    nexus.setDeafened(false);
    expect(nexus.getSnapshot().isDeafened).toBe(false);
    expect(nexus.getSnapshot().controlNotice).toBeNull();
    nexus.applyRemoteControl(event);
    nexus.applyRemoteControl({ ...event, action: "unmute" });
    expect(nexus.getSnapshot().isMuted).toBe(false);
    nexus.applyRemoteControl({ ...event, action: "deafen" });
    nexus.applyRemoteControl({ ...event, action: "undeafen" });
    expect(nexus.getSnapshot().isDeafened).toBe(false);
    expect(nexus.getSnapshot().controlNotice).toBeNull();
  });

  it("subscribes to presence channels and cleans them up", () => {
    const { nexus, realtime } = buildNexus();
    const cleanup = nexus.subscribePresenceChannels({
      communityId: "server-1",
      channelIds: ["voice-a"],
      activeChannelId: null,
    });

    const channel = realtime.channels[0];
    channel.setPresenceState({
      u1: [
        {
          user_id: "u1",
          display_name: "Uma",
          avatar_url: "https://example.test/u1.png",
          is_speaking: true,
        },
      ],
    });
    channel.emitPresence("sync");

    expect(nexus.getSnapshot().participantsByChannelId).toEqual({
      "voice-a": [
        {
          userId: "u1",
          displayName: "Uma",
          avatarUrl: "https://example.test/u1.png",
          isSpeaking: true,
        },
      ],
    });

    cleanup();
    expect(realtime.removed).toContain(channel);
  });

  it("publishes active voice presence and untracks on disconnect", async () => {
    const { nexus, realtime } = buildNexus();

    await nexus.connectPresenceChannel({
      communityId: "server-1",
      channelId: "voice-a",
      currentUserId: "u1",
      displayName: "Uma",
      avatarUrl: "https://example.test/u1.png",
    });

    const channel = realtime.channels[0];
    expect(channel.topic).toBe("voice:presence:server-1:voice-a");
    expect(channel.tracked).toEqual([
      {
        user_id: "u1",
        display_name: "Uma",
        avatar_url: "https://example.test/u1.png",
        is_speaking: false,
      },
    ]);

    await nexus.disconnectPresenceChannel();

    expect(channel.untracked).toBe(true);
    expect(realtime.removed).toContain(channel);
  });
});
