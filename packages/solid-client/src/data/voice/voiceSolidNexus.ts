import { createMemo, type Accessor } from "solid-js";
import { createStore, reconcile, type SetStoreFunction } from "solid-js/store";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import type {
  VoiceChannelReference,
  VoiceSidebarParticipant,
} from "@shared/types/types";
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
  VoiceNexusState,
  VoiceSessionSnapshot,
} from "@shared/features/voice/voiceNexusTypes";

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
};

type SubscribePresenceChannelsInput = {
  communityId: string;
  channelIds: string[];
  activeChannelId?: string | null;
};

type VoiceSolidNexusState = Omit<VoiceNexusState, "revision">;

const NO_PARTICIPANTS: VoiceSidebarParticipant[] = [];

const defaultSession = (): VoiceSessionSnapshot => ({
  joined: false,
  isMuted: false,
  isDeafened: false,
});

const initialState = (): VoiceSolidNexusState => ({
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
 * Solid-native voice nexus — a 1:1 port of mobile's VoiceNexus
 * (apps/mobile/src/data/voice/VoiceNexus.ts): session phase/flags state,
 * the voice token fetch, and the Supabase presence/kick channels (the
 * documented exception to the single-private-channel realtime rule).
 * The LiveKit Room itself lives in the session controller
 * (contexts/VoiceProvider), not here.
 */
export class VoiceSolidNexus {
  readonly state: VoiceSolidNexusState;
  private readonly setState: SetStoreFunction<VoiceSolidNexusState>;

  private readonly viewerPolicyStore: ViewerMessagePolicyStore;
  private readonly tokenBackend: VoiceTokenBackend | null;
  private readonly realtime: VoiceRealtimeTransport | null;
  private kickChannel: VoiceRealtimeChannel | null = null;
  private kickContext: { currentUserId: string; channelId: string } | null =
    null;
  private kickConnectionSerial = 0;
  private presenceChannel: VoiceRealtimeChannel | null = null;
  private presenceConnectionSerial = 0;

  constructor(
    viewerPolicyStore: ViewerMessagePolicyStore,
    tokenBackend?: VoiceTokenBackend,
    realtime?: VoiceRealtimeTransport,
  ) {
    this.viewerPolicyStore = viewerPolicyStore;
    this.tokenBackend = tokenBackend ?? null;
    this.realtime = realtime ?? null;
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }

  voiceState(): Accessor<VoiceSolidNexusState> {
    return createMemo(() => this.state);
  }

  /** Occupants of one voice channel — feeds the sidebar rows under each channel. */
  channelVoiceParticipants(
    channelId: Accessor<string>,
  ): Accessor<VoiceSidebarParticipant[]> {
    return createMemo(() => {
      const id = channelId();
      if (
        this.state.activeChannel?.id === id ||
        this.state.currentChannelId === id
      ) {
        return this.state.participants;
      }
      const byChannel = this.state.participantsByChannelId[id];
      if (byChannel) return byChannel;
      return NO_PARTICIPANTS;
    });
  }

  startConnect(channel: VoiceChannelReference): void {
    // Seed the LiveKit-source roster from the presence roster we already have so
    // the active-channel row doesn't blink empty during "connecting" (LiveKit is
    // empty until the room connects). applyParticipants reconciles it to the real
    // roster on connect.
    const seed =
      this.state.participantsByChannelId[channel.id] ?? this.state.participants;
    this.setState({
      phase: "connecting",
      activeChannel: channel,
      pendingChannel: null,
      currentChannelId: channel.id,
      participants: seed,
      error: null,
    });
  }

  markConnected(): void {
    this.setState({ phase: "connected", voiceConnected: true, error: null });
  }

  startSwitch(channel: VoiceChannelReference): void {
    this.setState({ phase: "switching", pendingChannel: channel, error: null });
  }

  startDisconnect(): void {
    this.setState({ phase: "disconnecting", error: null });
  }

  completeDisconnect(): void {
    const pendingChannel = this.state.pendingChannel;
    if (pendingChannel) {
      this.setState({
        phase: "connecting",
        activeChannel: pendingChannel,
        pendingChannel: null,
        currentChannelId: pendingChannel.id,
        voiceConnected: false,
        error: null,
      });
      return;
    }
    this.setState({
      phase: "idle",
      activeChannel: null,
      pendingChannel: null,
      currentChannelId: null,
      voiceConnected: false,
      error: null,
    });
  }

  setError(message: string): void {
    this.setState({ phase: "error", error: message });
  }

  clearError(): void {
    this.setState({
      phase: this.state.activeChannel ? "connected" : "idle",
      error: null,
    });
  }

  setJoined(joined: boolean): void {
    if (this.state.joined === joined) return;
    this.setState("joined", joined);
  }

  setIsMuted(isMuted: boolean): void {
    if (this.state.isMuted === isMuted) return;
    this.setState("isMuted", isMuted);
  }

  setIsDeafened(isDeafened: boolean): void {
    if (isDeafened) {
      this.setState({ isDeafened: true, isMuted: true });
      return;
    }
    this.setState("isDeafened", false);
  }

  setCurrentChannelId(currentChannelId: string | null): void {
    if (this.state.currentChannelId === currentChannelId) return;
    this.setState("currentChannelId", currentChannelId);
  }

  setParticipants(participants: VoiceSidebarParticipant[]): void {
    if (voiceParticipantListsEqual(this.state.participants, participants))
      return;
    // reconcile by userId so still-present participants keep their object
    // reference across updates — otherwise <For> tears down and rebuilds the
    // row on every speaking-state flip, closing any open dropdown.
    this.setState(
      "participants",
      reconcile(participants, { key: "userId" }),
    );
  }

  setChannelParticipants(
    channelId: string,
    participants: VoiceSidebarParticipant[],
  ): void {
    const previous = this.state.participantsByChannelId[channelId] ?? [];
    if (voiceParticipantListsEqual(previous, participants)) return;
    this.setState(
      "participantsByChannelId",
      channelId,
      reconcile(participants, { key: "userId" }),
    );
  }

  retainChannelParticipants(channelIds: string[]): void {
    const keep = new Set(channelIds);
    const current = this.state.participantsByChannelId;
    const next = Object.fromEntries(
      Object.entries(current).filter(([channelId]) => keep.has(channelId)),
    );
    if (voiceParticipantRecordsEqual(current, next)) return;
    this.setState("participantsByChannelId", next);
  }

  setVoiceConnected(voiceConnected: boolean): void {
    if (this.state.voiceConnected === voiceConnected) return;
    this.setState({
      voiceConnected,
      phase: voiceConnected ? "connected" : this.state.phase,
    });
  }

  setSessionState(sessionState: VoiceSessionSnapshot | null): void {
    const previous = this.state.sessionState;
    if (
      previous?.joined === sessionState?.joined &&
      previous?.isMuted === sessionState?.isMuted &&
      previous?.isDeafened === sessionState?.isDeafened
    ) {
      return;
    }
    this.setState("sessionState", sessionState);
  }

  async fetchJoinCredentials(
    communityId: string,
    channelId: string,
  ): Promise<VoiceTokenResponse> {
    if (!this.tokenBackend) {
      throw new Error("Voice token backend is not configured.");
    }
    return this.tokenBackend.fetchToken(communityId, channelId);
  }

  async connectKickChannel(input: ConnectKickChannelInput): Promise<void> {
    if (!this.realtime) {
      throw new Error("Voice realtime transport is not configured.");
    }

    const serial = ++this.kickConnectionSerial;
    await this.removeKickChannel();

    const channel = this.realtime.channel(
      `voice:kick:${input.communityId}:${input.channelId}`,
    );
    channel.on("broadcast", { event: "voice_kick" }, (eventPayload) => {
      const payload = resolveKickPayload(eventPayload);
      if (!payload) return;
      if (payload.targetUserId !== input.currentUserId) return;
      if (payload.channelId !== input.channelId) return;
      input.onKick(payload);
    });

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Timed out connecting to voice."));
      }, 12_000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeoutId);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeoutId);
          reject(new Error("Voice kick channel connection failed."));
        }
      });
    });

    if (serial !== this.kickConnectionSerial) {
      await this.realtime.removeChannel(channel);
      return;
    }

    this.kickChannel = channel;
    this.kickContext = {
      currentUserId: input.currentUserId,
      channelId: input.channelId,
    };
  }

  private async removeKickChannel(): Promise<void> {
    const channel = this.kickChannel;
    this.kickChannel = null;
    this.kickContext = null;
    if (!channel || !this.realtime) return;
    await this.realtime.removeChannel(channel);
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

    // Keep the presence map honest so the kicked user can't reappear as a
    // phantom when the memo falls back to presence (e.g. when the kicker later
    // leaves and the channel un-excludes).
    const roster = this.state.participantsByChannelId[channelId];
    if (roster) {
      this.setState(
        "participantsByChannelId",
        channelId,
        roster.filter((p) => p.userId !== targetUserId),
      );
    }
  }

  async connectPresenceChannel(
    input: ConnectPresenceChannelInput,
  ): Promise<void> {
    if (!this.realtime) {
      throw new Error("Voice realtime transport is not configured.");
    }

    const serial = ++this.presenceConnectionSerial;
    await this.removePresenceChannel();

    const channel = this.realtime.channel(
      `voice:presence:${input.communityId}:${input.channelId}`,
      { config: { presence: { key: input.currentUserId } } },
    );

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Timed out publishing voice presence."));
      }, 12_000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeoutId);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeoutId);
          reject(new Error("Voice presence channel connection failed."));
        }
      });
    });

    if (serial !== this.presenceConnectionSerial) {
      await this.realtime.removeChannel(channel);
      return;
    }

    if (typeof channel.track !== "function") {
      await this.realtime.removeChannel(channel);
      throw new Error("Voice presence transport does not support tracking.");
    }

    const trackStatus = await channel.track({
      user_id: input.currentUserId,
      display_name: input.displayName,
      avatar_url: input.avatarUrl ?? null,
      is_speaking: false,
    });
    if (trackStatus !== "ok") {
      await this.realtime.removeChannel(channel);
      throw new Error("Failed to publish voice presence.");
    }

    if (serial !== this.presenceConnectionSerial) {
      await channel.untrack?.().catch(() => {});
      await this.realtime.removeChannel(channel);
      return;
    }

    this.presenceChannel = channel;
  }

  private async removePresenceChannel(): Promise<void> {
    const channel = this.presenceChannel;
    this.presenceChannel = null;
    if (!channel || !this.realtime) return;
    await channel.untrack?.().catch(() => {});
    await this.realtime.removeChannel(channel);
  }

  async disconnectPresenceChannel(): Promise<void> {
    this.presenceConnectionSerial += 1;
    await this.removePresenceChannel();
  }

  subscribePresenceChannels(input: SubscribePresenceChannelsInput): () => void {
    if (!this.realtime) return () => {};

    const channelIds = input.channelIds.filter(
      (channelId) => channelId && channelId !== input.activeChannelId,
    );
    this.retainChannelParticipants(channelIds);

    if (channelIds.length === 0) return () => {};

    let disposed = false;
    const subscriptionChannels = channelIds.map((voiceChannelId) => {
      const subscriptionChannel = this.realtime!.channel(
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
        void this.realtime?.removeChannel(subscriptionChannel);
      }
    };
  }

  getSnapshot(): VoiceSolidNexusState {
    return this.state;
  }

  getVisibleParticipantsSnapshot(channelId: string): VoiceSidebarParticipant[] {
    const hiddenAuthorIds = this.viewerPolicyStore.getState().hiddenAuthorIds;
    return this.filterVisibleParticipants(
      this.getParticipantsForChannel(channelId),
      hiddenAuthorIds,
    );
  }

  private getParticipantsForChannel(
    channelId: string,
  ): VoiceSidebarParticipant[] {
    if (
      this.state.activeChannel?.id === channelId ||
      this.state.currentChannelId === channelId
    ) {
      if (this.state.participantsByChannelId[channelId]) {
        return this.state.participantsByChannelId[channelId];
      }
      return this.state.participants;
    }
    return [];
  }

  private filterVisibleParticipants(
    participants: VoiceSidebarParticipant[],
    hiddenAuthorIds: ReadonlySet<string>,
  ): VoiceSidebarParticipant[] {
    if (hiddenAuthorIds.size === 0) return participants;
    return participants.filter((p) => !hiddenAuthorIds.has(p.userId));
  }

  clear(): void {
    this.setState({
      ...initialState(),
      sessionState: defaultSession(),
    });
    void this.disconnectKickChannel();
    void this.disconnectPresenceChannel();
  }
}

export function createVoiceSolidNexus(
  viewerPolicyStore: ViewerMessagePolicyStore,
  tokenBackend?: VoiceTokenBackend,
  realtime?: VoiceRealtimeTransport,
): VoiceSolidNexus {
  return new VoiceSolidNexus(viewerPolicyStore, tokenBackend, realtime);
}
