import { Show, createMemo, createSignal } from "solid-js";
import { Navigate, useParams } from "@solidjs/router";
import { requireHavenSolidCore } from "@solid-client/core";
import { useSession } from "@solid-client/contexts/SessionProvider";
import { useToast } from "@solid-client/contexts/ToastProvider";
import { ReportDialog, type ReportDialogResult } from "@solid-client/components/ui";
import { createCommunityRouteSync } from "./CommunityRouteSync";
import { buildMessageViewItems } from "./messageList/messageViewModel";
import { MessageList } from "./messageList/MessageList";
import { Composer } from "./Composer";
import { MembersPanel } from "./MembersPanel";

/** What the report dialog is currently targeting in a channel. */
type ReportSubject =
  | { kind: "message"; messageId: string; preview: string }
  | { kind: "user"; userId: string; name: string };

/**
 * The main surface for /community/:communityId[/channel/:channelId] —
 * channel header + chat. With no channel in the URL, redirects to the
 * community's first text channel once channels load.
 */
export function CommunityView() {
  createCommunityRouteSync();
  const params = useParams();
  const core = requireHavenSolidCore();

  const channels = core.channels.channels(() => params.communityId ?? "");
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
  const toast = useToast();
  const nexus = core.messages.for(props.communityId);

  const messages = nexus.visibleChannelMessages(() => props.channelId);
  const meta = nexus.channelMeta(() => props.channelId);
  const loadingOlder = nexus.isLoadingOlder(() => props.channelId);
  const loaded = nexus.hasInitialLoadCompleted(() => props.channelId);
  const liveProfiles = core.profiles.liveProfiles();

  void nexus.ensureInitialLoaded(props.channelId);
  void core.ensureCommunityPermissions(props.communityId);

  const viewerId = () => session()?.user.id ?? null;
  const canReport = () =>
    core.permissions.getPermissions(props.communityId).canCreateReports;

  const [report, setReport] = createSignal<ReportSubject | null>(null);
  const isMessageReport = () => report()?.kind === "message";
  const dialogTitle = () => {
    const r = report();
    if (!r) return "";
    return r.kind === "message" ? "Report message" : `Report ${r.name}`;
  };
  const dialogPreview = () => {
    const r = report();
    if (!r) return undefined;
    return r.kind === "message" ? r.preview : r.name;
  };

  const submitReport = async (result: ReportDialogResult) => {
    const subject = report();
    const reporterUserId = viewerId();
    if (!subject || !reporterUserId) return;
    if (subject.kind === "message") {
      await nexus.report({
        channelId: props.channelId,
        messageId: subject.messageId,
        reporterUserId,
        target: result.target,
        kind: result.kind,
        comment: result.comment,
      });
    } else {
      await core.reportUserProfile({
        communityId: props.communityId,
        targetUserId: subject.userId,
        reporterUserId,
        reason: result.comment,
        target: result.target,
      });
    }
    setReport(null);
    toast.show({
      title: "Report submitted",
      body: "Thanks — moderators will review it.",
    });
  };

  const items = createMemo(() =>
    buildMessageViewItems(messages(), liveProfiles()),
  );

  const onReachTop = () => {
    if (meta().hasMore && !loadingOlder()) {
      void nexus.loadOlder(props.channelId);
    }
  };

  const send = async (
    content: string,
    media?: { file: File; previewUrl: string },
  ) => {
    if (media) {
      await nexus.sendWithMedia(props.channelId, content, {
        mediaFile: media.file,
        mediaContentType: media.file.type,
        optimisticMediaUri: media.previewUrl,
        senderUserId: session()?.user.id ?? null,
      });
    } else {
      await nexus.send(props.channelId, content, {
        senderUserId: session()?.user.id ?? null,
      });
    }
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
            <MessageList
              items={items()}
              onReachTop={onReachTop}
              viewerId={viewerId()}
              canReport={canReport()}
              onReportMessage={(messageId, preview) =>
                setReport({ kind: "message", messageId, preview })
              }
              onReportUser={(userId, name) =>
                setReport({ kind: "user", userId, name })
              }
            />
          </Show>
        </Show>
      </div>
      <Composer channelName={props.channelName} onSend={send} />
      <ReportDialog
        open={report() !== null}
        title={dialogTitle()}
        subjectLabel={isMessageReport() ? "Reported message" : "Reported user"}
        subjectPreview={dialogPreview()}
        showKind={isMessageReport()}
        showTarget
        onClose={() => setReport(null)}
        onSubmit={submitReport}
      />
    </div>
  );
}
