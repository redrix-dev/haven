/**
 * HavenCore: the signed-in session. It builds every collection, starts and
 * ends the session, applies each realtime event through one table, and runs
 * the few commands that touch more than one collection.
 * docs/architecture/COLLECTIONS.md, "HavenCore".
 *
 * A platform gives it a way to make a store (`makePort`), device storage,
 * and where the app runs. Solid and React only build the stores and read
 * them; everything a session does is here, once.
 *
 * Signing in puts back what the device kept (the sidebar, the theme, where
 * the person was), joins the person's realtime topic, and loads everything
 * once the topic is listening, so no event can fall between the load and
 * the listening. Every reconnect loads again, since events sent while away
 * are lost. If the topic is slow to join, the load does not wait for it.
 *
 * Signing out is the auth boundary's; it calls `signOut` here after, which
 * stops listening, empties every collection and removes what the device
 * kept for this person.
 */

import type { Backend } from "@shared/lib/backend";
import type { HavenEvent } from "@shared/lib/backend/realtime";
import type { FileToUpload } from "@shared/lib/backend/media";
import type {
  OnboardingContext,
  ProfileChanges,
} from "@shared/lib/backend/people";
import type {
  AccountRestriction,
  Notification,
  OnboardingCampaign,
  OnboardingOutcome,
  ProfileRecord,
} from "@shared/lib/backend/records";
import type { DevicePersistence } from "@shared/core/persistence/DevicePersistence";
import { perfTrace } from "@shared/debug/perfTrace";
import {
  createInitialVoiceState,
  Voice,
  VOICE_ROW_KEYS,
  type VoicePresence,
} from "@shared/collections/voice/voice";
import type { VoiceState } from "@shared/collections/voice/voiceState";
import {
  Account,
  accountCopy,
  createAccountState,
  type AccountState,
} from "../account/account";
import { Cases, createCasesState, type CasesState } from "../cases/cases";
import {
  Categories,
  categoriesCopy,
  createCategoriesState,
  type CategoriesState,
} from "../categories/categories";
import {
  Channels,
  channelsCopy,
  createChannelsState,
  type ChannelsState,
} from "../channels/channels";
import {
  Communities,
  communitiesCopy,
  createCommunitiesState,
  type CommunitiesState,
  type CommunityPart,
} from "../communities/communities";
import {
  DeviceCopies,
  type DeviceCopy,
  type WriteScheduler,
} from "../kit/deviceCopies";
import {
  Attachments,
  createAttachmentsState,
  type AttachmentsState,
} from "../attachments/attachments";
import { applyEvent, type EventTable } from "../kit/events";
import type { StatePort } from "../kit/statePort";
import {
  createMembersState,
  Members,
  type MembersState,
} from "../members/members";
import {
  createMessagesState,
  type Draft,
  Messages,
  type MessagesState,
} from "../messages/messages";
import {
  createNotificationsState,
  Notifications,
  type NotificationsState,
} from "../notifications/notifications";
import {
  createProfilesState,
  Profiles,
  type ProfilesState,
} from "../profiles/profiles";
import {
  createReportsState,
  Reports,
  type ReportsState,
} from "../reports/reports";
import { createRolesState, Roles, type RolesState } from "../roles/roles";
import {
  createSessionState,
  Session,
  sessionCopy,
  type SessionState,
} from "../session/session";
import { createSocialState, Social, type SocialState } from "../social/social";

/** How long sign-in waits for the realtime topic before loading anyway. */
export const CONNECT_WAIT_MS = 3_000;

export type CorePhase =
  /** Nobody is signed in. */
  | "signed_out"
  /** Signed in; what the device kept is showing, and the loads are running. */
  | "loading"
  /** The first load has finished (each part may still have failed alone). */
  | "ready";

export type CoreState = {
  phase: CorePhase;
  userId: string | null;
  /** The realtime topic is listening. False shows "reconnecting". */
  connected: boolean;
};

export const createCoreState = (): CoreState => ({
  phase: "signed_out",
  userId: null,
  connected: false,
});

/**
 * Every store the core makes, by name. A platform keeps the stores it made
 * under these names and reads them; selectors take these states.
 */
export type StoreStates = {
  core: CoreState;
  account: AccountState;
  communities: CommunitiesState;
  members: MembersState;
  roles: RolesState;
  categories: CategoriesState;
  channels: ChannelsState;
  messages: MessagesState;
  profiles: ProfilesState;
  social: SocialState;
  notifications: NotificationsState;
  reports: ReportsState;
  cases: CasesState;
  session: SessionState;
  attachments: AttachmentsState;
  voice: VoiceState;
};

export type StoreName = keyof StoreStates;

/**
 * Rows in a store's arrays that are not named by `id`, by top-level key. A
 * platform store that matches rows when it writes (Solid's) needs it.
 */
export type RowKeys = Readonly<Record<string, string>>;

export type MakePort = <N extends StoreName>(
  name: N,
  initial: StoreStates[N],
  rowKeys?: RowKeys,
) => StatePort<StoreStates[N]>;

export type HavenCoreOptions = {
  backend: Backend;
  /** The platform's store: Solid's, or a Zustand store on mobile. */
  makePort: MakePort;
  storage: DevicePersistence;
  /** Where the app runs, which decides the introductions offered. */
  context: OnboardingContext;
  /** When device copies are written; tests pass one they control. */
  scheduleWrites?: WriteScheduler;
};

/** Things the platform shows or does that are not records. */
export type CoreListeners = {
  /** The person is no longer in a community (left, removed, banned, deleted). */
  communityGone?: (communityId: string) => void;
  /** Haven staff restricted the account: the platform signs out and says why. */
  restricted?: (restriction: Pick<AccountRestriction, "ends_at">) => void;
  /** A notification arrived (desktop plays a sound). */
  notification?: (notification: Notification) => void;
};

export class HavenCore {
  readonly account: Account;
  readonly communities: Communities;
  readonly members: Members;
  readonly roles: Roles;
  readonly categories: Categories;
  readonly channels: Channels;
  readonly messages: Messages;
  readonly profiles: Profiles;
  readonly social: Social;
  readonly notifications: Notifications;
  readonly reports: Reports;
  readonly cases: Cases;
  readonly session: Session;
  /** Links to message files, while they work. */
  readonly attachments: Attachments;
  /** The voice call: not records, but ended with the session like them. */
  readonly voice: Voice;

  readonly state: StatePort<CoreState>;
  /** The stores the core reads across collections. */
  private readonly read: {
    communities: StatePort<CommunitiesState>;
    reports: StatePort<ReportsState>;
    cases: StatePort<CasesState>;
    session: StatePort<SessionState>;
  };
  /** The backend clients, for a screen that reads something no collection holds. */
  readonly backend: Backend;
  private readonly copies: DeviceCopies;
  private readonly listeners: CoreListeners = {};
  private readonly events: EventTable;
  private stopListening: (() => void) | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private firstLoad: Promise<void> | null = null;
  /** Bumped by every sign-in and sign-out, so an old session's work stops. */
  private generation = 0;

  constructor(options: HavenCoreOptions) {
    const { backend, makePort, context } = options;
    this.backend = backend;
    this.copies = new DeviceCopies(options.storage, options.scheduleWrites);
    const port = <N extends StoreName>(
      name: N,
      initial: StoreStates[N],
      copy?: DeviceCopy<StoreStates[N], unknown>,
    ): StatePort<StoreStates[N]> => {
      const made = makePort(name, initial);
      return copy ? this.copies.track(copy, made) : made;
    };

    this.state = makePort("core", createCoreState());
    this.account = new Account(
      port("account", createAccountState(), accountCopy),
      backend.people,
      context,
    );
    this.members = new Members(
      port("members", createMembersState()),
      backend.communities,
    );
    this.roles = new Roles(
      port("roles", createRolesState()),
      backend.communities,
    );
    this.categories = new Categories(
      port("categories", createCategoriesState(), categoriesCopy),
      backend.communities,
    );
    this.channels = new Channels(
      port("channels", createChannelsState(), channelsCopy),
      backend.channels,
    );
    this.messages = new Messages(
      port("messages", createMessagesState()),
      backend.messages,
    );
    this.profiles = new Profiles(
      port("profiles", createProfilesState()),
      backend.people,
    );
    this.social = new Social(
      port("social", createSocialState()),
      backend.social,
    );
    this.notifications = new Notifications(
      port("notifications", createNotificationsState()),
      backend.notifications,
    );
    const reports = port("reports", createReportsState());
    const cases = port("cases", createCasesState());
    const session = port("session", createSessionState(), sessionCopy);
    const communities = port(
      "communities",
      createCommunitiesState(),
      communitiesCopy,
    );
    this.read = { communities, reports, cases, session };
    this.reports = new Reports(reports, backend.safety);
    this.cases = new Cases(cases, backend.safety);
    this.session = new Session(session);
    this.attachments = new Attachments(
      makePort("attachments", createAttachmentsState()),
      backend.media,
    );
    this.voice = new Voice(
      makePort("voice", createInitialVoiceState(), VOICE_ROW_KEYS),
      backend.voice,
      backend.realtime as unknown as VoicePresence,
      options.storage,
    );

    // The last part told: everything else about a community that is gone.
    const elsewhere: CommunityPart = {
      takeStructure: (structure) =>
        void this.profiles.ensure(structure.members.map((m) => m.user_id)),
      dropCommunity: (communityId) => this.forgetCommunity(communityId),
    };
    this.communities = new Communities(communities, backend.communities, [
      this.members,
      this.roles,
      this.categories,
      elsewhere,
    ]);

    this.events = this.eventTable();
  }

  get userId(): string | null {
    return this.state.get().userId;
  }

  /** Only one listener of each kind; a platform sets them once. */
  listen(listeners: CoreListeners): void {
    Object.assign(this.listeners, listeners);
  }

  // ── The session ───────────────────────────────────────────────────────────

  /**
   * Starts the session for a person auth has just signed in. Resolves when
   * the first load has finished; what the device kept shows before that.
   */
  signIn(userId: string): Promise<void> {
    if (this.userId === userId && this.firstLoad) return this.firstLoad;
    if (this.userId !== null) this.signOut();
    const generation = ++this.generation;
    this.state.set({ phase: "loading", userId, connected: false });
    perfTrace.measure("restore", () => this.copies.open(userId));

    let started = false;
    let finish!: () => void;
    this.firstLoad = new Promise<void>((resolve) => (finish = resolve));
    const load = () => {
      if (generation !== this.generation) return;
      if (this.loadTimer) clearTimeout(this.loadTimer);
      this.loadTimer = null;
      const first = !started;
      started = true;
      void this.loadEverything().then(() => {
        if (generation !== this.generation || !first) return;
        this.state.set({ phase: "ready" });
        perfTrace.mark("session-ready");
        finish();
      });
    };

    this.stopListening = this.backend.realtime.subscribeToMyEvents(userId, {
      onEvent: (event) => this.apply(event),
      onConnected: () => {
        this.state.set({ connected: true });
        load();
      },
      onTrouble: () => this.state.set({ connected: false }),
    });
    this.loadTimer = setTimeout(load, CONNECT_WAIT_MS);
    return this.firstLoad;
  }

  /**
   * Ends the session: nothing more is heard or written, every collection is
   * empty, and this person's device copies are removed.
   */
  signOut(): void {
    this.generation += 1;
    this.stopListening?.();
    this.stopListening = null;
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.loadTimer = null;
    this.firstLoad = null;
    this.copies.close();
    for (const collection of [
      this.account,
      this.communities,
      this.members,
      this.roles,
      this.categories,
      this.channels,
      this.messages,
      this.profiles,
      this.social,
      this.notifications,
      this.reports,
      this.cases,
      this.session,
      this.attachments,
      this.voice,
    ]) {
      collection.clear();
    }
    this.state.set(createCoreState());
  }

  /** Writes the device copies now. Hosts call it when the app goes to the background. */
  flush(): void {
    this.copies.flush();
  }

  /** One event, through the table. Public for tests and for a host replaying one. */
  apply(event: HavenEvent): void {
    applyEvent(this.events, event);
  }

  // ── Commands across collections ───────────────────────────────────────────

  /** Opens a community at the channel last open there, and loads that channel. */
  openCommunity(communityId: string): Promise<void> {
    this.session.openCommunity(communityId);
    const place = this.read.session.get().place;
    return place?.channel_id
      ? this.messages.open(place.channel_id)
      : Promise.resolve();
  }

  openChannel(communityId: string, channelId: string): Promise<void> {
    this.session.openChannel(communityId, channelId);
    return this.messages.open(channelId);
  }

  /** Starts or opens the conversation with someone, if their rules allow it. */
  async openConversationWith(userId: string): Promise<string> {
    const channel = await this.backend.channels.openConversation(userId);
    this.channels.applyChannel(channel);
    this.session.openConversation(channel.id);
    await this.messages.open(channel.id);
    return channel.id;
  }

  openConversation(channelId: string): Promise<void> {
    this.session.openConversation(channelId);
    return this.messages.open(channelId);
  }

  /** The box empties as the message goes; a refused one stays outgoing to retry. */
  send(channelId: string, draft: Draft) {
    this.session.clearDraft(channelId);
    return this.messages.send(channelId, draft);
  }

  /** Deletes a channel, and forgets its messages, draft and place. */
  async deleteChannel(channelId: string): Promise<void> {
    await this.channels.remove(channelId);
    this.forgetChannel(channelId);
  }

  /** A new community, with its first channels, opened. */
  async createCommunity(name: string, description?: string): Promise<string> {
    const community = await this.communities.create(name, description);
    await this.loadCommunity(community.id);
    await this.openCommunity(community.id);
    return community.id;
  }

  async joinCommunity(code: string): Promise<string> {
    const community = await this.communities.join(code);
    await this.loadCommunity(community.id);
    await this.openCommunity(community.id);
    return community.id;
  }

  /** Everyone's view of the person comes back into `profiles`. */
  async updateProfile(changes: ProfileChanges): Promise<ProfileRecord> {
    const record = await this.account.updateProfile(changes);
    this.profiles.applyProfile(record);
    return record;
  }

  /** A new picture, or none. Everyone's view of the person comes back into `profiles`. */
  async setAvatar(file: FileToUpload | null): Promise<ProfileRecord> {
    const record = file
      ? await this.backend.media.setMyAvatar(file)
      : await this.backend.media.removeMyAvatar();
    this.profiles.applyProfile(record);
    return record;
  }

  /** An introduction that joins a community leaves the person in it. */
  async answerOnboarding(
    campaignKey: string,
    outcome: OnboardingOutcome,
  ): Promise<OnboardingCampaign | null> {
    const campaign = await this.account.answerOnboarding(campaignKey, outcome);
    if (outcome === "completed" && campaign?.community_id) {
      await this.communities.loadMine();
      await this.loadCommunity(campaign.community_id);
    }
    return campaign;
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  /**
   * Everything the session shows, replacing what is held: sign-in, and every
   * reconnect. Each load records its own failure; none stops the others.
   */
  private async loadEverything(): Promise<void> {
    const span = perfTrace.begin("load-everything");
    const reportsLoaded = this.read.reports.get().mine !== null;
    const casesLoaded = this.read.cases.get().queue !== null;
    await Promise.all([
      this.account.load(),
      this.communities.loadMine(),
      this.channels.loadConversations(),
      this.channels.loadMine(),
      this.social.load(),
      this.notifications.load(),
      this.notifications.loadPreferences(),
      reportsLoaded ? this.reports.loadMine() : undefined,
      casesLoaded ? this.cases.loadQueue() : undefined,
    ]);
    const communityIds = Object.keys(this.read.communities.get().byId);
    const moderated = Object.keys(this.read.reports.get().byCommunity);
    await Promise.all([
      ...communityIds.map((id) => this.loadCommunity(id)),
      ...moderated.map((id) => this.reports.loadCommunity(id)),
      // An open window takes its newest page as the truth.
      ...this.messages
        .openChannelIds()
        .map((id) => this.messages.loadNewest(id)),
      this.profiles.reloadHeld(),
    ]);
    const place = this.read.session.get().place;
    if (place?.channel_id) await this.messages.open(place.channel_id);
    span.end();
  }

  /** A community's structure and channels; a channel no longer there is forgotten. */
  private async loadCommunity(communityId: string): Promise<void> {
    const before = this.channels.idsOf(communityId);
    await Promise.all([
      this.communities.loadCommunity(communityId),
      this.channels.loadCommunity(communityId),
    ]);
    const after = new Set(this.channels.idsOf(communityId));
    for (const channelId of before) {
      if (!after.has(channelId)) this.forgetChannel(channelId);
    }
  }

  /** What the person may see or do in this community may have changed. */
  private async accessChanged(communityId: string): Promise<void> {
    if (!this.communities.get(communityId)) return;
    await this.loadCommunity(communityId);
    if (!(communityId in this.read.reports.get().byCommunity)) return;
    if (this.communities.can(communityId, "manage_reports")) {
      await this.reports.loadCommunity(communityId);
    } else {
      this.reports.forgetCommunity(communityId);
    }
  }

  private forgetChannel(channelId: string): void {
    this.messages.dropChannel(channelId);
    this.session.forgetChannel(channelId);
  }

  /** Told by `communities`, after members, roles and categories let it go. */
  private forgetCommunity(communityId: string): void {
    const channelIds = this.channels.idsOf(communityId);
    for (const channelId of channelIds) this.messages.dropChannel(channelId);
    this.session.forgetCommunity(communityId, channelIds);
    this.channels.applyCommunityGone(communityId);
    this.reports.forgetCommunity(communityId);
    this.listeners.communityGone?.(communityId);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  private eventTable(): EventTable {
    const me = () => this.userId ?? "";
    return {
      "message.created": (message) => {
        this.messages.applyCreated(message);
        this.channels.applyMessageCreated(message, me());
        void this.profiles.ensure([message.author_id]);
      },
      "message.updated": (message) => this.messages.applyUpdated(message),
      "message.deleted": ({ id, channel_id }) => {
        this.messages.applyDeleted(id, channel_id);
        this.channels.applyMessageDeleted(id, channel_id);
      },
      "channel.created": (channel) => this.channels.applyChannel(channel),
      "channel.updated": (channel) => this.channels.applyChannel(channel),
      "channel.deleted": (channel) => {
        this.channels.applyChannelDeleted(channel.id);
        this.forgetChannel(channel.id);
      },
      "channel.read": ({ channel_id, last_read_message_id }) =>
        this.channels.applyRead(channel_id, last_read_message_id),
      "community.updated": (community) =>
        this.communities.applyCommunity(community),
      "community.deleted": ({ id }) => this.communities.applyGone(id),
      "role.created": (role) => this.roles.applyRole(role),
      "role.updated": (role) => this.roles.applyRole(role),
      "role.deleted": (role) => this.roles.applyRoleDeleted(role.id),
      "category.created": (category) => this.categories.applyCategory(category),
      "category.updated": (category) => this.categories.applyCategory(category),
      "category.deleted": (category) =>
        this.categories.applyCategoryDeleted(category.id),
      "member.joined": (member) => {
        if (member.user_id === me()) {
          // Joined on another device.
          void this.communities
            .loadMine()
            .then(() => this.loadCommunity(member.community_id));
          return;
        }
        this.members.applyMember(member);
        void this.profiles.ensure([member.user_id]);
      },
      "member.updated": (member) => this.members.applyMember(member),
      "member.left": (member) => {
        if (member.user_id === me()) {
          this.communities.applyGone(member.community_id);
          return;
        }
        this.members.applyLeft(member);
        this.roles.applyLeft(member.community_id, member.user_id);
      },
      "member.banned": ({ community_id, user_id }) => {
        this.members.applyBanned(community_id);
        this.messages.applyBanned(
          community_id,
          user_id,
          this.communities.can(community_id, "view_hidden_messages"),
        );
      },
      "member.unbanned": ({ community_id, user_id }) =>
        this.members.applyUnbanned(community_id, user_id),
      "access.changed": ({ community_id }) =>
        void this.accessChanged(community_id),
      "profile.updated": (profile) => this.profiles.applyProfile(profile),
      "friend_request.created": (request) => this.social.applyRequest(request),
      "friend_request.deleted": (request) =>
        this.social.applyRequestDeleted(request.id),
      "friendship.created": (friendship) =>
        this.social.applyFriendship(friendship),
      "friendship.deleted": (friendship) =>
        this.social.applyFriendshipDeleted(friendship),
      "block.created": (block) => this.social.applyBlock(block),
      "block.deleted": (block) => this.social.applyBlockDeleted(block),
      "friend_links.changed": () => void this.social.loadLinks(),
      "notification.created": (notification) => {
        this.notifications.applyCreated(notification);
        if (
          (notification.kind === "report_outcome" ||
            notification.kind === "moderation_decision") &&
          this.read.reports.get().mine !== null
        ) {
          void this.reports.loadMine();
        }
        this.listeners.notification?.(notification);
      },
      "notifications.changed": () => void this.notifications.load(),
      "report.created": (report) => this.reports.applyCreated(report),
      "report.updated": (report) => this.reports.applyUpdated(report),
      "case.changed": (change) => void this.cases.applyChanged(change),
      "account.changed": () => void this.account.load(),
      "account.restricted": (restriction) =>
        this.listeners.restricted?.(restriction),
      "voice.control": (control) => this.voice.applyRemoteControl(control),
    };
  }
}
