import { Show, createMemo } from "solid-js";
import { Navigate, useParams } from "@solidjs/router";
import { requireHavenSolidCore } from "@solid-client/core";
import { useSession } from "@solid-client/contexts/SessionProvider";
import { createChannels } from "@solid-client/data/channels";
import {
  createVisibleChannelMessages,
  createChannelMeta,
  createIsLoadingOlder,
  createHasInitialLoadCompleted,
} from "@solid-client/data/messages";
import { createLiveProfiles } from "@solid-client/data/profile";
import { createCommunityRouteSync } from "./CommunityRouteSync";
import { buildMessageViewItems } from "./messageList/messageViewModel";
import { MessageList } from "./messageList/MessageList";
import { Composer } from "./Composer";
import { MembersPanel } from "./MembersPanel";

/**
 * The main surface for /community/:communityId[/channel/:channelId] —
 * channel header + chat. With no channel in the URL, redirects to the
 * community's first text channel once channels load.
 */
export function CommunityView() {
  createCommunityRouteSync();
  const params = useParams();
  const core = requireHavenSolidCore();

  const channels = createChannels(
    core.channels,
    () => params.communityId ?? "",
  );
  const activeChannel = createMemo(() =>
    channels().find((c) => c.id === params.channelId),
  );
  const firstTextChannel = createMemo(() =>
    channels().find((c) => c.kind === "text"),
  );

  return (
    <Show
      when={params.channelId}
      fallback={
        <Show
          when={firstTextChannel()}
          fallback={
            <div class="flex h-full items-center justify-center text-muted-foreground">
              No text channels yet.
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
        </header>

        <div class="flex min-h-0 flex-1">
          {/* keyed: a channel switch remounts the chat (fresh scroll state). */}
          <Show when={params.channelId} keyed>
            {(channelId) => (
              <ChannelChat
                communityId={params.communityId ?? ""}
                channelId={channelId}
                channelName={activeChannel()?.name ?? ""}
              />
            )}
          </Show>
          <MembersPanel communityId={params.communityId ?? ""} />
        </div>
      </div>
    </Show>
  );
}

// Internal: data wiring for one channel's chat. Mounted per channel; the
// virtualized list below the view-model seam never touches caches.
function ChannelChat(props: {
  communityId: string;
  channelId: string;
  channelName: string;
}) {
  const core = requireHavenSolidCore();
  const { session } = useSession();
  const cache = core.messages.for(props.communityId);

  const messages = createVisibleChannelMessages(
    cache,
    core.viewerMessagePolicyStore,
    () => props.channelId,
  );
  const meta = createChannelMeta(cache, () => props.channelId);
  const loadingOlder = createIsLoadingOlder(cache, () => props.channelId);
  const loaded = createHasInitialLoadCompleted(cache, () => props.channelId);
  const liveProfiles = createLiveProfiles(core.profiles);

  void cache.ensureInitialLoaded(props.channelId);

  const items = createMemo(() =>
    buildMessageViewItems(messages(), liveProfiles()),
  );

  const onReachTop = () => {
    if (meta().hasMore && !loadingOlder()) {
      void cache.loadOlder(props.channelId);
    }
  };

  const send = async (content: string) => {
    await cache.send(props.channelId, content, {
      senderUserId: session()?.user.id ?? null,
    });
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="min-h-0 flex-1">
        <Show
          when={loaded()}
          fallback={
            <div class="flex h-full items-center justify-center text-muted-foreground">
              Loading…
            </div>
          }
        >
          <Show
            when={items().length > 0}
            fallback={
              <div class="flex h-full items-center justify-center text-muted-foreground">
                No messages yet — say something.
              </div>
            }
          >
            <MessageList items={items()} onReachTop={onReachTop} />
          </Show>
        </Show>
      </div>
      <Composer channelName={props.channelName} onSend={send} />
    </div>
  );
}
