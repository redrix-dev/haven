export interface HavenThemePrimitiveTokens {
  "surface-0": string;
  "surface-1": string;
  "surface-2": string;
  "surface-3": string;
  "surface-3b": string;
  "surface-4": string;
  "surface-5": string;
  "surface-destructive-soft": string;
  "surface-destructive-panel": string;
  "border-subtle": string;
  "border-default": string;
  "text-primary": string;
  "text-secondary": string;
  "text-tertiary": string;
  "text-muted": string;
  "text-dim": string;
  "text-success": string;
}

export type HavenThemeTokens = Partial<HavenThemePrimitiveTokens> &
  Record<string, string>;

export type HavenThemeSource = "builtin" | "catalog";

export type HavenThemeStatus = "active" | "preview" | "disabled";

export interface HavenTheme {
  id: string;
  name: string;
  version: number;
  source: HavenThemeSource;
  entitlementKey: string | null;
  status: HavenThemeStatus;
  tokens: HavenThemeTokens;
}

export interface HavenThemeInput {
  id: string;
  name: string;
  tokens: HavenThemeTokens;
  version?: number;
  source?: HavenThemeSource;
  entitlementKey?: string | null;
  status?: HavenThemeStatus;
}

export interface ResolveThemeOptions {
  selectedThemeId: string | null | undefined;
  allowedEntitlements?: Iterable<string>;
  fallbackThemeId?: string;
}

export type HavenThemeRegistry = Record<string, HavenTheme>;
