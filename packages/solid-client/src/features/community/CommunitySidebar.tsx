import { For, Show, createMemo } from "solid-js";
import { requireHavenSolidCore } from "@solid-client/core";
import {
  createOrderedCommunities,
  createActiveCommunityId,
} from "@solid-client/data/communities";
import { createChannels, createActiveChannelId } from "@solid-client/data/channels";

// ─── data wiring ─────────────────────────────────────────────────────────────
//
// `requireHavenSolidCore()` hands us the already-bootstrapped core. We pull
// the two caches off it and pass them into accessor factories.
//
// Accessor factories return a Solid `Accessor<T>` — a zero-argument function
// you call to read the current value: `communities()`. Solid's tracking system
// records that call, so any component or memo that reads an accessor re-runs
// automatically when the cache updates. Think of it as a React selector hook,
// but without hook rules — call these at the top of a component function once,
// like any variable.

function useSidebarData() {
  const core = requireHavenSolidCore();

  const communities = createOrderedCommunities(core.communities);
  const activeCommunityId = createActiveCommunityId(core.communities);
  const activeChannelId = createActiveChannelId(core.channels);

  // createChannels needs to know which community to filter by.
  // Passing a getter `() => activeCommunityId()` lets the accessor re-derive
  // automatically when the active community changes.
  const channels = createChannels(
    core.channels,
    () => activeCommunityId() ?? "",
  );

  const focusCommunity = (id: string) => core.communities.setActiveId(id);
  const focusChannel = (id: string) => core.channels.setActiveChannelId(id);

  return {
    communities,
    activeCommunityId,
    channels,
    activeChannelId,
    focusCommunity,
    focusChannel,
  };
}

// ─── component ───────────────────────────────────────────────────────────────

export function CommunitySidebar() {
  const {
    communities,
    activeCommunityId,
    channels,
    activeChannelId,
    focusCommunity,
    focusChannel,
  } = useSidebarData();

  // createMemo computes a derived value and caches it until its dependencies
  // change. Solid only re-runs this when channels() changes — the template
  // doesn't redo the filter work on every keystroke or unrelated update.
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
      {/* ── community strip ──────────────────────────────────────────────── */}
      {/*
        <For> is Solid's keyed list primitive. It tracks items by the `each`
        array, updating only the items that changed. The callback receives the
        item directly (not a signal) — unlike React where you'd map over an
        array and use index as key, Solid handles diffing internally.
      */}
      <nav class="flex w-16 flex-col items-center gap-2 bg-surface-1 py-3">
        <For each={communities()}>
          {(community) => (
            <button
              title={community.name}
              onClick={() => focusCommunity(community.id)}
              class="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-4 text-sm font-bold text-text-primary transition-all hover:rounded-xl hover:bg-primary"
              classList={{
                "rounded-xl bg-primary": activeCommunityId() === community.id,
              }}
            >
              {community.name.slice(0, 2).toUpperCase()}
            </button>
          )}
        </For>
      </nav>

      {/* ── channel list ─────────────────────────────────────────────────── */}
      {/*
        <Show> conditionally renders — `when` takes any expression. When
        falsy, `fallback` renders instead. Solid mounts/unmounts the content
        as the condition flips, so there's no hidden DOM sitting around.
      */}
      <Show
        when={activeCommunityId()}
        fallback={
          <div class="flex flex-1 items-center justify-center bg-surface-2 text-sm text-text-muted">
            Select a community
          </div>
        }
      >
        <div class="flex w-56 flex-col bg-surface-2">
          <div class="flex h-12 shrink-0 items-center border-b border-border px-4">
            <span class="font-semibold text-text-primary">
              {activeCommunityName()}
            </span>
          </div>

          <div class="flex-1 overflow-y-auto px-2 py-2">
            <Show when={textChannels().length > 0}>
              <p class="mb-1 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Text Channels
              </p>
              <For each={textChannels()}>
                {(channel) => (
                  <ChannelRow
                    label={channel.name}
                    prefix="#"
                    active={activeChannelId() === channel.id}
                    onClick={() => focusChannel(channel.id)}
                  />
                )}
              </For>
            </Show>

            <Show when={voiceChannels().length > 0}>
              <p class="mb-1 mt-3 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Voice Channels
              </p>
              <For each={voiceChannels()}>
                {(channel) => (
                  <ChannelRow
                    label={channel.name}
                    prefix="♪"
                    active={activeChannelId() === channel.id}
                    onClick={() => focusChannel(channel.id)}
                  />
                )}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}

// Small internal component — not exported, not in components/ui/ because
// nothing outside this feature needs it.
function ChannelRow(props: {
  label: string;
  prefix: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      class="flex w-full items-center gap-2 rounded px-2 py-1 text-sm text-text-secondary hover:bg-surface-4 hover:text-text-primary"
      classList={{ "bg-surface-4 text-text-primary": props.active }}
    >
      <span class="text-text-muted">{props.prefix}</span>
      {props.label}
    </button>
  );
}
