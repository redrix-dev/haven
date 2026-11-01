import type {
  VoiceTokenBackend,
  VoiceTokenResponse,
} from "@shared/lib/backend/voiceTokenBackend";
import {
  normalizePresenceRows,
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
import {
  defaultVoiceSoundSettings,
  normalizeVoiceSoundSettings,
  type VoiceSoundSettings,
} from "@shared/features/voice/utils/voiceSounds";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import { NEXUS_STORAGE_KEYS } from "@shared/core/persistence/nexusStorageKeys";
import {
  parseVoiceControlEvent,
  type VoiceControlEvent,
  type VoiceMemberAction,
} from "@shared/features/voice/utils/memberControls";
import { normalizeVoiceSettings } from "@shared/features/voice/utils/settings";
import type { VoiceSettings } from "@shared/types/settings";

const CHANNEL_CONNECT_TIMEOUT_MS = 12_000;

export const createInitialVoiceState = (): VoiceState => ({
  settings: normalizeVoiceSettings(null),
  controlNotice: null,
  soundSettings: defaultVoiceSoundSettings(),
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
  sessionId: string;
  onControl?: (event: VoiceControlEvent) => void;
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
 * voice channel, voice preferences, the voice token fetch, room presence and
 * server-authorized controls delivered through the private-user event ingress.
 * The media connection itself (LiveKit room or native sidecar) lives with the
 * platform's session controller, which reports into this nexus.
 *
 * Rosters are keyed by userId. The Solid port reconciles them by that key, so
 * a speaking flip or a join/leave updates rows in place instead of replacing
 * them (replacing rows crashes WebKitGTK's <For> mid-update).
 */
export class VoiceNexus {
  private kickContext: ConnectKickChannelInput | null = null;
  private participantSessions = new Map<string, string>();
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
    private readonly persistence?: NexusPersistence,
  ) {
    try {
      const raw = persistence?.getString(NEXUS_STORAGE_KEYS.voiceSounds);
      if (raw)
        this.port.set({
          soundSettings: normalizeVoiceSoundSettings(JSON.parse(raw)),
        });
    } catch {
      /* Damaged preferences fall back to the default. */
    }
    try {
      const raw = persistence?.getString(NEXUS_STORAGE_KEYS.voiceSettings);
      if (raw)
        this.port.set({ settings: normalizeVoiceSettings(JSON.parse(raw)) });
    } catch {
      /* Keep defaults for damaged device preferences. */
    }
  }

  updateSettings(patch: Partial<VoiceSettings>): void {
    const settings = normalizeVoiceSettings({
      ...this.port.get().settings,
      ...patch,
    });
    this.port.set({ settings });
    try {
      this.persistence?.set(
        NEXUS_STORAGE_KEYS.voiceSettings,
        JSON.stringify(settings),
      );
    } catch {
      /* Non-fatal device preference. */
    }
  }

  updateSoundSettings(patch: Partial<VoiceSoundSettings>): void {
    const soundSettings = normalizeVoiceSoundSettings({
      ...this.port.get().soundSettings,
      ...patch,
    });
    this.port.set({ soundSettings });
    try {
      this.persistence?.set(
        NEXUS_STORAGE_KEYS.voiceSounds,
        JSON.stringify(soundSettings),
      );
    } catch {
      /* A storage failure must not interrupt voice. */
    }
  }

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
    if (!joined && this.port.get().controlNotice?.action !== "remove")
      this.port.set({ controlNotice: null });
    if (this.port.get().joined === joined) return;
    this.port.set({ joined });
  }

  setMuted(isMuted: boolean): void {
    if (!isMuted && this.port.get().controlNotice?.action === "mute")
      this.port.set({ controlNotice: null });
    if (this.port.get().isMuted === isMuted) return;
    this.port.set({ isMuted });
  }

  /** Deafening also mutes; undeafening leaves the mute as it is. */
  setDeafened(isDeafened: boolean): void {
    if (!isDeafened && this.port.get().controlNotice?.action === "deafen")
      this.port.set({ controlNotice: null });
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
    // Compatibility name for session controllers. Delivery now uses the one
    // server-authorized private-user subscription, never a peer kick topic.
    this.kickContext = input;
  }

  async disconnectKickChannel(): Promise<void> {
    this.kickContext = null;
    this.participantSessions.clear();
  }

  setParticipantSessions(
    participants: { userId: string; sessionId?: string }[],
  ): void {
    this.participantSessions = new Map(
      participants
        .filter((p) => p.sessionId)
        .map((p) => [p.userId, p.sessionId!]),
    );
  }

  dismissControlNotice(): void {
    this.port.set({ controlNotice: null });
  }

  applyRemoteControl(payload: Record<string, unknown>): void {
    const event = parseVoiceControlEvent(payload);
    const context = this.kickContext;
    if (
      !event ||
      !context ||
      event.targetUserId !== context.currentUserId ||
      event.communityId !== context.communityId ||
      event.channelId !== context.channelId ||
      event.targetSessionId !== context.sessionId
    )
      return;
    if (event.action === "mute" || event.action === "unmute")
      this.setMuted(event.action === "mute");
    if (event.action === "deafen" || event.action === "undeafen")
      this.setDeafened(event.action === "deafen");
    if (["mute", "deafen", "remove"].includes(event.action))
      this.port.set({ controlNotice: event });
    context.onControl?.(event);
    if (event.action === "remove")
      context.onKick({
        targetUserId: event.targetUserId,
        channelId: event.channelId,
        kickedBy: event.actorUserId,
        kickedByName: event.actorName,
        channelName: event.channelName,
      });
  }

  async controlParticipant(
    targetUserId: string,
    channelId: string,
    action: VoiceMemberAction,
  ): Promise<void> {
    const context = this.kickContext;
    const targetSessionId = this.participantSessions.get(targetUserId);
    if (!context || context.channelId !== channelId || !targetSessionId)
      throw new Error(
        "The participant's current voice session is unavailable.",
      );
    if (!this.tokenBackend?.sendControl)
      throw new Error("Voice controls are unavailable.");
    await this.tokenBackend.sendControl({
      communityId: context.communityId,
      channelId,
      targetUserId,
      targetSessionId,
      action,
    });
  }

  async kickParticipant(
    targetUserId: string,
    channelId: string,
  ): Promise<void> {
    await this.controlParticipant(targetUserId, channelId, "remove");

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
      settings: { ...this.port.get().settings },
      // Device audio preferences survive sign-out; voice session state does not.
      soundSettings: { ...this.port.get().soundSettings },
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
