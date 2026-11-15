import { Show, createMemo } from "solid-js";
import { Navigate, useParams } from "@solidjs/router";
import { requireHavenSolidCore } from "@solid-client/core";
import { communityChannels } from "@shared/collections/channels/selectors";
import { answered } from "@shared/collections/kit/requests";
import { createCommunityRouteSync } from "./CommunityRouteSync";
import { ChannelChat } from "./ChannelChat";
import { MembersPanel } from "./MembersPanel";

/**
 * The main surface for /community/:communityId[/channel/:channelId]: the
 * channel's header and chat. With no channel in the URL, goes to the channel
 * last open there, else the community's first text channel.
 *
 * A community or channel the person can no longer see moves the route off
 * it, but only once the database has answered: until then what the device
 * kept is shown.
 */
export function CommunityView() {
  createCommunityRouteSync();
  const params = useParams();
  const core = requireHavenSolidCore();

  const channels = createMemo(() =>
    communityChannels(core.stores.channels, params.communityId ?? ""),
  );
  const activeChannel = createMemo(() =>
    params.channelId ? core.stores.channels.byId[params.channelId] : undefined,
  );
  const firstTextChannel = createMemo(() =>
    channels().find((c) => c.kind === "text"),
  );

  const communitiesLoaded = () =>
    answered(core.stores.communities.requests, "mine");
  const channelsLoaded = () =>
    answered(core.stores.channels.requests, `community:${params.communityId}`);

  const communityKnown = () =>
    !!params.communityId && !!core.stores.communities.byId[params.communityId];
  const channelKnown = () =>
    !params.channelId || activeChannel()?.community_id === params.communityId;

  return (
    <Show
      when={!communitiesLoaded() || communityKnown()}
      fallback={<Navigate href="/" />}
    >
      <Show
        when={!channelsLoaded() || channelKnown()}
        fallback={<Navigate href={`/community/${params.communityId}`} />}
      >
        <Show
          when={params.channelId}
          fallback={
            <Show
              when={firstTextChannel()}
              fallback={
                <div class="flex h-full items-center justify-center text-muted-foreground">
                  {channelsLoaded() ? "No text channels yet." : "Loading…"}
                </div>
              }
            >
              {(channel) => (
                <Navigate
                  href={`/community/${params.communityId}/channel/${channel().id}`}
                />
              )}
            </Show>
          }
        >
          <div class="flex h-full min-w-0 flex-1 flex-col">
            <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
              <span class="text-muted-foreground">#</span>
              <span class="font-semibold text-foreground">
                {activeChannel()?.name ?? ""}
              </span>
              <Show when={activeChannel()?.topic}>
                <span class="ml-2 min-w-0 truncate border-l border-border pl-3 text-sm text-muted-foreground">
                  {activeChannel()?.topic}
                </span>
              </Show>
            </header>

            <div class="flex min-h-0 flex-1">
              {/* keyed: a channel switch remounts the chat (fresh scroll state). */}
              <Show when={params.channelId} keyed>
                {(channelId) => (
                  <ChannelChat
                    channelId={channelId}
                    communityId={params.communityId ?? null}
                    placeholder={`Message #${activeChannel()?.name ?? ""}`}
                  />
                )}
              </Show>
              <MembersPanel communityId={params.communityId ?? ""} />
            </div>
          </div>
        </Show>
      </Show>
    </Show>
  );
}
