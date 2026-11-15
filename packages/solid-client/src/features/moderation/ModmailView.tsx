import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  untrack,
} from "solid-js";
import { ShieldAlert } from "lucide-solid";
import type {
  CommunityReportRecord,
  ReportStatus,
} from "@shared/lib/backend/records";
import { communityReports } from "@shared/collections/reports/selectors";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { requireHavenSolidCore } from "@solid-client/core";
import { Avatar, Button, ConfirmDialog } from "@solid-client/components/ui";
import { useToast } from "@solid-client/contexts/ToastProvider";

const STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  dismissed: "Dismissed",
  escalated: "Sent to Haven",
};

/** What a moderator sets; escalating is its own button, and final. */
const SETTABLE: Exclude<ReportStatus, "escalated">[] = [
  "open",
  "in_review",
  "resolved",
  "dismissed",
];

const WAITING: ReportStatus[] = ["open", "in_review"];

function statusTone(status: ReportStatus): string {
  switch (status) {
    case "open":
      return "bg-destructive/15 text-destructive";
    case "in_review":
      return "bg-primary/15 text-primary";
    case "escalated":
      return "bg-accent-amber/15 text-accent-amber";
    default:
      return "bg-surface-input text-muted-foreground";
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Modmail: the reports of every community the person moderates, newest
 * first. A report shows what the database wrote down when it was filed (the
 * message, its neighbours, the person), never who filed it.
 */
export function ModmailView() {
  const core = requireHavenSolidCore();
  const [showAll, setShowAll] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);

  const reports = createMemo(() =>
    Object.keys(core.stores.reports.byCommunity)
      .flatMap((id) => communityReports(core.stores.reports, id))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
  );
  const visible = createMemo(() =>
    showAll() ? reports() : reports().filter((r) => WAITING.includes(r.status)),
  );
  const selected = () => {
    const id = selectedId();
    return id ? core.stores.reports.byId[id] : undefined;
  };

  return (
    <div class="flex h-full min-h-0 flex-col">
      <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <ShieldAlert size={18} class="text-muted-foreground" />
        <h1 class="flex-1 font-semibold text-foreground">Modmail</h1>
        <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showAll()}
            onChange={(e) => setShowAll(e.currentTarget.checked)}
          />
          Show handled
        </label>
      </header>

      <div class="flex min-h-0 flex-1">
        <div class="flex w-80 shrink-0 flex-col border-r border-border">
          <Show
            when={visible().length > 0}
            fallback={
              <div class="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {showAll()
                  ? "No reports."
                  : "Nothing waiting. You're all caught up."}
              </div>
            }
          >
            <ul class="min-h-0 flex-1 overflow-y-auto">
              <For each={visible()}>
                {(report) => (
                  <li>
                    <button
                      type="button"
                      onClick={() => setSelectedId(report.id)}
                      class="flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left hover:bg-surface-list-hover"
                      classList={{
                        "bg-surface-row-selected": selectedId() === report.id,
                      }}
                    >
                      <div class="flex items-center gap-2">
                        <span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {report.subject_kind === "message"
                            ? "Message"
                            : "Member"}{" "}
                          ·{" "}
                          {
                            core.stores.communities.byId[report.community_id]
                              ?.name
                          }
                        </span>
                        <span
                          class={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusTone(report.status)}`}
                        >
                          {STATUS_LABELS[report.status]}
                        </span>
                      </div>
                      <span class="truncate text-xs text-muted-foreground">
                        {report.reason ||
                          report.snapshot.message?.body ||
                          "No reason given"}
                      </span>
                      <span class="text-[11px] text-muted-foreground">
                        {formatTime(report.created_at)}
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show
            when={selected()}
            keyed
            fallback={
              <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a report.
              </div>
            }
          >
            {(report) => <ReportDetail report={report} />}
          </Show>
        </div>
      </div>
    </div>
  );
}

function ContextLine(props: { username: string | null; body: string }) {
  return (
    <p class="text-muted-foreground">
      <span class="font-semibold">{props.username ?? "Deleted user"}:</span>{" "}
      {props.body}
    </p>
  );
}

function ReportDetail(props: { report: CommunityReportRecord }) {
  const core = requireHavenSolidCore();
  const toast = useToast();
  const report = () =>
    core.stores.reports.byId[props.report.id] ?? props.report;
  const snapshot = () => report().snapshot;
  const notes = () => core.stores.reports.notes[props.report.id] ?? [];
  const [note, setNote] = createSignal("");
  const [working, setWorking] = createSignal(false);
  const [escalating, setEscalating] = createSignal(false);

  // Track the report only; loading notes writes the reports store.
  createEffect(() => {
    const id = props.report.id;
    untrack(() => void core.reports.loadNotes(id));
  });
  createEffect(() => {
    const ids = [report().subject_user_id, ...notes().map((n) => n.author_id)];
    untrack(() => void core.profiles.ensure(ids));
  });

  const run = async (work: () => Promise<unknown>, done?: string) => {
    setWorking(true);
    try {
      await work();
      if (done) toast.show({ title: done });
    } catch (error) {
      toast.show({
        title: "That didn't work",
        body: getErrorMessage(error, "Try again in a moment."),
      });
    } finally {
      setWorking(false);
    }
  };

  const subject = () => report().subject_user_id;
  const before = () => {
    const at = snapshot().message?.created_at ?? "";
    return (snapshot().context ?? []).filter((c) => c.created_at < at);
  };
  const after = () => {
    const at = snapshot().message?.created_at ?? "";
    return (snapshot().context ?? []).filter((c) => c.created_at > at);
  };

  return (
    <div class="mx-auto max-w-2xl space-y-5 p-6">
      <div class="flex items-center gap-3">
        <Avatar
          src={core.avatarUrl(subject())}
          name={core.nameOf(subject())}
          size="lg"
        />
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-foreground">
            {core.nameOf(subject(), report().community_id)}
          </p>
          <p class="text-xs text-muted-foreground">
            Reported {formatTime(report().created_at)} in{" "}
            {core.stores.communities.byId[report().community_id]?.name}
          </p>
        </div>
        <span
          class={`rounded px-2 py-1 text-xs font-semibold ${statusTone(report().status)}`}
        >
          {STATUS_LABELS[report().status]}
        </span>
      </div>

      <Show when={report().reason}>
        <section>
          <h3 class="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            Reason
          </h3>
          <p class="whitespace-pre-wrap text-sm text-body-soft">
            {report().reason}
          </p>
        </section>
      </Show>

      <Show when={snapshot().message}>
        {(message) => (
          <section>
            <h3 class="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              The message, as it was when reported
            </h3>
            <div class="space-y-1 rounded border border-border bg-surface-panel p-3 text-sm">
              <For each={before()}>
                {(line) => (
                  <ContextLine username={line.username} body={line.body} />
                )}
              </For>
              <p class="rounded bg-destructive/10 px-2 py-1 text-foreground">
                <span class="font-semibold">
                  {snapshot().author?.username ?? "Deleted user"}:
                </span>{" "}
                {message().body}
              </p>
              <For each={after()}>
                {(line) => (
                  <ContextLine username={line.username} body={line.body} />
                )}
              </For>
            </div>
          </section>
        )}
      </Show>

      <Show when={snapshot().profile}>
        {(person) => (
          <section>
            <h3 class="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              Their profile, as it was when reported
            </h3>
            <div class="rounded border border-border bg-surface-panel p-3 text-sm">
              <p class="font-semibold text-foreground">
                {person().username ?? "Deleted user"}
              </p>
              <p class="mt-1 whitespace-pre-wrap text-body-soft">
                {person().bio || "No bio."}
              </p>
            </div>
          </section>
        )}
      </Show>

      <Show when={report().status !== "escalated"}>
        <section class="flex flex-wrap items-center gap-2">
          <For each={SETTABLE}>
            {(status) => (
              <Button
                size="sm"
                variant={report().status === status ? "primary" : "ghost"}
                disabled={working() || report().status === status}
                onClick={() =>
                  void run(() => core.reports.setStatus(report().id, status))
                }
              >
                {STATUS_LABELS[status]}
              </Button>
            )}
          </For>
          <Button
            size="sm"
            variant="ghost"
            class="text-accent-amber"
            disabled={working()}
            onClick={() => setEscalating(true)}
          >
            Send to Haven staff
          </Button>
        </section>
      </Show>

      <section>
        <h3 class="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Moderator notes
        </h3>
        <For
          each={notes()}
          fallback={<p class="text-sm text-muted-foreground">No notes yet.</p>}
        >
          {(entry) => (
            <div class="mb-2 rounded border border-border bg-surface-panel p-2 text-sm">
              <p class="text-xs text-muted-foreground">
                {core.nameOf(entry.author_id, report().community_id)} ·{" "}
                {formatTime(entry.created_at)}
              </p>
              <p class="mt-1 whitespace-pre-wrap text-body-soft">
                {entry.body}
              </p>
            </div>
          )}
        </For>
        <form
          class="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const body = note().trim();
            if (!body) return;
            void run(async () => {
              await core.reports.addNote(report().id, body);
              setNote("");
            });
          }}
        >
          <input
            value={note()}
            onInput={(e) => setNote(e.currentTarget.value)}
            placeholder="Add a note for other moderators"
            class="min-w-0 flex-1 rounded border border-border-control bg-surface-input px-3 py-2 text-sm text-foreground"
          />
          <Button
            type="submit"
            size="sm"
            disabled={working() || !note().trim()}
          >
            Add
          </Button>
        </form>
      </section>

      <ConfirmDialog
        open={escalating()}
        title="Send this report to Haven staff?"
        description="Haven's safety team takes it over. It can't be taken back."
        confirmLabel="Send to Haven"
        reason={{
          label: "Why",
          placeholder: "Optional: what staff should know",
        }}
        pending={working()}
        onConfirm={(reason) =>
          void run(
            () => core.reports.escalate(report().id, reason || undefined),
            "Sent to Haven staff",
          ).then(() => setEscalating(false))
        }
        onCancel={() => setEscalating(false)}
      />
    </div>
  );
}
