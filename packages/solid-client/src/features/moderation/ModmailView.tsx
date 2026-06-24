import { For, Show, createMemo, createSignal } from "solid-js";
import { ShieldAlert } from "lucide-solid";
import { requireHavenSolidCore } from "@solid-client/core";
import { Avatar } from "@solid-client/components/ui";
import { useToast } from "@solid-client/contexts/ToastProvider";
import type {
  ServerReportDetail,
  ServerReportSummary,
  SupportReportMessageSnapshot,
  SupportReportSnapshot,
  SupportReportStatus,
} from "@shared/lib/backend/types";

const STATUS_LABELS: Record<SupportReportStatus, string> = {
  pending: "Pending",
  under_review: "Under review",
  resolved: "Resolved",
  dismissed: "Dismissed",
  escalated: "Escalated",
  resolved_by_platform: "Resolved by platform",
};

/** Statuses a community mod can set directly (escalate/acknowledge are buttons). */
const SETTABLE_STATUSES: SupportReportStatus[] = [
  "pending",
  "under_review",
  "resolved",
  "dismissed",
];

const OPEN_STATUSES: SupportReportStatus[] = ["pending", "under_review"];

function statusTone(status: SupportReportStatus): string {
  switch (status) {
    case "pending":
      return "bg-destructive/15 text-destructive";
    case "under_review":
      return "bg-primary/15 text-primary";
    case "escalated":
      return "bg-accent-amber/15 text-accent-amber";
    default:
      return "bg-surface-input text-muted-foreground";
  }
}

function isMessageSnapshot(
  snapshot: SupportReportSnapshot,
): snapshot is SupportReportMessageSnapshot {
  return "reportedMessage" in snapshot;
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
 * Community modmail inbox — a unified queue of reports across every community
 * the viewer can moderate. The cross-community load + realtime arrivals are
 * driven by ModmailLoader (mounted in the authed layout); this view just reads
 * the nexus projections and drives selection + triage.
 */
export function ModmailView() {
  const core = requireHavenSolidCore();
  const reports = core.moderation.reports();
  const loading = core.moderation.reportsLoading();
  const selectedId = core.moderation.selectedReportId();
  const detail = core.moderation.reportDetail();
  const detailLoading = core.moderation.detailLoading();

  const [showResolved, setShowResolved] = createSignal(false);

  const visible = createMemo(() => {
    const all = reports();
    return showResolved()
      ? all
      : all.filter((r) => OPEN_STATUSES.includes(r.status));
  });

  return (
    <div class="flex h-full min-h-0 flex-col">
      <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <ShieldAlert size={18} class="text-muted-foreground" />
        <h1 class="flex-1 font-semibold text-foreground">Modmail</h1>
        <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showResolved()}
            onChange={(e) => setShowResolved(e.currentTarget.checked)}
          />
          Show resolved
        </label>
      </header>

      <div class="flex min-h-0 flex-1">
        {/* List */}
        <div class="flex w-80 shrink-0 flex-col border-r border-border">
          <Show
            when={!loading() || reports().length > 0}
            fallback={
              <p class="p-4 text-sm text-muted-foreground">Loading…</p>
            }
          >
            <Show
              when={visible().length > 0}
              fallback={
                <div class="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  {showResolved()
                    ? "No reports."
                    : "No open reports. You're all caught up."}
                </div>
              }
            >
              <ul class="min-h-0 flex-1 overflow-y-auto">
                <For each={visible()}>
                  {(report) => (
                    <ReportListRow
                      report={report}
                      selected={selectedId() === report.reportId}
                      onSelect={() =>
                        void core.moderation.selectReport(report.reportId)
                      }
                    />
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </div>

        {/* Detail */}
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show
            when={selectedId()}
            fallback={
              <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a report to review.
              </div>
            }
          >
            <Show
              when={detail() && !detailLoading()}
              fallback={
                <p class="p-6 text-sm text-muted-foreground">Loading…</p>
              }
            >
              <ReportDetailPane detail={detail()!} />
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}

function ReportListRow(props: {
  report: ServerReportSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => props.onSelect()}
        class="flex w-full flex-col gap-1 border-b border-border px-3 py-2.5 text-left transition-colors"
        classList={{
          "bg-surface-row-selected": props.selected,
          "hover:bg-surface-list-hover": !props.selected,
        }}
      >
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {props.report.title}
          </span>
          <span
            class={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusTone(props.report.status)}`}
          >
            {STATUS_LABELS[props.report.status]}
          </span>
        </div>
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span class="truncate">{props.report.serverName}</span>
          <span>·</span>
          <span class="shrink-0">{formatTime(props.report.createdAt)}</span>
        </div>
      </button>
    </li>
  );
}

function ReportDetailPane(props: { detail: ServerReportDetail }) {
  const core = requireHavenSolidCore();
  const toast = useToast();
  const [note, setNote] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const reportId = () => props.detail.reportId;

  const run = async (fn: () => Promise<unknown>, errLabel: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.show({
        title: errLabel,
        body: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: SupportReportStatus) =>
    void run(
      () => core.moderation.updateStatus(reportId(), status),
      "Couldn't update status",
    );

  const addNote = () => {
    const body = note().trim();
    if (!body) return;
    void run(async () => {
      await core.moderation.addNote(reportId(), body);
      setNote("");
    }, "Couldn't add note");
  };

  const escalate = () =>
    void run(async () => {
      await core.moderation.escalate(reportId());
      toast.show({ title: "Escalated to Platform Moderation" });
    }, "Couldn't escalate");

  const acknowledge = () =>
    void run(
      () => core.moderation.acknowledge(reportId()),
      "Couldn't acknowledge",
    );

  return (
    <div class="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <div class="mb-1 flex items-center gap-2">
          <h2 class="flex-1 text-lg font-semibold text-foreground">
            {props.detail.title}
          </h2>
          <span
            class={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold uppercase ${statusTone(props.detail.status)}`}
          >
            {STATUS_LABELS[props.detail.status]}
          </span>
        </div>
        <p class="text-xs text-muted-foreground">
          {props.detail.serverName} · {formatTime(props.detail.createdAt)}
        </p>
      </div>

      {/* Reporter */}
      <div class="flex items-center gap-2">
        <Avatar
          src={props.detail.reporterAvatarUrl}
          name={props.detail.reporterUsername ?? "Unknown"}
          size="sm"
        />
        <div class="text-sm">
          <span class="text-muted-foreground">Reported by </span>
          <span class="text-foreground">
            {props.detail.reporterUsername ?? "Unknown"}
          </span>
        </div>
      </div>

      {/* Snapshot */}
      <Show when={props.detail.snapshot}>
        {(snap) => <SnapshotBlock snapshot={snap()} detail={props.detail} />}
      </Show>

      {/* Internal notes */}
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Internal notes
        </p>
        <Show
          when={props.detail.internalNotes.length > 0}
          fallback={
            <p class="text-sm text-muted-foreground">No notes yet.</p>
          }
        >
          <ul class="space-y-2">
            <For each={props.detail.internalNotes}>
              {(n) => (
                <li class="rounded-lg border border-border bg-surface-panel px-3 py-2">
                  <p class="text-xs text-muted-foreground">
                    {n.authorDisplayName ?? "Moderator"} ·{" "}
                    {formatTime(n.createdAt)}
                  </p>
                  <p class="whitespace-pre-wrap text-sm text-foreground">
                    {n.body}
                  </p>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <div class="flex gap-2">
          <input
            value={note()}
            disabled={busy()}
            placeholder="Add an internal note…"
            onInput={(e) => setNote(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && addNote()}
            class="flex-1 rounded border border-input bg-surface-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={busy() || note().trim().length === 0}
            onClick={() => addNote()}
            class="rounded-lg bg-surface-input px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Triage actions */}
      <div class="space-y-3 border-t border-border pt-4">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </span>
          <select
            value={props.detail.status}
            disabled={busy() || !SETTABLE_STATUSES.includes(props.detail.status)}
            onChange={(e) =>
              setStatus(e.currentTarget.value as SupportReportStatus)
            }
            class="rounded border border-input bg-surface-input px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
          >
            <For each={SETTABLE_STATUSES}>
              {(s) => <option value={s}>{STATUS_LABELS[s]}</option>}
            </For>
            <Show when={!SETTABLE_STATUSES.includes(props.detail.status)}>
              <option value={props.detail.status}>
                {STATUS_LABELS[props.detail.status]}
              </option>
            </Show>
          </select>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy() || props.detail.status === "escalated"}
            onClick={() => escalate()}
            class="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            Escalate to Platform
          </button>
          <Show when={props.detail.platformAction}>
            <button
              type="button"
              disabled={busy()}
              onClick={() => acknowledge()}
              class="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Acknowledge platform action
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}

function SnapshotBlock(props: {
  snapshot: SupportReportSnapshot;
  detail: ServerReportDetail;
}) {
  return (
    <Show
      when={isMessageSnapshot(props.snapshot) ? props.snapshot : null}
      fallback={
        <div class="rounded-lg border border-border bg-surface-panel px-3 py-2.5 text-sm">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reported user
          </p>
          <p class="text-foreground">
            {props.detail.targetDisplayName ?? "Unknown user"}
          </p>
        </div>
      }
    >
      {(msgSnap) => (
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reported message
          </p>
          <SnapshotMessage message={msgSnap().reportedMessage} highlighted />
          <Show when={msgSnap().contextAfter.length > 0}>
            <div class="opacity-70">
              <For each={msgSnap().contextAfter.slice(0, 2)}>
                {(m) => <SnapshotMessage message={m} />}
              </For>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}

function SnapshotMessage(props: {
  message: SupportReportMessageSnapshot["reportedMessage"];
  highlighted?: boolean;
}) {
  return (
    <div
      class="rounded-lg border px-3 py-2"
      classList={{
        "border-destructive/40 bg-destructive/5": props.highlighted,
        "border-border bg-surface-panel": !props.highlighted,
      }}
    >
      <div class="mb-0.5 flex items-center gap-2">
        <Avatar
          src={props.message.avatarUrl}
          name={props.message.authorUsername ?? "Unknown"}
          size="sm"
        />
        <span class="text-sm font-medium text-foreground">
          {props.message.authorUsername ?? "Unknown"}
        </span>
        <span class="text-xs text-muted-foreground">
          {formatTime(props.message.createdAt)}
        </span>
      </div>
      <p class="whitespace-pre-wrap text-sm text-body-soft">
        {props.message.content}
      </p>
    </div>
  );
}
