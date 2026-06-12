import { splitProps, type JSX, type ValidComponent } from "solid-js";
import * as KButton from "@kobalte/core/button";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "bg-secondary text-secondary-foreground hover:bg-surface-hover",
  ghost: "text-body-soft hover:bg-surface-hover hover:text-foreground",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  icon: "h-9 w-9",
};

export type ButtonProps<T extends ValidComponent = "button"> =
  PolymorphicProps<T, KButton.ButtonRootProps<T>> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    class?: string;
    children?: JSX.Element;
  };

export function Button<T extends ValidComponent = "button">(
  props: ButtonProps<T>,
) {
  const [local, rest] = splitProps(props as ButtonProps, [
    "variant",
    "size",
    "class",
  ]);
  return (
    <KButton.Root
      class={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[local.variant ?? "primary"],
        sizeClasses[local.size ?? "md"],
        local.class,
      )}
      {...rest}
    />
  );
}
