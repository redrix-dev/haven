import { Show } from "solid-js";
import * as KImage from "@kobalte/core/image";
import { cn } from "./cn";

export type AvatarSize = "sm" | "md" | "lg";

const sizeClasses: Record<AvatarSize, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

export type AvatarProps = {
  src?: string | null;
  /** Display name — used for alt text and the fallback initials. */
  name: string;
  size?: AvatarSize;
  class?: string;
};

export function Avatar(props: AvatarProps) {
  const initials = () => props.name.trim().slice(0, 2).toUpperCase() || "?";
  return (
    <KImage.Root
      fallbackDelay={150}
      class={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-secondary",
        sizeClasses[props.size ?? "md"],
        props.class,
      )}
    >
      <Show when={props.src}>
        {(src) => (
          <KImage.Img
            src={src()}
            alt={props.name}
            class="h-full w-full object-cover"
          />
        )}
      </Show>
      <KImage.Fallback class="font-semibold text-avatar-fallback">
        {initials()}
      </KImage.Fallback>
    </KImage.Root>
  );
}
