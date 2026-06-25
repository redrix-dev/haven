import type { JSX } from "solid-js";
import * as KTooltip from "@kobalte/core/tooltip";

export type TooltipProps = {
  content: JSX.Element;
  placement?: "top" | "bottom" | "left" | "right";
  openDelay?: number;
  children: JSX.Element;
};

/**
 * Hover tooltip. The trigger wraps children in a display:contents element so
 * any child (button, icon, row) works without nesting interactive elements.
 * Keyboard-focus triggering rides on the child's own focusability.
 */
export function Tooltip(props: TooltipProps) {
  return (
    <KTooltip.Root
      placement={props.placement ?? "right"}
      openDelay={props.openDelay ?? 400}
    >
      <KTooltip.Trigger as="span" class="contents">
        {props.children}
      </KTooltip.Trigger>
      <KTooltip.Portal>
        <KTooltip.Content class="z-50 rounded-lg border border-border-dialog bg-popover px-3 py-1.5 text-sm font-medium text-popover-foreground shadow-lg">
          {props.content}
        </KTooltip.Content>
      </KTooltip.Portal>
    </KTooltip.Root>
  );
}
