import { Show, type JSX } from "solid-js";
import { X } from "lucide-solid";

export type SidePanelProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: JSX.Element;
  /** Optional tab strip rendered below the title row. */
  tabs?: JSX.Element;
};

/**
 * Full-height slide-over panel anchored to the right edge of the viewport.
 * Used for community/channel settings surfaces (Electron-era pattern).
 */
export function SidePanel(props: SidePanelProps) {
  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-40 flex justify-end bg-background/60 backdrop-blur-[1px]"
        onClick={() => props.onClose()}
      >
        <div
          class="flex h-full w-full max-w-3xl flex-col border-l border-border bg-surface-app shadow-2xl"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
        >
          <header class="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
            <h2 class="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
              {props.title}
            </h2>
            <button
              type="button"
              title="Close"
              onClick={() => props.onClose()}
              class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <X size={18} />
            </button>
          </header>
          <Show when={props.tabs}>
            <div class="shrink-0 border-b border-border px-4">{props.tabs}</div>
          </Show>
          <div class="min-h-0 flex-1 overflow-hidden">{props.children}</div>
        </div>
      </div>
    </Show>
  );
}
