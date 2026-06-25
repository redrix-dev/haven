import { createEffect, createMemo, createSignal } from "solid-js";
import { VList, type VListHandle } from "virtua/solid";
import type { MessageViewItem } from "./messageViewModel";
import { MessageRow, type MessageRowActions } from "./MessageRow";

/**
 * The virtualized chat scroller. Props in (view items), callbacks out — no
 * data access in this folder (the renderer seam, see messageViewModel.ts).
 *
 * Scroll behavior:
 *  - mounts pinned to the bottom (newest message)
 *  - stays pinned while the user is at the bottom; doesn't yank them while
 *    they're reading history
 *  - prepending older pages sets virtua's `shift` so the viewport doesn't jump
 *  - nearing the top fires onReachTop (parent guards hasMore/loading)
 */
export function MessageList(
  props: {
    items: MessageViewItem[];
    onReachTop?: () => void;
  } & MessageRowActions,
) {
  let handle: VListHandle | undefined;
  // Plain mutables, deliberately non-reactive: read inside callbacks/effects
  // only, and re-render must not depend on them.
  let stuckToBottom = true;
  let initialScrolled = false;
  // The list mounts scrolled to the top, then jumps to the bottom — keep it
  // invisible until that first pin lands so channel switches don't flash.
  const [pinned, setPinned] = createSignal(false);

  // Detect prepends (older page landed) by checking whether the previous
  // first item moved deeper into the array — that's when virtua needs shift.
  const d = createMemo(
    (prev: { items: MessageViewItem[]; shift: boolean } | undefined) => {
      const next = props.items;
      let shift = false;
      if (prev && prev.items.length > 0 && next.length > prev.items.length) {
        const prevFirstId = prev.items[0]!.id;
        shift = next.findIndex((item) => item.id === prevFirstId) > 0;
      }
      return { items: next, shift };
    },
  );

  const scrollToEnd = () => {
    const len = d().items.length;
    if (len > 0) handle?.scrollToIndex(len - 1, { align: "end" });
  };

  createEffect(() => {
    const { items, shift } = d();
    if (items.length === 0) return;
    if (!initialScrolled) {
      initialScrolled = true;
      queueMicrotask(() => {
        scrollToEnd();
        requestAnimationFrame(() => setPinned(true));
      });
      return;
    }
    if (!shift && stuckToBottom) {
      queueMicrotask(scrollToEnd);
    }
  });

  const onScroll = (offset: number) => {
    if (!handle) return;
    stuckToBottom = offset + handle.viewportSize >= handle.scrollSize - 48;
    if (initialScrolled && offset < 120) props.onReachTop?.();
  };

  return (
    <VList
      data={d().items}
      shift={d().shift}
      ref={(h) => (handle = h)}
      onScroll={onScroll}
      style={{ height: "100%", opacity: pinned() ? 1 : 0 }}
    >
      {(item) =>
        item.kind === "date-divider" ? (
          <div class="my-2 flex items-center gap-3 px-4 text-xs text-muted-foreground">
            <span class="h-px flex-1 bg-border" />
            {item.label}
            <span class="h-px flex-1 bg-border" />
          </div>
        ) : (
          <MessageRow
            item={item}
            viewerId={props.viewerId}
            canReport={props.canReport}
            onReportMessage={props.onReportMessage}
            onReportUser={props.onReportUser}
          />
        )
      }
    </VList>
  );
}
