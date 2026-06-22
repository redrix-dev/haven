import { Show, type JSX } from "solid-js";
import { ArrowUpCircle, Copy, Minus, Square, X } from "lucide-solid";

/**
 * Presentational frameless titlebar (the window has `decorations: false` on
 * Windows/Linux). Purely props-driven — imports nothing from contexts/features,
 * so it stays a `ui` element; the route layer wires it to the bridge + updater.
 *
 * `data-tauri-drag-region` makes the bar (and the non-interactive title area)
 * draggable; the buttons omit it so they stay clickable.
 *
 * On macOS the window keeps native traffic lights (titleBarStyle: Overlay), so
 * we hide our own window buttons and inset the title to clear them.
 */
export type TitlebarProps = {
  version?: string;
  /** When set, a non-critical update is staged — shown as a dismissible pill. */
  updateVersion?: string | null;
  applying?: boolean;
  maximized?: boolean;
  platform?: "macos" | "windows" | "linux";
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  onApplyUpdate: () => void;
  onDismissUpdate: () => void;
};

export function Titlebar(props: TitlebarProps) {
  const isMac = () => props.platform === "macos";

  return (
    <div
      data-tauri-drag-region={true}
      class="flex h-8 shrink-0 select-none items-center justify-between border-b border-border bg-surface-panel"
      classList={{ "pl-3": !isMac(), "pl-[78px]": isMac() }}
    >
      <div
        data-tauri-drag-region={true}
        class="flex items-center gap-2 text-xs text-muted-foreground"
      >
        <span data-tauri-drag-region={true} class="font-medium text-foreground">
          Haven
        </span>
        <Show when={props.version}>
          <span data-tauri-drag-region={true}>v{props.version}</span>
        </Show>
      </div>

      <div class="flex items-center" classList={{ "pr-2": isMac() }}>
        <Show when={props.updateVersion}>
          <div class="mr-2 flex items-center gap-1">
            <button
              type="button"
              disabled={props.applying}
              onClick={() => props.onApplyUpdate()}
              class="flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <ArrowUpCircle size={13} />
              {props.applying
                ? "Updating…"
                : `Update to v${props.updateVersion} • Restart`}
            </button>
            <button
              type="button"
              onClick={() => props.onDismissUpdate()}
              title="Dismiss until next launch"
              class="rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Later
            </button>
          </div>
        </Show>

        <Show when={!isMac()}>
          <div class="flex items-center">
            <WindowButton label="Minimize" onClick={() => props.onMinimize()}>
              <Minus size={15} />
            </WindowButton>
            <WindowButton
              label={props.maximized ? "Restore" : "Maximize"}
              onClick={() => props.onToggleMaximize()}
            >
              <Show when={props.maximized} fallback={<Square size={13} />}>
                <Copy size={13} />
              </Show>
            </WindowButton>
            <WindowButton label="Close" danger onClick={() => props.onClose()}>
              <X size={15} />
            </WindowButton>
          </div>
        </Show>
      </div>
    </div>
  );
}

function WindowButton(props: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={() => props.onClick()}
      class={`flex h-8 w-11 items-center justify-center text-muted-foreground transition-colors ${
        props.danger
          ? "hover:bg-destructive hover:text-primary-foreground"
          : "hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {props.children}
    </button>
  );
}
