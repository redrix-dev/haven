import { For, Show, createEffect, createSignal } from "solid-js";
import { X } from "lucide-solid";
import { Button } from "./Button";
import type {
  MessageReportKind,
  MessageReportTarget,
} from "@shared/lib/backend/types";

export type ReportDialogResult = {
  kind: MessageReportKind;
  target: MessageReportTarget;
  comment: string;
};

const KIND_OPTIONS: { value: MessageReportKind; label: string }[] = [
  { value: "content_abuse", label: "Content abuse" },
  { value: "bug", label: "Bug / platform issue" },
];

const TARGET_OPTIONS: { value: MessageReportTarget; label: string }[] = [
  { value: "server_admins", label: "Community moderators" },
  { value: "haven_staff", label: "Haven Platform Moderation" },
  { value: "both", label: "Both" },
];

/**
 * Shared report dialog for messages and user accounts.
 *
 * - `showKind` — the abuse/bug picker (message reports show it; user reports
 *   don't carry a kind, so the caller hides it and ignores `result.kind`).
 * - `showTarget` — the destination picker. In a community context the reporter
 *   chooses community mods / platform / both; platform-only surfaces (DMs,
 *   non-community) hide it and the result targets `haven_staff`.
 *
 * Presentational: the caller's `onSubmit` performs the actual report.
 */
export function ReportDialog(props: {
  open: boolean;
  title: string;
  subjectLabel?: string;
  subjectPreview?: string;
  showKind: boolean;
  showTarget: boolean;
  onClose: () => void;
  onSubmit: (result: ReportDialogResult) => Promise<void>;
}) {
  const [kind, setKind] = createSignal<MessageReportKind>("content_abuse");
  const [target, setTarget] =
    createSignal<MessageReportTarget>("server_admins");
  const [comment, setComment] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Reset whenever the dialog closes so the next open starts clean.
  createEffect(() => {
    if (!props.open) {
      setKind("content_abuse");
      setTarget(props.showTarget ? "server_admins" : "haven_staff");
      setComment("");
      setSubmitting(false);
      setError(null);
    }
  });

  const submit = async () => {
    const trimmed = comment().trim();
    if (!trimmed) {
      setError("Please add a brief reason for this report.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await props.onSubmit({
        kind: kind(),
        target: props.showTarget ? target() : "haven_staff",
        comment: trimmed,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit report.");
      setSubmitting(false);
    }
  };

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
        onClick={props.onClose}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
          class="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg border border-border-dialog bg-card p-4 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-start gap-3">
            <h2 class="min-w-0 flex-1 text-base font-semibold text-foreground">
              {props.title}
            </h2>
            <Button
              size="icon"
              variant="ghost"
              class="h-8 w-8"
              aria-label="Close report dialog"
              disabled={submitting()}
              onClick={props.onClose}
            >
              <X size={16} />
            </Button>
          </div>

          <div class="mt-3 min-h-0 overflow-y-auto">
            <Show when={props.subjectPreview || props.subjectLabel}>
              <div class="rounded border border-border bg-surface-panel p-3">
                <Show when={props.subjectLabel}>
                  <p class="text-xs uppercase text-muted-foreground">
                    {props.subjectLabel}
                  </p>
                </Show>
                <Show when={props.subjectPreview}>
                  <p class="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap text-sm text-body-soft">
                    {props.subjectPreview}
                  </p>
                </Show>
              </div>
            </Show>

            <Show when={props.showKind}>
              <p class="mb-2 mt-4 text-xs uppercase text-muted-foreground">
                Type
              </p>
              <div class="grid gap-2">
                <For each={KIND_OPTIONS}>
                  {(option) => (
                    <button
                      type="button"
                      class="rounded border px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
                      classList={{
                        "border-primary bg-surface-panel":
                          kind() === option.value,
                        "border-border-control": kind() !== option.value,
                      }}
                      disabled={submitting()}
                      onClick={() => setKind(option.value)}
                    >
                      {option.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <Show when={props.showTarget}>
              <p class="mb-2 mt-4 text-xs uppercase text-muted-foreground">
                Send to
              </p>
              <div class="grid gap-2">
                <For each={TARGET_OPTIONS}>
                  {(option) => (
                    <button
                      type="button"
                      class="rounded border px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
                      classList={{
                        "border-primary bg-surface-panel":
                          target() === option.value,
                        "border-border-control": target() !== option.value,
                      }}
                      disabled={submitting()}
                      onClick={() => setTarget(option.value)}
                    >
                      {option.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <p class="mb-2 mt-4 text-xs uppercase text-muted-foreground">
              Reason
            </p>
            <textarea
              value={comment()}
              disabled={submitting()}
              rows={3}
              placeholder="Briefly describe the problem…"
              onInput={(e) => setComment(e.currentTarget.value)}
              class="w-full resize-none rounded border border-border-control bg-surface-input px-3 py-2 text-sm text-foreground outline-hidden focus:border-primary"
            />

            <Show when={error()}>
              <p class="mt-2 text-sm text-destructive">{error()}</p>
            </Show>
          </div>

          <div class="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={submitting()}
              onClick={props.onClose}
            >
              Cancel
            </Button>
            <Button disabled={submitting()} onClick={() => void submit()}>
              {submitting() ? "Submitting…" : "Submit report"}
            </Button>
          </div>
        </section>
      </div>
    </Show>
  );
}
