import {
  createContext,
  createEffect,
  createSignal,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { getTheme } from "@shared/themes/registry";
import { listSelectableBuiltinThemes } from "@shared/themes/selectableBuiltinThemes";
import { featureFlagsToEntitlementKeys } from "@shared/themes/themeEntitlements";
import { resolveSemanticEntries } from "@shared/themes/semantics";
import type { HavenTheme } from "@shared/themes/types";
import { requireHavenSolidCore } from "../core";

/**
 * Owns the theme lifecycle end to end:
 *   boot     read localStorage → apply before first paint
 *   sign-in  viewer profile's `theme` wins (same as mobile hydration)
 *   select   optimistic apply + localStorage, persist to profile, revert on failure
 *
 * Applying a theme writes BOTH the primitive tokens and the resolved semantic
 * tokens (via resolveSemanticEntries) as inline CSS vars — the generated
 * Tailwind bridge maps utilities to the semantic vars, so skipping them means
 * semantic utilities silently keep default-theme colors.
 */

const THEME_STORAGE_KEY = "haven.solid.themePreference.v1";

function readStoredThemeId(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredThemeId(id: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Storage unavailable (private mode etc.) — theme still applies for the session.
  }
}

// Tokens set by the previous theme are cleared before the next applies, so a
// theme that doesn't override a token falls back to the globals.css defaults
// instead of inheriting the previous theme's value.
let appliedTokenKeys: string[] = [];

/**
 * Apply the locally stored theme without any session machinery — the boot
 * path for lite shells (popout windows) that mount no SessionProvider.
 * The full ThemeProvider (profile hydration, selection persistence) is for
 * the main app branch only.
 */
export function applyStoredThemeToDocument(): void {
  applyDocumentTheme(getTheme(readStoredThemeId() ?? "default"));
}

// The few colors index.html needs BEFORE any JS loads (window background,
// splash text). Written on every theme apply; an inline script in index.html
// reads it pre-paint so a themed user never sees default-theme boot colors.
const BOOT_PALETTE_KEY = "haven.solid.bootPalette.v1";

function writeBootPalette(entries: Record<string, string>): void {
  try {
    localStorage.setItem(
      BOOT_PALETTE_KEY,
      JSON.stringify({
        background: entries["surface-0"] ?? "#0d1626",
        text: entries["text-primary"] ?? "#e6edf7",
        muted: entries["text-dim"] ?? "#8898b1",
      }),
    );
  } catch {
    // Storage unavailable — boot falls back to the defaults baked into index.html.
  }
}

function applyDocumentTheme(theme: HavenTheme): void {
  const root = document.documentElement;
  for (const key of appliedTokenKeys) {
    root.style.removeProperty(`--${key}`);
  }
  const entries = {
    ...theme.tokens,
    ...resolveSemanticEntries(theme.tokens),
  };
  appliedTokenKeys = Object.keys(entries);
  for (const [key, value] of Object.entries(entries)) {
    root.style.setProperty(`--${key}`, value);
  }
  writeBootPalette(entries);
}

type ThemeContextValue = {
  themeId: Accessor<string>;
  /** Themes the viewer can pick from. (Entitlement-gated themes arrive with entitlements.) */
  selectableThemes: () => HavenTheme[];
  setThemeId: (id: string) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue>();

export function ThemeProvider(props: { children: JSX.Element }) {
  const core = requireHavenSolidCore();
  const account = core.stores.account;

  const [themeId, setThemeIdSignal] = createSignal(
    getTheme(readStoredThemeId() ?? "default").id,
  );
  applyDocumentTheme(getTheme(themeId()));

  // The account's theme wins once it is known: from the device copy at
  // sign-in, then from the database. Tracks only the setting.
  createEffect(() => {
    const saved = account.settings?.theme;
    if (!saved) return;
    const id = getTheme(saved).id;
    if (id !== themeId()) {
      setThemeIdSignal(id);
      writeStoredThemeId(id);
      applyDocumentTheme(getTheme(id));
    }
  });

  /** Shows at once; put back if the database refuses. */
  const setThemeId = async (id: string) => {
    const previousId = themeId();
    const nextId = getTheme(id).id;
    if (nextId === previousId) return;

    setThemeIdSignal(nextId);
    writeStoredThemeId(nextId);
    applyDocumentTheme(getTheme(nextId));
    if (!core.userId) return; // Signed out: this device only.

    try {
      await core.account.updateSettings({ theme: nextId });
    } catch (error) {
      setThemeIdSignal(previousId);
      writeStoredThemeId(previousId);
      applyDocumentTheme(getTheme(previousId));
      throw error;
    }
  };

  const value: ThemeContextValue = {
    themeId,
    selectableThemes: () =>
      listSelectableBuiltinThemes(
        new Set(featureFlagsToEntitlementKeys(account.feature_flags)),
      ),
    setThemeId,
  };

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
