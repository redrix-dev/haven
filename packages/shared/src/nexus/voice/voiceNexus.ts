import type {
  VoiceTokenBackend,
  VoiceTokenResponse,
} from "@shared/lib/backend/voiceTokenBackend";
import {
  normalizePresenceRows,
  resolveKickPayload,
  voiceParticipantListsEqual,
  voiceParticipantRecordsEqual,
} from "@shared/features/voice/logic";
import type {
  VoiceKickPayload,
  VoiceRealtimeChannel,
  VoiceRealtimeTransport,
} from "@shared/features/voice/types";
import type {
  VoiceChannelReference,
  VoiceSidebarParticipant,
} from "@shared/types/types";
import type { StatePort } from "../kit/statePort";
import type { VoiceSessionSnapshot, VoiceState } from "./voiceTypes";

const CHANNEL_CONNECT_TIMEOUT_MS = 12_000;

export const createInitialVoiceState = (): VoiceState => ({
  phase: "idle",
  activeChannel: null,
  pendingChannel: null,
  error: null,
  joined: false,
  isMuted: false,
  isDeafened: false,
  currentChannelId: null,
  participants: [],
  participantsByChannelId: {},
  voiceConnected: false,
  sessionState: null,
});

/**
 * The occupants shown under one voice channel: the live roster for the
 * channel this user is in, presence for every other channel.
 */
export const selectChannelParticipants = (
  state: VoiceState,
  channelId: string,
): VoiceSidebarParticipant[] | undefined => {
  if (
    state.activeChannel?.id === channelId ||
    state.currentChannelId === channelId
  ) {
    return state.participants;
  }
  return state.participantsByChannelId[channelId];
};

type ConnectKickChannelInput = {
  communityId: string;
  channelId: string;
  currentUserId: string;
  onKick: (payload: VoiceKickPayload) => void;
};

type ConnectPresenceChannelInput = {
  communityId: string;
  channelId: string;
  currentUserId: string;
  displayName: string;
  avatarUrl?: string | null;
  /**
   * Also drive the active-channel roster (`participants`) from this channel's
   * presence. Desktop Linux sets it: the native sidecar owns the media, so
   * there is no in-webview LiveKit room to call setParticipants. Everywhere
   * else LiveKit drives the roster.
   */
  syncRoster?: boolean;
};

type SubscribePresenceChannelsInput = {
  communityId: string;
  channelIds: string[];
  activeChannelId?: string | null;
};

/**
 * The voice session: connection phase, mute/deafen flags, who is in which
 * voice channel, the voice token fetch, and the Supabase presence and kick
 * channels (the documented exception to the single private realtime channel).
 * The media connection itself (LiveKit room or native sidecar) lives with the
 * platform's session controller, which reports into this nexus.
 *
 * Rosters are keyed by userId. The Solid port reconciles them by that key, so
 * a speaking flip or a join/leave updates rows in place instead of replacing
 * them (replacing rows crashes WebKitGTK's <For> mid-update).
 */
export class VoiceNexus {
  private kickChannel: VoiceRealtimeChannel | null = null;
  private kickContext: { currentUserId: string; channelId: string } | null =
    null;
  private kickConnectionSerial = 0;
  private presenceChannel: VoiceRealtimeChannel | null = null;
  private presenceConnectionSerial = 0;
  /**
   * Who is speaking right now (Linux native path). Presence carries the roster
   * but not per-frame speaking, so the sidecar's active speakers are overlaid.
   */
  private speakingIds = new Set<string>();

  constructor(
    protected readonly port: StatePort<VoiceState>,
    private readonly tokenBackend: VoiceTokenBackend | null,
    private readonly realtime: VoiceRealtimeTransport | null,
  ) {}

  getSnapshot(): VoiceState {
    return this.port.get();
  }

  // ─── session phase ─────────────────────────────────────────────────────────

  startConnect(channel: VoiceChannelReference): void {
    // A fresh session: drop the previous channel's speaking overlay.
    this.speakingIds.clear();
    const state = this.port.get();
    // Seed the roster from the presence we already have, so the channel row
    // doesn't blink empty while the media connection comes up. Copies, so
    // the two rosters never share row objects.
    const seed = (
      state.participantsByChannelId[channel.id] ?? state.participants
    ).map((participant) => ({ ...participant }));
    this.port.set({
      phase: "connecting",
      activeChannel: channel,
      pendingChannel: null,
      currentChannelId: channel.id,
      participants: seed,
      error: null,
    });
  }

  markConnected(): void {
    this.port.set({ phase: "connected", voiceConnected: true, error: null });
  }

  startSwitch(channel: VoiceChannelReference): void {
    this.port.set({ phase: "switching", pendingChannel: channel, error: null });
  }

  startDisconnect(): void {
    this.port.set({ phase: "disconnecting", error: null });
  }

  /** Finish leaving; if a switch was pending, start connecting to that channel. */
  completeDisconnect(): void {
    const pendingChannel = this.port.get().pendingChannel;
    if (pendingChannel) {
      this.port.set({
        phase: "connecting",
        activeChannel: pendingChannel,
        pendingChannel: null,
        currentChannelId: pendingChannel.id,
        voiceConnected: false,
        error: null,
      });
      return;
    }
    this.port.set({
      phase: "idle",
      activeChannel: null,
      pendingChannel: null,
      currentChannelId: null,
      voiceConnected: false,
      error: null,
    });
  }

  setError(message: string): void {
    this.port.set({ phase: "error", error: message });
  }

  // ─── session flags ─────────────────────────────────────────────────────────

  setJoined(joined: boolean): void {
    if (this.port.get().joined === joined) return;
    this.port.set({ joined });
  }

  setMuted(isMuted: boolean): void {
    if (this.port.get().isMuted === isMuted) return;
    this.port.set({ isMuted });
  }

  /** Deafening also mutes; undeafening leaves the mute as it is. */
  setDeafened(isDeafened: boolean): void {
    this.port.set(isDeafened ? { isDeafened, isMuted: true } : { isDeafened });
  }

  setCurrentChannelId(currentChannelId: string | null): void {
    if (this.port.get().currentChannelId === currentChannelId) return;
    this.port.set({ currentChannelId });
  }

  setVoiceConnected(voiceConnected: boolean): void {
    const state = this.port.get();
    if (state.voiceConnected === voiceConnected) return;
    this.port.set({
      voiceConnected,
      phase: voiceConnected ? "connected" : state.phase,
    });
  }

  setSessionState(sessionState: VoiceSessionSnapshot | null): void {
    const previous = this.port.get().sessionState;
    if (
      previous?.joined === sessionState?.joined &&
      previous?.isMuted === sessionState?.isMuted &&
      previous?.isDeafened === sessionState?.isDeafened
    ) {
      return;
    }
    this.port.set({ sessionState });
  }

  // ─── rosters ───────────────────────────────────────────────────────────────

  setParticipants(participants: VoiceSidebarParticipant[]): void {
    if (
      voiceParticipantListsEqual(this.port.get().participants, participants)
    ) {
      return;
    }
    this.port.set({ participants });
  }

  /**
   * Overlay the live speaking set onto the roster (Linux native path; the
   * sidecar forwards LiveKit's active speakers). Only isSpeaking changes, so
   * the keyed reconcile patches those flags and leaves every row in place.
   */
  setSpeakingIds(identities: string[]): void {
    const next = new Set(identities);
    if (
      next.size === this.speakingIds.size &&
      [...next].every((id) => this.speakingIds.has(id))
    ) {
      return;
    }
    this.speakingIds = next;
    const participants = this.port.get().participants;
    if (
      participants.every(
        (participant) =>
          participant.isSpeaking === next.has(participant.userId),
      )
    ) {
      return;
    }
    this.port.set({
      participants: participants.map((participant) => ({
        ...participant,
        isSpeaking: next.has(participant.userId),
      })),
    });
  }

  setChannelParticipants(
    channelId: string,
    participants: VoiceSidebarParticipant[],
  ): void {
    const state = this.port.get();
    const previous = state.participantsByChannelId[channelId] ?? [];
    if (voiceParticipantListsEqual(previous, participants)) return;
    this.port.set({
      participantsByChannelId: {
        ...state.participantsByChannelId,
        [channelId]: participants,
      },
    });
  }

  /** Drop presence rosters for channels no longer being watched. */
  retainChannelParticipants(channelIds: string[]): void {
    const keep = new Set(channelIds);
    const current = this.port.get().participantsByChannelId;
    const next = Object.fromEntries(
      Object.entries(current).filter(([channelId]) => keep.has(channelId)),
    );
    if (voiceParticipantRecordsEqual(current, next)) return;
    this.port.set({ participantsByChannelId: next });
  }

  // ─── token ─────────────────────────────────────────────────────────────────

  async fetchJoinCredentials(
    communityId: string,
    channelId: string,
  ): Promise<VoiceTokenResponse> {
    if (!this.tokenBackend) {
      throw new Error("Voice token backend is not configured.");
    }
    return this.tokenBackend.fetchToken(communityId, channelId);
  }

  // ─── kick channel ──────────────────────────────────────────────────────────

  async connectKickChannel(input: ConnectKickChannelInput): Promise<void> {
    const realtime = this.requireRealtime();
    const serial = ++this.kickConnectionSerial;
    await this.removeKickChannel();

    const channel = realtime.channel(
      `voice:kick:${input.communityId}:${input.channelId}`,
    );
    channel.on("broadcast", { event: "voice_kick" }, (eventPayload) => {
      const payload = resolveKickPayload(eventPayload);
      if (!payload) return;
      if (payload.targetUserId !== input.currentUserId) return;
      if (payload.channelId !== input.channelId) return;
      input.onKick(payload);
    });

    await subscribeOrThrow(
      channel,
      "Timed out connecting to voice.",
      "Voice kick channel connection failed.",
    );

    // A newer connect or a disconnect started while this one was subscribing.
    if (serial !== this.kickConnectionSerial) {
      await realtime.removeChannel(channel);
      return;
    }

    this.kickChannel = channel;
    this.kickContext = {
      currentUserId: input.currentUserId,
      channelId: input.channelId,
    };
  }

  async disconnectKickChannel(): Promise<void> {
    this.kickConnectionSerial += 1;
    await this.removeKickChannel();
  }

  async kickParticipant(
    targetUserId: string,
    channelId: string,
  ): Promise<void> {
    const channel = this.kickChannel;
    const context = this.kickContext;
    if (!channel || !context) {
      throw new Error("Not connected to a voice channel.");
    }

    const sendStatus = await channel.send({
      type: "broadcast",
      event: "voice_kick",
      payload: {
        targetUserId,
        channelId,
        kickedBy: context.currentUserId,
      } satisfies VoiceKickPayload,
    });
    if (sendStatus !== "ok") {
      throw new Error("Failed to remove member from the voice channel.");
    }

    // Drop the kicked user from the presence roster now, so they can't linger
    // there as a phantom until presence catches up.
    const roster = this.port.get().participantsByChannelId[channelId];
    if (roster) {
      this.setChannelParticipants(
        channelId,
        roster.filter((participant) => participant.userId !== targetUserId),
      );
    }
  }

  // ─── presence ──────────────────────────────────────────────────────────────

  /** Publish this user's presence in the voice channel they joined. */
  async connectPresenceChannel(
    input: ConnectPresenceChannelInput,
  ): Promise<void> {
    const realtime = this.requireRealtime();
    const serial = ++this.presenceConnectionSerial;
    await this.removePresenceChannel();

    const channel = realtime.channel(
      `voice:presence:${input.communityId}:${input.channelId}`,
      { config: { presence: { key: input.currentUserId } } },
    );

    if (input.syncRoster) {
      // Mirror LiveKit's remote participants: everyone but this user, with
      // the live speaking overlay preserved across presence syncs.
      const syncRoster = () => {
        this.setParticipants(
          normalizePresenceRows(channel.presenceState())
            .filter((participant) => participant.userId !== input.currentUserId)
            .map((participant) => ({
              ...participant,
              isSpeaking: this.speakingIds.has(participant.userId),
            })),
        );
      };
      channel
        .on("presence", { event: "sync" }, syncRoster)
        .on("presence", { event: "join" }, syncRoster)
        .on("presence", { event: "leave" }, syncRoster);
    }

    await subscribeOrThrow(
      channel,
      "Timed out publishing voice presence.",
      "Voice presence channel connection failed.",
    );

    if (serial !== this.presenceConnectionSerial) {
      await realtime.removeChannel(channel);
      return;
    }

    if (typeof channel.track !== "function") {
      await realtime.removeChannel(channel);
      throw new Error("Voice presence transport does not support tracking.");
    }

    const trackStatus = await channel.track({
      user_id: input.currentUserId,
      display_name: input.displayName,
      avatar_url: input.avatarUrl ?? null,
      is_speaking: false,
    });
    if (trackStatus !== "ok") {
      await realtime.removeChannel(channel);
      throw new Error("Failed to publish voice presence.");
    }

    if (serial !== this.presenceConnectionSerial) {
      await channel.untrack?.().catch(() => {});
      await realtime.removeChannel(channel);
      return;
    }

    this.presenceChannel = channel;
  }

  async disconnectPresenceChannel(): Promise<void> {
    this.presenceConnectionSerial += 1;
    await this.removePresenceChannel();
  }

  /** Remove any leftover presence channel for a voice channel (a stale join after a crash). */
  cleanupPresenceChannel(
    communityId: string,
    channelId: string,
  ): Promise<void> {
    const realtime = this.realtime;
    if (!realtime?.getChannels) return Promise.resolve();

    const expectedTopic = `voice:presence:${communityId}:${channelId}`;
    const channels = realtime.getChannels().filter((channel) => {
      const topic = channel.topic ?? "";
      return (
        topic === expectedTopic ||
        topic === `realtime:${expectedTopic}` ||
        topic.endsWith(expectedTopic)
      );
    });

    return Promise.all(
      channels.map((channel) => realtime.removeChannel(channel)),
    ).then(() => undefined);
  }

  /**
   * Watch presence in the community's other voice channels to show who is in
   * them. Returns the unsubscribe.
   */
  subscribePresenceChannels(input: SubscribePresenceChannelsInput): () => void {
    const realtime = this.realtime;
    if (!realtime) return () => {};

    const channelIds = input.channelIds.filter(
      (channelId) => channelId && channelId !== input.activeChannelId,
    );
    this.retainChannelParticipants(channelIds);

    if (channelIds.length === 0) return () => {};

    let disposed = false;
    const subscriptionChannels = channelIds.map((voiceChannelId) => {
      const subscriptionChannel = realtime.channel(
        `voice:presence:${input.communityId}:${voiceChannelId}`,
      );

      const syncPresenceState = () => {
        if (disposed) return;
        this.setChannelParticipants(
          voiceChannelId,
          normalizePresenceRows(subscriptionChannel.presenceState()),
        );
      };

      subscriptionChannel
        .on("presence", { event: "sync" }, syncPresenceState)
        .on("presence", { event: "join" }, syncPresenceState)
        .on("presence", { event: "leave" }, syncPresenceState);

      subscriptionChannel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          syncPresenceState();
          return;
        }
        if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
        if (disposed) return;
        this.setChannelParticipants(voiceChannelId, []);
      });

      return subscriptionChannel;
    });

    return () => {
      disposed = true;
      for (const subscriptionChannel of subscriptionChannels) {
        void realtime.removeChannel(subscriptionChannel);
      }
    };
  }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  clear(): void {
    this.speakingIds.clear();
    this.port.set({
      ...createInitialVoiceState(),
      sessionState: { joined: false, isMuted: false, isDeafened: false },
    });
    void this.disconnectKickChannel();
    void this.disconnectPresenceChannel();
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private requireRealtime(): VoiceRealtimeTransport {
    if (!this.realtime) {
      throw new Error("Voice realtime transport is not configured.");
    }
    return this.realtime;
  }

  private async removeKickChannel(): Promise<void> {
    const channel = this.kickChannel;
    this.kickChannel = null;
    this.kickContext = null;
    if (!channel || !this.realtime) return;
    await this.realtime.removeChannel(channel);
  }

  private async removePresenceChannel(): Promise<void> {
    const channel = this.presenceChannel;
    this.presenceChannel = null;
    if (!channel || !this.realtime) return;
    await channel.untrack?.().catch(() => {});
    await this.realtime.removeChannel(channel);
  }
}

/** Subscribe and wait for SUBSCRIBED; reject on error, timeout status, or after 12s. */
function subscribeOrThrow(
  channel: VoiceRealtimeChannel,
  timeoutMessage: string,
  failureMessage: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, CHANNEL_CONNECT_TIMEOUT_MS);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeoutId);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeoutId);
        reject(new Error(failureMessage));
      }
    });
  });
}
