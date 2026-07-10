import { For, Show, type Component, type JSX } from "solid-js";
import { MoreHorizontal } from "lucide-solid";
import * as KContextMenu from "@kobalte/core/context-menu";
import * as KDropdownMenu from "@kobalte/core/dropdown-menu";
import { cn } from "./cn";

export type ActionMenuItem = {
  label: string;
  /** A lucide-solid icon component (optional). */
  icon?: Component<{ size?: number }>;
  danger?: boolean;
  onSelect: () => void;
};

/**
 * A row/element action menu opened three ways — right-click and long-press
 * (kobalte ContextMenu, native on pointer/touch) and a hover "…" button
 * (kobalte DropdownMenu) for discoverability + keyboard. Both menus render the
 * same `items`, so callers declare actions once.
 *
 * Presentational only: each item's `onSelect` is the caller's handler. Lives in
 * components/ui so any feature can use it without crossing feature boundaries.
 */
const CONTENT_CLASS =
  "z-50 min-w-44 overflow-hidden rounded-lg border border-border-dialog bg-popover p-1 text-popover-foreground shadow-lg outline-none";

function itemClass(danger?: boolean): string {
  return cn(
    "flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm outline-none transition-colors",
    danger
      ? "text-destructive data-[highlighted]:bg-destructive data-[highlighted]:text-primary-foreground"
      : "text-foreground data-[highlighted]:bg-surface-hover",
  );
}

function itemBody(item: ActionMenuItem): JSX.Element {
  return (
    <>
      {item.icon ? item.icon({ size: 15 }) : null}
      {item.label}
    </>
  );
}

export function ActionsMenu(props: {
  items: ActionMenuItem[];
  children: JSX.Element;
  /** aria-label for the hover "…" button. */
  label?: string;
  /** Render plain children with no menu when there's nothing to show. */
  enabled?: boolean;
  /**
   * Show the hover "…" button (default true). Turn off where the row already
   * has its own hover affordances — right-click + long-press still work.
   */
  hoverButton?: boolean;
}) {
  const enabled = () => props.enabled !== false && props.items.length > 0;

  return (
    <Show when={enabled()} fallback={props.children}>
      <KContextMenu.Root>
        <KContextMenu.Trigger as="div" class="group relative">
          {props.children}
          <Show when={props.hoverButton !== false}>
            <KDropdownMenu.Root>
              <KDropdownMenu.Trigger
                aria-label={props.label ?? "Actions"}
                class="absolute right-2 top-1 flex h-6 w-6 items-center justify-center rounded bg-surface-panel text-muted-foreground opacity-0 shadow transition-opacity hover:bg-surface-hover hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[expanded]:opacity-100"
              >
                <MoreHorizontal size={16} />
              </KDropdownMenu.Trigger>
              <KDropdownMenu.Portal>
                <KDropdownMenu.Content class={CONTENT_CLASS}>
                  <For each={props.items}>
                    {(item) => (
                      <KDropdownMenu.Item
                        class={itemClass(item.danger)}
                        onSelect={() => item.onSelect()}
                      >
                        {itemBody(item)}
                      </KDropdownMenu.Item>
                    )}
                  </For>
                </KDropdownMenu.Content>
              </KDropdownMenu.Portal>
            </KDropdownMenu.Root>
          </Show>
        </KContextMenu.Trigger>
        <KContextMenu.Portal>
          <KContextMenu.Content class={CONTENT_CLASS}>
            <For each={props.items}>
              {(item) => (
                <KContextMenu.Item
                  class={itemClass(item.danger)}
                  onSelect={() => item.onSelect()}
                >
                  {itemBody(item)}
                </KContextMenu.Item>
              )}
            </For>
          </KContextMenu.Content>
        </KContextMenu.Portal>
      </KContextMenu.Root>
    </Show>
  );
}
