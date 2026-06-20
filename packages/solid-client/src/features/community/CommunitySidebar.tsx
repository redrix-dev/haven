import { For, Show, createEffect, createMemo, onCleanup } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { MessageCircle, Settings, Users } from "lucide-solid";
import { requireHavenSolidCore } from "@solid-client/core";
import { useSession } from "@solid-client/contexts/SessionProvider";
import { useVoice } from "@solid-client/contexts/VoiceProvider";
import { Avatar } from "@solid-client/components/ui";
import { createChannelVoiceParticipants } from "@solid-client/data/voice";
import type { HavenChannel } from "@shared/nexus/community/channelTypes";

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

  return { communities, activeCommunityId, channels, activeChannelId };
}

// ─── component ───────────────────────────────────────────────────────────────

export function CommunitySidebar() {
  const { communities, activeCommunityId, channels, activeChannelId } =
    useSidebarData();
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
          <div class="flex w-56 flex-col bg-surface-panel">
            <div class="flex h-12 shrink-0 items-center border-b border-border px-4">
              <span class="font-semibold text-foreground">
                {activeCommunityName()}
              </span>
            </div>

            <div class="flex-1 overflow-y-auto px-2 py-2">
              <Show when={textChannels().length > 0}>
                <p class="mb-1 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Text Channels
                </p>
                <For each={textChannels()}>
                  {(channel) => (
                    <ChannelRow
                      label={channel.name}
                      prefix="#"
                      active={activeChannelId() === channel.id}
                      onClick={() =>
                        navigate(
                          `/community/${communityId()}/channel/${channel.id}`,
                        )
                      }
                    />
                  )}
                </For>
              </Show>

              <Show when={voiceChannels().length > 0}>
                <p class="mb-1 mt-3 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Voice Channels
                </p>
                <For each={voiceChannels()}>
                  {(channel) => (
                    <VoiceChannelRow
                      channel={channel}
                      communityId={communityId()}
                    />
                  )}
                </For>
                <VoicePresenceSubscriptions
                  communityId={communityId()}
                  channelIds={voiceChannels().map((c) => c.id)}
                />
              </Show>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}

// Small internal components — not exported, not in components/ui/ because
// nothing outside this feature needs them.
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
  const occupants = createChannelVoiceParticipants(
    core.voice,
    () => props.channel.id,
  );
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
            />
          </Show>
          <For each={occupants()}>
            {(participant) => (
              <OccupantRow
                name={participant.displayName}
                avatarUrl={participant.avatarUrl ?? null}
                speaking={participant.isSpeaking ?? false}
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
}) {
  return (
    <div class="flex items-center gap-1.5 px-1 py-0.5">
      <span
        class="rounded-full"
        classList={{ "ring-2 ring-accent-success": props.speaking }}
      >
        <Avatar src={props.avatarUrl} name={props.name} size="sm" />
      </span>
      <span class="min-w-0 truncate text-xs text-muted-foreground">
        {props.name}
      </span>
    </div>
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
    const dispose = core.voice.subscribePresenceChannels({
      communityId: props.communityId,
      channelIds: props.channelIds,
      activeChannelId: voice.activeChannel?.channelId ?? null,
    });
    onCleanup(dispose);
  });

  return null;
}
