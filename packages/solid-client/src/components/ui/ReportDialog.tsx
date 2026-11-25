import { For, Show, createEffect, createSignal } from "solid-js";
import { X } from "lucide-solid";
import { Button } from "./Button";

/**
 * Who a report goes to. A report goes to one: the community's moderators,
 * or Haven staff (who also handle anything outside a community).
 */
export type ReportTarget = "community" | "haven";

export type ReportDialogResult = {
  target: ReportTarget;
  /** Empty when the person gave none and none was required. */
  reason: string;
};

const TARGET_OPTIONS: { value: ReportTarget; label: string }[] = [
  { value: "community", label: "Community moderators" },
  { value: "haven", label: "Haven staff" },
];

/**
 * The report dialog for messages and people. Presentational: the caller's
 * `onSubmit` files the report.
 *
 * - `showTarget`: in a community the person picks who it goes to; anywhere
 *   else it goes to Haven staff.
 * - `reasonRequired`: a community can ask for a reason
 *   (`report_reason_required`); the database refuses one without it.
 */
export function ReportDialog(props: {
  open: boolean;
  title: string;
  subjectLabel?: string;
  subjectPreview?: string;
  showTarget: boolean;
  reasonRequired?: boolean;
  onClose: () => void;
  onSubmit: (result: ReportDialogResult) => Promise<void>;
}) {
  const [target, setTarget] = createSignal<ReportTarget>("community");
  const [reason, setReason] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const sendsTo = (): ReportTarget => (props.showTarget ? target() : "haven");
  const needsReason = () =>
    sendsTo() === "community" && props.reasonRequired === true;

  // Reset whenever the dialog closes so the next open starts clean.
  createEffect(() => {
    if (!props.open) {
      setTarget("community");
      setReason("");
      setSubmitting(false);
      setError(null);
    }
  });

  const submit = async () => {
    const trimmed = reason().trim();
    if (!trimmed && needsReason()) {
      setError("This community asks for a reason with every report.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await props.onSubmit({ target: sendsTo(), reason: trimmed });
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
              {needsReason() ? "Reason" : "Reason (optional)"}
            </p>
            <textarea
              value={reason()}
              disabled={submitting()}
              rows={3}
              placeholder="Briefly describe the problem…"
              onInput={(e) => setReason(e.currentTarget.value)}
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
