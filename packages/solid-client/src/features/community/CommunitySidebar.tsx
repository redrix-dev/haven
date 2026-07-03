import {
  For,
  Show,
  createEffect,
  createMemo,
  onCleanup,
  untrack,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  Bell,
  ChevronDown,
  MessageCircle,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-solid";
import { requireHavenSolidCore } from "@solid-client/core";
import { useSession } from "@solid-client/contexts/SessionProvider";
import { useVoice } from "@solid-client/contexts/VoiceProvider";
import { Avatar } from "@solid-client/components/ui";
import type { HavenChannel } from "@shared/nexus/community/channelTypes";
import { openCommunitySettings } from "./settings/CommunitySettingsPanel";
import { canOpenCommunitySettingsPanel } from "./settings/communitySettingsAccess";
import * as KDropdownMenu from "@kobalte/core/dropdown-menu";

// ─── data wiring ─────────────────────────────────────────────────────────────
//
// `requireHavenSolidCore()` hands us the already-bootstrapped core. The channel
// nexus owns its own projections, so we just ask it for the slices we need.
//
// Active community/channel are read from the nexus but written by the route:
// the sidebar NAVIGATES, and CommunityRouteSync writes the active ids from the
// URL params. The URL is the single source of truth for where you are.

function useSidebarData() {
  const core = requireHavenSolidCore();

  const communities = core.communities.orderedCommunities();
  const activeCommunityId = () => core.communities.activeCommunityId();
  const activeChannelId = () => core.channels.activeChannelId();

  // The channels projection re-derives whenever the active community changes;
  // passing the getter keeps it reactive to community switches.
  const channels = core.channels.channels(() => activeCommunityId() ?? "");

  const unreadNotifications = core.notifications.inboxUnreadCount();

  // Modmail is visible only to viewers who can moderate at least one community.
  const canAccessModmail = createMemo(() => {
    const byCommunity = core.permissions.getPermissionsByCommunityId();
    return Object.keys(byCommunity).some(
      (id) => byCommunity[id]?.canManageReports,
    );
  });
  const modmailOpenCount = core.moderation.openCount();

  return {
    communities,
    activeCommunityId,
    channels,
    activeChannelId,
    unreadNotifications,
    canAccessModmail,
    modmailOpenCount,
  };
}

// ─── component ───────────────────────────────────────────────────────────────

export function CommunitySidebar() {
  const {
    communities,
    activeCommunityId,
    channels,
    activeChannelId,
    unreadNotifications,
    canAccessModmail,
    modmailOpenCount,
  } = useSidebarData();
  const navigate = useNavigate();

  const textChannels = createMemo(() =>
    channels().filter((c) => c.kind === "text"),
  );
  const voiceChannels = createMemo(() =>
    channels().filter((c) => c.kind === "voice"),
  );

  const activeCommunityName = createMemo(
    () => communities().find((c) => c.id === activeCommunityId())?.name ?? "",
  );

  return (
    <div class="flex h-full">
      {/* ── community rail ───────────────────────────────────────────────── */}
      <nav class="flex w-16 flex-col items-center gap-2 bg-sidebar py-3">
        <For each={communities()}>
          {(community) => (
            <button
              title={community.name}
              onClick={() => navigate(`/community/${community.id}`)}
              class="flex h-12 w-12 items-center justify-center rounded-2xl bg-sidebar-accent text-sm font-bold text-sidebar-accent-foreground transition-all hover:rounded-xl hover:bg-primary hover:text-primary-foreground"
              classList={{
                "rounded-xl bg-primary text-primary-foreground":
                  activeCommunityId() === community.id,
              }}
            >
              {community.name.slice(0, 2).toUpperCase()}
            </button>
          )}
        </For>

        <div class="mt-auto">
          <button
            title="Notifications"
            onClick={() => navigate("/notifications")}
            class="relative mb-2 flex h-12 w-12 items-center justify-center rounded-2xl text-body-soft transition-all hover:rounded-xl hover:bg-sidebar-accent hover:text-foreground"
          >
            <Bell size={20} />
            <Show when={unreadNotifications() > 0}>
              <span class="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {unreadNotifications() > 99 ? "99+" : unreadNotifications()}
              </span>
            </Show>
          </button>
          <button
            title="Friends"
            onClick={() => navigate("/friends")}
            class="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl text-body-soft transition-all hover:rounded-xl hover:bg-sidebar-accent hover:text-foreground"
          >
            <Users size={20} />
          </button>
          <button
            title="Direct messages"
            onClick={() => navigate("/direct-messages")}
            class="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl text-body-soft transition-all hover:rounded-xl hover:bg-sidebar-accent hover:text-foreground"
          >
            <MessageCircle size={20} />
          </button>
          <Show when={canAccessModmail()}>
            <button
              title="Modmail"
              onClick={() => navigate("/modmail")}
              class="relative mb-2 flex h-12 w-12 items-center justify-center rounded-2xl text-body-soft transition-all hover:rounded-xl hover:bg-sidebar-accent hover:text-foreground"
            >
              <ShieldAlert size={20} />
              <Show when={modmailOpenCount() > 0}>
                <span class="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                  {modmailOpenCount() > 99 ? "99+" : modmailOpenCount()}
                </span>
              </Show>
            </button>
          </Show>
          <button
            title="Settings"
            onClick={() => navigate("/settings/appearance")}
            class="flex h-12 w-12 items-center justify-center rounded-2xl text-body-soft transition-all hover:rounded-xl hover:bg-sidebar-accent hover:text-foreground"
          >
            <Settings size={20} />
          </button>
        </div>
      </nav>

      {/* ── channel list ─────────────────────────────────────────────────── */}
      <Show
        when={activeCommunityId()}
        fallback={
          <div class="flex w-56 items-center justify-center bg-surface-panel text-sm text-muted-foreground">
            Select a community
          </div>
        }
      >
        {(communityId) => (
          <CommunityChannelList
            communityId={communityId()}
            communityName={activeCommunityName()}
            textChannels={textChannels()}
            voiceChannels={voiceChannels()}
            activeChannelId={activeChannelId()}
            onNavigateChannel={(channelId) =>
              navigate(`/community/${communityId()}/channel/${channelId}`)
            }
          />
        )}
      </Show>
    </div>
  );
}

// Small internal components — not exported, not in components/ui/ because
// nothing outside this feature needs them.

function CommunityChannelList(props: {
  communityId: string;
  communityName: string;
  textChannels: HavenChannel[];
  voiceChannels: HavenChannel[];
  activeChannelId: string | null;
  onNavigateChannel: (channelId: string) => void;
}) {
  const core = requireHavenSolidCore();

  const canManage = () =>
    canOpenCommunitySettingsPanel(
      core.permissions.getPermissions(props.communityId),
    );

  createEffect(() => {
    void core.ensureCommunityPermissions(props.communityId);
  });

  return (
    <div class="flex w-56 flex-col bg-surface-panel">
      <Show
        when={canManage()}
        fallback={
          <div class="flex h-12 shrink-0 items-center border-b border-border px-4">
            <span class="font-semibold text-foreground">
              {props.communityName}
            </span>
          </div>
        }
      >
        <button
          type="button"
          title="Community settings"
          onClick={() => openCommunitySettings()}
          class="flex h-12 shrink-0 items-center gap-1 border-b border-border px-4 text-left transition-colors hover:bg-surface-hover"
        >
          <span class="min-w-0 flex-1 truncate font-semibold text-foreground">
            {props.communityName}
          </span>
          <ChevronDown size={16} class="shrink-0 text-muted-foreground" />
        </button>
      </Show>

      <div class="flex-1 overflow-y-auto px-2 py-2">
        <Show when={props.textChannels.length > 0}>
          <p class="mb-1 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Text Channels
          </p>
          <For each={props.textChannels}>
            {(channel) => (
              <ChannelRow
                label={channel.name}
                prefix="#"
                active={props.activeChannelId === channel.id}
                onClick={() => props.onNavigateChannel(channel.id)}
              />
            )}
          </For>
        </Show>

        <Show when={props.voiceChannels.length > 0}>
          <p class="mb-1 mt-3 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Voice Channels
          </p>
          <For each={props.voiceChannels}>
            {(channel) => (
              <VoiceChannelRow
                channel={channel}
                communityId={props.communityId}
              />
            )}
          </For>
          <VoicePresenceSubscriptions
            communityId={props.communityId}
            channelIds={props.voiceChannels.map((c) => c.id)}
          />
        </Show>
      </div>
    </div>
  );
}

function ChannelRow(props: {
  label: string;
  prefix: string;
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={() => props.onClick?.()}
      disabled={props.disabled}
      class="flex w-full items-center gap-2 rounded px-2 py-1 text-sm text-body-soft hover:bg-surface-list-hover hover:text-foreground disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
      classList={{ "bg-surface-row-selected text-foreground": props.active }}
    >
      <span class="text-muted-foreground">{props.prefix}</span>
      {props.label}
    </button>
  );
}

// A voice channel row: click to join, occupants listed underneath (live from
// the presence subscriptions below).
function VoiceChannelRow(props: {
  channel: HavenChannel;
  communityId: string;
}) {
  const core = requireHavenSolidCore();
  const { session } = useSession();
  const { voice, joinChannel } = useVoice();
  const viewerProfile = core.profiles.viewerProfile(
    () => session()?.user.id ?? null,
  );
  const occupants = core.voice.channelVoiceParticipants(() => props.channel.id);
  const isActive = () => voice.activeChannel?.channelId === props.channel.id;
  // Room participants are remotes only — the viewer appears via this row.
  const showSelf = () => isActive() && (voice.joined || voice.joining);

  return (
    <div>
      <ChannelRow
        label={props.channel.name}
        prefix="♪"
        active={isActive()}
        onClick={() =>
          void joinChannel({
            communityId: props.communityId,
            channelId: props.channel.id,
            channelName: props.channel.name,
          })
        }
      />
      <Show when={showSelf() || occupants().length > 0}>
        <div class="mb-1 ml-6 flex flex-col gap-0.5">
          <Show when={showSelf()}>
            <OccupantRow
              name={viewerProfile()?.username ?? "You"}
              avatarUrl={viewerProfile()?.avatarUrl ?? null}
              speaking={false}
              isSelf={true}
              userId={session()?.user.id ?? ""}
              communityId={props.communityId}
              channelId={props.channel.id}
            />
          </Show>
          <For each={occupants()}>
            {(participant) => (
              <OccupantRow
                name={participant.displayName}
                avatarUrl={participant.avatarUrl ?? null}
                speaking={participant.isSpeaking ?? false}
                isSelf={false}
                userId={participant.userId}
                communityId={props.communityId}
                channelId={props.channel.id}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function OccupantRow(props: {
  name: string;
  avatarUrl: string | null;
  speaking: boolean;
  isSelf: boolean;
  userId: string;
  communityId: string;
  channelId: string;
}) {
  const core = requireHavenSolidCore();
  const { voice, setMemberVolume } = useVoice();

  const row = (
    <div class="flex items-center gap-1.5 px-1 py-0.5">
      <span
        class="inline-flex rounded-full"
        classList={{ "ring-2 ring-accent-success": props.speaking }}
      >
        <Avatar src={props.avatarUrl} name={props.name} size="sm" />
      </span>
      <span class="min-w-0 truncate text-xs text-muted-foreground">
        {props.name}
      </span>
    </div>
  );

  // You don't get a menu on yourself.
  if (props.isSelf) return row;

  // The menu's actions only work in the channel you're connected to: kick needs
  // the live kick-broadcast channel (which only exists while joined), and volume
  // only matters for audio you're actually receiving. Gate via <Show> (reactive)
  // — NOT an early return — so the menu appears the instant you join and
  // collapses back to a plain row when you leave.
  const inThisChannel = () =>
    voice.joined && voice.activeChannel?.channelId === props.channelId;

  const volume = () => voice.memberVolumes[props.userId] ?? 100;
  const canKick = () =>
    core.permissions.getPermissions(props.communityId).canManageMembers;

  return (
    <Show when={inThisChannel()} fallback={row}>
      <KDropdownMenu.Root>
      <KDropdownMenu.Trigger class="w-full text-left">
        {row}
      </KDropdownMenu.Trigger>
      <KDropdownMenu.Portal>
        <KDropdownMenu.Content class="z-50 min-w-52 rounded-lg border border-border-dialog bg-popover p-2 text-popover-foreground shadow-lg outline-none">
          <div class="px-1 py-1.5" onPointerDown={(e) => e.stopPropagation()}>
            <div class="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Volume</span>
              <span>{volume()}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={volume()}
              onInput={(e) =>
                setMemberVolume(props.userId, Number(e.currentTarget.value))
              }
              class="w-full"
            />
          </div>
          <Show when={canKick()}>
            <KDropdownMenu.Item
              class="mt-1 flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive outline-none data-[highlighted]:bg-destructive data-[highlighted]:text-primary-foreground"
              onSelect={() =>
                void core.voice.kickParticipant(props.userId, props.channelId)
              }
            >
              Disconnect from voice
            </KDropdownMenu.Item>
          </Show>
        </KDropdownMenu.Content>
      </KDropdownMenu.Portal>
      </KDropdownMenu.Root>
    </Show>
  );
}

// Renders nothing — owns the presence subscriptions for this community's
// voice channels so the rows above show occupancy without joining.
function VoicePresenceSubscriptions(props: {
  communityId: string;
  channelIds: string[];
}) {
  const core = requireHavenSolidCore();
  const { voice } = useVoice();

  createEffect(() => {
    // Read the real inputs in the tracked scope so the effect only re-runs when
    // THESE change...
    const communityId = props.communityId;
    const channelIds = props.channelIds;
    const activeChannelId = voice.activeChannel?.channelId ?? null;
    // ...then run the imperative subscribe untracked. subscribePresenceChannels
    // reads participantsByChannelId (retainChannelParticipants) and its syncs
    // WRITE it — without untrack, those writes become dependencies of this
    // effect and every presence sync re-subscribes forever (infinite loop).
    const dispose = untrack(() =>
      core.voice.subscribePresenceChannels({
        communityId,
        channelIds,
        activeChannelId,
      }),
    );
    onCleanup(dispose);
  });

  return null;
}
