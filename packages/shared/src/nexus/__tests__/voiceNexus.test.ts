import { describe, expect, it, vi } from "vitest";
import { createMemoryPersistence, createViewerMessagePolicyStore } from "@shared/core";
import {
  VoiceNexus,
  type VoiceRealtimeChannel,
  type VoiceRealtimeTransport,
} from "@shared/nexus/voice/VoiceNexus";
import type { VoicePresenceStateRow } from "@shared/types/types";

class FakeVoiceRealtimeChannel implements VoiceRealtimeChannel {
  readonly sent: Array<{
    type: "broadcast";
    event: string;
    payload: unknown;
  }> = [];
  readonly tracked: VoicePresenceStateRow[] = [];
  untracked = false;
  private readonly callbacks = new Map<string, (payload: { payload?: unknown }) => void>();
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
    fetchToken: vi.fn(async () => ({
      token: "voice-token",
      serverUrl: "wss://voice.example.test",
    })),
  };
  const realtime = new FakeVoiceRealtimeTransport();
  const policy = createViewerMessagePolicyStore();
  const nexus = new VoiceNexus(
    createMemoryPersistence(),
    policy,
    tokenBackend,
    realtime,
  );

  return { nexus, policy, realtime, tokenBackend };
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

    nexus.startConnect({ id: "voice-a", name: "Alpha", community_id: "server-1" });
    nexus.setParticipants([{ userId: "u1", displayName: "Uma" }]);
    nexus.setChannelParticipants("voice-b", [
      { userId: "u2", displayName: "Bea" },
    ]);

    expect(nexus.getVisibleParticipantsSnapshot("voice-a")).toEqual([
      { userId: "u1", displayName: "Uma" },
    ]);
    expect(nexus.getVisibleParticipantsSnapshot("voice-b")).toEqual([
      { userId: "u2", displayName: "Bea" },
    ]);

    nexus.retainChannelParticipants(["voice-a"]);
    expect(nexus.getParticipantsByChannelSnapshot()).toEqual({});
  });

  it("filters hidden participants from visible snapshots", () => {
    const { nexus, policy } = buildNexus();
    policy.setState((state) => ({
      ...state,
      hiddenAuthorIds: new Set(["blocked"]),
    }));

    nexus.setChannelParticipants("voice-a", [
      { userId: "allowed", displayName: "Allowed" },
      { userId: "blocked", displayName: "Blocked" },
    ]);

    expect(nexus.getVisibleParticipantsSnapshot("voice-a")).toEqual([
      { userId: "allowed", displayName: "Allowed" },
    ]);
  });

  it("fetches join credentials through the injected voice token backend", async () => {
    const { nexus, tokenBackend } = buildNexus();

    await expect(nexus.fetchJoinCredentials("server-1", "voice-a")).resolves.toEqual({
      token: "voice-token",
      serverUrl: "wss://voice.example.test",
    });
    expect(tokenBackend.fetchToken).toHaveBeenCalledWith("server-1", "voice-a");
  });

  it("connects, sends, receives, and disconnects kick broadcasts", async () => {
    const { nexus, realtime } = buildNexus();
    const onKick = vi.fn();

    await nexus.connectKickChannel({
      communityId: "server-1",
      channelId: "voice-a",
      currentUserId: "target",
      onKick,
    });

    const channel = realtime.channels[0];
    await nexus.kickParticipant("other", "voice-a");
    expect(channel.sent).toEqual([
      {
        type: "broadcast",
        event: "voice_kick",
        payload: {
          targetUserId: "other",
          channelId: "voice-a",
          kickedBy: "target",
        },
      },
    ]);

    channel.emitBroadcast("voice_kick", {
      targetUserId: "target",
      channelId: "voice-a",
      kickedBy: "moderator",
    });
    expect(onKick).toHaveBeenCalledWith({
      targetUserId: "target",
      channelId: "voice-a",
      kickedBy: "moderator",
    });

    await nexus.disconnectKickChannel();
    expect(realtime.removed).toContain(channel);
  });

  it("discards stale overlapping kick channel connects", async () => {
    const tokenBackend = {
      fetchToken: vi.fn(async () => ({
        token: "voice-token",
        serverUrl: "wss://voice.example.test",
      })),
    };
    const policy = createViewerMessagePolicyStore();
    const channels: DeferredVoiceRealtimeChannel[] = [];
    const removed: DeferredVoiceRealtimeChannel[] = [];
    const realtime: VoiceRealtimeTransport = {
      channel: (topic) => {
        const channel = new DeferredVoiceRealtimeChannel(topic);
        channels.push(channel);
        return channel;
      },
      removeChannel: async (channel) => {
        removed.push(channel as DeferredVoiceRealtimeChannel);
      },
    };
    const nexus = new VoiceNexus(
      createMemoryPersistence(),
      policy,
      tokenBackend,
      realtime,
    );

    const first = nexus.connectKickChannel({
      communityId: "server-1",
      channelId: "voice-a",
      currentUserId: "target",
      onKick: vi.fn(),
    });
    await Promise.resolve();
    const second = nexus.connectKickChannel({
      communityId: "server-1",
      channelId: "voice-b",
      currentUserId: "target",
      onKick: vi.fn(),
    });
    await Promise.resolve();

    channels[1]?.emitStatus("SUBSCRIBED");
    await second;
    channels[0]?.emitStatus("SUBSCRIBED");
    await first;

    await nexus.kickParticipant("other", "voice-b");

    expect(channels[0]?.sent).toEqual([]);
    expect(channels[1]?.sent).toHaveLength(1);
    expect(removed).toContain(channels[0]);
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

    expect(nexus.getParticipantsByChannelSnapshot()).toEqual({
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
