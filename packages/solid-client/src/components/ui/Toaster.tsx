import { For, Show } from "solid-js";
import { Bell, X } from "lucide-solid";

/**
 * Presentational toast stack — props-only, so it stays a `ui` element. The route
 * layer feeds it the live list + a dismiss handler from the ToastProvider.
 */
export type ToasterToast = {
  id: number;
  title: string;
  body?: string;
};

export function Toaster(props: {
  toasts: ToasterToast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      <For each={props.toasts}>
        {(toast) => (
          <div class="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-lg">
            <Bell size={16} class="mt-0.5 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-foreground">
                {toast.title}
              </p>
              <Show when={toast.body}>
                <p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {toast.body}
                </p>
              </Show>
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => props.onDismiss(toast.id)}
              class="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
