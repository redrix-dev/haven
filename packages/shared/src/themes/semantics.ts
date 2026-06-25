import type { HavenThemeTokens } from "./types";

export const semanticToPrimitive = {
  background: "surface-1",
  foreground: "text-primary",
  card: "surface-3",
  "card-foreground": "text-primary",
  popover: "surface-3",
  "popover-foreground": "text-primary",
  primary: "primary",
  "primary-foreground": "primary-foreground",
  "primary-hover": "primary-hover",
  secondary: "surface-4",
  "secondary-foreground": "text-primary",
  muted: "surface-3b",
  "muted-foreground": "text-muted",
  accent: "border-subtle",
  "accent-foreground": "text-primary",
  destructive: "destructive",
  "destructive-hover": "destructive-hover",
  "destructive-foreground": "destructive-foreground",
  border: "border-default",
  input: "border-default",
  ring: "ring",
  "ring-focus": "ring-focus",
  link: "primary",
  "link-hover": "primary",
  "surface-app": "surface-1",
  "surface-modal": "surface-3b",
  "surface-input": "surface-5",
  "surface-legal": "surface-3",
  "surface-desktop-shell": "surface-0",
  "surface-toast": "surface-3",
  "surface-info": "surface-4",
  "surface-panel": "surface-2",
  "surface-hover": "surface-4",
  "surface-inset": "surface-0",
  "surface-embedded": "surface-0",
  "surface-card-deep": "surface-3",
  "surface-peek": "surface-1",
  "surface-skeleton": "surface-3",
  "surface-voice-scrim": "surface-0",
  "surface-message-row": "surface-3",
  "surface-message-row-hover": "surface-4",
  "surface-list-hover": "surface-3b",
  "surface-dm-row-hover": "surface-4",
  "surface-role-hover": "surface-3b",
  "surface-row-selected": "surface-3",
  "surface-footer-bar": "surface-3",
  "surface-embed-hover": "surface-3b",
  "surface-attachment-hover": "surface-3b",
  "surface-embed-chip": "surface-4",
  "surface-row-active": "surface-3",
  "body-soft": "text-secondary",
  info: "text-info",
  "destructive-soft": "text-destructive-soft",
  "destructive-surface": "surface-destructive-soft",
  "border-row": "surface-3b",
  "border-titlebar": "surface-3b",
  "border-dialog": "surface-4",
  "border-inset-panel": "border-subtle",
  "border-modmail": "border-subtle",
  "border-panel": "surface-5",
  "border-control": "border-default",
  "border-selected": "primary",
  "border-message-row": "border-subtle",
  "border-message-row-hover": "border-default",
  "border-reply-thread": "border-default",
  "border-notification": "primary",
  sidebar: "surface-1",
  "sidebar-foreground": "text-primary",
  "sidebar-primary": "primary",
  "sidebar-primary-foreground": "primary-foreground",
  "sidebar-accent": "surface-4",
  "sidebar-accent-foreground": "text-primary",
  "sidebar-border": "border-default",
  "sidebar-ring": "ring",
  "scrollbar-track": "surface-2",
  "scrollbar-thumb": "border-default",
  "scrollbar-thumb-hover": "primary",
  "gradient-voice-0": "surface-0",
  "gradient-voice-1": "surface-1",
  "destructive-banner": "text-destructive-banner",
  "avatar-fallback": "text-avatar-fallback",
  "link-bright": "text-link-bright",
  "link-soft": "text-link-soft",
  "attachment-label": "text-attachment-label",
  "form-label": "text-form-label",
  "chip-muted": "text-chip-muted",
  "notification-link": "text-notification-link",
  "notification-soft": "text-notification-soft",
  "send-error": "text-send-error",
  "hub-warm": "text-hub-warm",
  "embed-chip": "text-embed-chip",
  "status-online": "status-online",
  "status-away": "status-away",
  "status-dnd": "status-dnd",
  "discord-blurple": "discord-blurple",
  "accent-amber": "accent-amber",
  "accent-slider": "accent-slider",
  "accent-success": "accent-success",
} as const satisfies Record<string, string>;

export type SemanticTokenName = keyof typeof semanticToPrimitive;

export function resolveSemanticToken(
  tokens: HavenThemeTokens,
  semanticToken: SemanticTokenName,
): string | undefined {
  const primitive = semanticToPrimitive[semanticToken];
  return tokens[primitive];
}

export function createThemeProxy(tokens: HavenThemeTokens): HavenThemeTokens {
  return new Proxy(tokens, {
    get(target, prop, receiver) {
      if (typeof prop !== "string") {
        return Reflect.get(target, prop, receiver);
      }
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      const primitive = semanticToPrimitive[prop as SemanticTokenName];
      if (!primitive) {
        return undefined;
      }
      return target[primitive];
    },
    has(target, prop) {
      if (typeof prop !== "string") {
        return Reflect.has(target, prop);
      }
      return prop in target || prop in semanticToPrimitive;
    },
  });
}

export function resolveSemanticEntries(
  tokens: HavenThemeTokens,
): Record<string, string> {
  const proxy = createThemeProxy(tokens);
  const entries: Record<string, string> = {};
  for (const semantic of Object.keys(
    semanticToPrimitive,
  ) as SemanticTokenName[]) {
    const value = proxy[semantic];
    if (typeof value === "string" && value.length > 0) {
      entries[semantic] = value;
    }
  }
  return entries;
}
