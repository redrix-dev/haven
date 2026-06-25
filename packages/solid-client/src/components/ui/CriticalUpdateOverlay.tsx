import { Show } from "solid-js";
import { TriangleAlert } from "lucide-solid";

/**
 * Blocking overlay for a forced (critical) update — presentational, props-only.
 * Unlike the dismissible titlebar pill, this gates the app and explains why the
 * restart is required, rather than silently taking over.
 */
export type CriticalUpdateOverlayProps = {
  version: string;
  notes?: string;
  applying?: boolean;
  onApply: () => void;
};

export function CriticalUpdateOverlay(props: CriticalUpdateOverlayProps) {
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div class="mx-4 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <div class="flex items-center gap-3">
          <TriangleAlert class="text-destructive" size={22} />
          <h2 class="text-lg font-semibold text-foreground">Required update</h2>
        </div>
        <p class="mt-3 text-sm text-muted-foreground">
          A required update to{" "}
          <span class="font-medium text-foreground">v{props.version}</span> is
          ready. This release is marked critical — usually a security or
          compatibility fix — so Haven needs to restart to apply it before you
          continue.
        </p>
        <Show when={props.notes}>
          <p class="mt-3 whitespace-pre-wrap rounded bg-surface-inset p-3 text-xs text-muted-foreground">
            {props.notes}
          </p>
        </Show>
        <button
          type="button"
          disabled={props.applying}
          onClick={() => props.onApply()}
          class="mt-5 w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {props.applying ? "Updating…" : "Restart & update now"}
        </button>
      </div>
    </div>
  );
}
