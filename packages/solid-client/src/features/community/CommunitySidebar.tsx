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
  ChevronRight,
  MessageCircle,
  Plus,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-solid";
import * as KDropdownMenu from "@kobalte/core/dropdown-menu";
import { requireHavenSolidCore } from "@solid-client/core";
import { useVoice } from "@solid-client/contexts/VoiceProvider";
import { Avatar } from "@solid-client/components/ui";
import { openCommunitySettings } from "@solid-client/data/screen";
import type { Channel, ChannelCategory } from "@shared/lib/backend/records";
import { myCommunities } from "@shared/collections/communities/selectors";
import { communityChannels } from "@shared/collections/channels/selectors";
import { isMuted, unreadCount } from "@shared/collections/channels/selectors";
import {
  categoriesOf,
  isCollapsed,
} from "@shared/collections/categories/selectors";
import {
  openCommunityId,
  openChannelId,
} from "@shared/collections/session/selectors";
import { waitingReportCount } from "@shared/collections/reports/selectors";
import { outranks } from "@shared/collections/roles/selectors";
import { selectChannelParticipants } from "@shared/collections/voice/voice";

/**
 * The rail of communities and the open community's channels. The sidebar
 * navigates; the route opens (CommunityRouteSync), so the URL stays the one
 * answer to "where am I".
 */
export function CommunitySidebar() {
  const core = requireHavenSolidCore();
  const navigate = useNavigate();
  const communities = createMemo(() => myCommunities(core.stores.communities));
  const activeCommunityId = () => openCommunityId(core.stores.session);
  const moderated = createMemo(() =>
    communities()
      .map((c) => c.id)
      .filter((id) => core.communities.can(id, "manage_reports")),
  );
  const unseen = () => core.stores.notifications.unseen;
  const waitingReports = () =>
    moderated().reduce(
      (sum, id) => sum + waitingReportCount(core.stores.reports, id),
      0,
    );

  return (
    <div class="flex h-full">
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

        <button
          title="Create or join a community"
          onClick={() => navigate("/communities")}
          class="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-border text-body-soft transition-all hover:rounded-xl hover:border-primary hover:bg-sidebar-accent hover:text-foreground"
        >
          <Plus size={20} />
        </button>

        <div class="mt-auto">
          <RailButton
            title="Notifications"
            onClick={() => navigate("/notifications")}
            badge={unseen()}
          >
            <Bell size={20} />
          </RailButton>
          <RailButton title="Friends" onClick={() => navigate("/friends")}>
            <Users size={20} />
          </RailButton>
          <RailButton
            title="Direct messages"
            onClick={() => navigate("/direct-messages")}
          >
            <MessageCircle size={20} />
          </RailButton>
          <Show when={moderated().length > 0}>
            <RailButton
              title="Modmail"
              onClick={() => navigate("/modmail")}
              badge={waitingReports()}
              danger
            >
              <ShieldAlert size={20} />
            </RailButton>
          </Show>
          <RailButton
            title="Settings"
            onClick={() => navigate("/settings/appearance")}
          >
            <Settings size={20} />
          </RailButton>
        </div>
      </nav>

      <Show
        when={activeCommunityId()}
        keyed
        fallback={
          <div class="flex w-56 items-center justify-center bg-surface-panel text-sm text-muted-foreground">
            Select a community
          </div>
        }
      >
        {(communityId) => <CommunityChannelList communityId={communityId} />}
      </Show>
    </div>
  );
}

function RailButton(props: {
  title: string;
  onClick: () => void;
  badge?: number;
  danger?: boolean;
  children: import("solid-js").JSX.Element;
}) {
  return (
    <button
      title={props.title}
      onClick={() => props.onClick()}
      class="relative mb-2 flex h-12 w-12 items-center justify-center rounded-2xl text-body-soft transition-all hover:rounded-xl hover:bg-sidebar-accent hover:text-foreground"
    >
      {props.children}
      <Show when={(props.badge ?? 0) > 0}>
        <span
          class="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
          classList={{
            "bg-primary text-primary-foreground": !props.danger,
            "bg-destructive text-destructive-foreground": props.danger,
          }}
        >
          {(props.badge ?? 0) > 99 ? "99+" : props.badge}
        </span>
      </Show>
    </button>
  );
}

/** One group of channels: those without a category first, then each category. */
type ChannelGroup = { category: ChannelCategory | null; channels: Channel[] };

function CommunityChannelList(props: { communityId: string }) {
  const core = requireHavenSolidCore();
  const navigate = useNavigate();
  const community = () => core.stores.communities.byId[props.communityId];
  const activeChannelId = () => openChannelId(core.stores.session);

  const groups = createMemo<ChannelGroup[]>(() => {
    const channels = communityChannels(core.stores.channels, props.communityId);
    const categories = categoriesOf(core.stores.categories, props.communityId);
    const known = new Set(categories.map((c) => c.id));
    return [
      {
        category: null,
        channels: channels.filter(
          (c) => c.category_id === null || !known.has(c.category_id),
        ),
      },
      ...categories.map((category) => ({
        category,
        channels: channels.filter((c) => c.category_id === category.id),
      })),
    ].filter((group) => group.category !== null || group.channels.length > 0);
  });

  const voiceChannelIds = createMemo(() =>
    communityChannels(core.stores.channels, props.communityId)
      .filter((c) => c.kind === "voice")
      .map((c) => c.id),
  );

  return (
    <div class="flex w-56 flex-col bg-surface-panel">
      <button
        type="button"
        title="Community settings"
        onClick={() => openCommunitySettings(props.communityId)}
        class="flex h-12 shrink-0 items-center gap-1 border-b border-border px-4 text-left transition-colors hover:bg-surface-hover"
      >
        <span class="min-w-0 flex-1 truncate font-semibold text-foreground">
          {community()?.name}
        </span>
        <ChevronDown size={16} class="shrink-0 text-muted-foreground" />
      </button>

      <div class="flex-1 overflow-y-auto px-2 py-2">
        <For each={groups()}>
          {(group) => (
            <div class="mb-2">
              <Show when={group.category}>
                {(category) => (
                  <button
                    type="button"
                    onClick={() =>
                      void core.categories.setCollapsed(
                        category().id,
                        !isCollapsed(core.stores.categories, category().id),
                      )
                    }
                    class="flex w-full items-center gap-1 px-1 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    <Show
                      when={isCollapsed(core.stores.categories, category().id)}
                      fallback={<ChevronDown size={12} />}
                    >
                      <ChevronRight size={12} />
                    </Show>
                    <span class="truncate">{category().name}</span>
                  </button>
                )}
              </Show>
              <For
                each={group.channels.filter(
                  (channel) =>
                    !group.category ||
                    !isCollapsed(core.stores.categories, group.category.id) ||
                    channel.id === activeChannelId() ||
                    unreadCount(core.stores.channels, channel.id) > 0,
                )}
              >
                {(channel) => (
                  <Show
                    when={channel.kind === "voice"}
                    fallback={
                      <ChannelRow
                        label={channel.name ?? ""}
                        prefix="#"
                        active={activeChannelId() === channel.id}
                        unread={
                          unreadCount(core.stores.channels, channel.id) > 0 &&
                          !isMuted(core.stores.channels, channel.id)
                        }
                        onClick={() =>
                          navigate(
                            `/community/${props.communityId}/channel/${channel.id}`,
                          )
                        }
                      />
                    }
                  >
                    <VoiceChannelRow
                      channel={channel}
                      communityId={props.communityId}
                    />
                  </Show>
                )}
              </For>
            </div>
          )}
        </For>
        <VoicePresenceSubscriptions
          communityId={props.communityId}
          channelIds={voiceChannelIds()}
        />
      </div>
    </div>
  );
}

function ChannelRow(props: {
  label: string;
  prefix: string;
  active: boolean;
  unread?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={() => props.onClick?.()}
      class="flex w-full items-center gap-2 rounded px-2 py-1 text-sm text-body-soft hover:bg-surface-list-hover hover:text-foreground"
      classList={{
        "bg-surface-row-selected text-foreground": props.active,
        "font-semibold text-foreground": props.unread && !props.active,
      }}
    >
      <span class="text-muted-foreground">{props.prefix}</span>
      <span class="min-w-0 flex-1 truncate text-left">{props.label}</span>
      <Show when={props.unread && !props.active}>
        <span class="h-2 w-2 shrink-0 rounded-full bg-foreground" />
      </Show>
    </button>
  );
}

// A voice channel row: click to join, occupants listed underneath (live from
// the presence subscriptions below).
function VoiceChannelRow(props: { channel: Channel; communityId: string }) {
  const core = requireHavenSolidCore();
  const { voice, joinChannel } = useVoice();
  const occupants = () =>
    selectChannelParticipants(core.stores.voice, props.channel.id) ?? [];
  const isActive = () => voice.activeChannel?.channelId === props.channel.id;
  // Room participants are remotes only — the viewer appears via this row.
  const showSelf = () => isActive() && (voice.joined || voice.joining);
  const me = () => core.userId ?? "";

  return (
    <div>
      <ChannelRow
        label={props.channel.name ?? ""}
        prefix="♪"
        active={isActive()}
        onClick={() =>
          void joinChannel({
            communityId: props.communityId,
            channelId: props.channel.id,
            channelName: props.channel.name ?? "",
          })
        }
      />
      <Show when={showSelf() || occupants().length > 0}>
        <div class="mb-1 ml-6 flex flex-col gap-0.5">
          <Show when={showSelf()}>
            <OccupantRow
              name={core.nameOf(me(), props.communityId)}
              avatarUrl={core.avatarUrl(me())}
              speaking={false}
              isSelf={true}
              userId={me()}
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

  // Must be a FUNCTION, not a shared JSX node. In Solid, `const row = <div/>`
  // is one physical DOM element; reusing that same node in both the <Show>
  // fallback AND inside the dropdown Trigger means the node lives in two places
  // at once. When `inThisChannel()` flips (join/leave/switch), <Show> tears down
  // one branch and mounts the other, and the occupants <For>'s reconcileArrays
  // then tries to insertBefore a node that's still parented in the other branch
  // — WebKitGTK rejects it as HierarchyRequestError ("incorrect node tree").
  // Calling row() per use gives each branch its own independent element.
  const row = () => (
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
  if (props.isSelf) return row();

  // The menu's actions only work in the channel you're connected to. Gate via
  // <Show> (reactive), not an early return, so the menu appears the instant
  // you join and collapses back to a plain row when you leave.
  const inThisChannel = () =>
    voice.joined && voice.activeChannel?.channelId === props.channelId;

  const volume = () => voice.memberVolumes[props.userId] ?? 100;
  // The database decides; this only hides what it would refuse.
  const canDisconnect = () => {
    const community = core.stores.communities.byId[props.communityId];
    return (
      !!community &&
      core.communities.can(props.communityId, "manage_members") &&
      outranks(core.stores.roles, community, core.userId ?? "", props.userId)
    );
  };

  return (
    <Show when={inThisChannel()} fallback={row()}>
      <KDropdownMenu.Root>
        <KDropdownMenu.Trigger class="w-full text-left">
          {row()}
        </KDropdownMenu.Trigger>
        <KDropdownMenu.Portal>
          <KDropdownMenu.Content class="z-50 min-w-52 rounded-lg border border-border-dialog bg-popover p-2 text-popover-foreground shadow-lg outline-hidden">
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
            <Show when={canDisconnect()}>
              <KDropdownMenu.Item
                class="mt-1 flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive outline-hidden data-highlighted:bg-destructive data-highlighted:text-primary-foreground"
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
    // ...then subscribe untracked. subscribePresenceChannels reads the rosters
    // and its syncs WRITE them; tracked, every presence sync would
    // re-subscribe forever.
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
