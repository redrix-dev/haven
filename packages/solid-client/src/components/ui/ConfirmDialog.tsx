import { Show, createSignal } from "solid-js";

/**
 * Presentational confirm dialog with an optional reason field. Props-only (a
 * `ui` element). The body is remounted via `<Show>` each time it opens, so the
 * reason input resets without the caller having to manage it.
 */
export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  /** When set, shows a reason field and passes its value to onConfirm. */
  reason?: { label: string; placeholder?: string; required?: boolean };
  pending?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <Show when={props.open}>
      <DialogBody {...props} />
    </Show>
  );
}

function DialogBody(props: ConfirmDialogProps) {
  const [reason, setReason] = createSignal("");
  const canConfirm = () =>
    !props.pending && (!props.reason?.required || reason().trim().length > 0);

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={() => props.onCancel()}
    >
      <div
        class="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 class="text-base font-semibold text-foreground">{props.title}</h2>
        <Show when={props.description}>
          <p class="mt-2 text-sm text-muted-foreground">{props.description}</p>
        </Show>

        <Show when={props.reason} keyed>
          {(cfg) => (
            <div class="mt-3">
              <label class="mb-1 block text-xs font-medium text-muted-foreground">
                {cfg.label}
              </label>
              <textarea
                rows={3}
                value={reason()}
                placeholder={cfg.placeholder}
                onInput={(event) => setReason(event.currentTarget.value)}
                class="w-full resize-none rounded border border-input bg-surface-input px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          )}
        </Show>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={props.pending}
            onClick={() => props.onCancel()}
            class="rounded px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm()}
            onClick={() => props.onConfirm(reason().trim())}
            class="rounded px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            classList={{
              "bg-destructive": props.danger === true,
              "bg-primary": props.danger !== true,
            }}
          >
            {props.pending ? "Working…" : props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
