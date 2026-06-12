import { For, Show, createSignal } from "solid-js";
import type { HavenTheme } from "@shared/themes/types";
import { useTheme } from "@solid-client/contexts/ThemeProvider";

/**
 * The appearance settings surface: pick a theme, see it applied instantly,
 * persisted to the profile (so mobile follows) by ThemeProvider.
 */
export function AppearanceSettings() {
  const { themeId, selectableThemes, setThemeId } = useTheme();
  const [error, setError] = createSignal<string | null>(null);

  const select = async (theme: HavenTheme) => {
    setError(null);
    try {
      await setThemeId(theme.id);
    } catch {
      setError("Couldn't save your theme — it has been reverted.");
    }
  };

  return (
    <div class="h-full overflow-y-auto px-8 py-6">
      <h1 class="mb-1 text-xl font-bold text-foreground">Appearance</h1>
      <p class="mb-6 text-sm text-muted-foreground">
        Themes apply everywhere and sync to your profile.
      </p>

      <Show when={error()}>
        <p class="mb-4 text-sm text-destructive">{error()}</p>
      </Show>

      <div class="flex flex-wrap gap-3">
        <For each={selectableThemes()}>
          {(theme) => (
            <button
              onClick={() => void select(theme)}
              class="flex w-44 flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary"
              classList={{
                "border-border-selected ring-2 ring-ring":
                  themeId() === theme.id,
              }}
            >
              <span class="text-sm font-semibold text-foreground">
                {theme.name}
              </span>
              <span class="flex gap-1.5">
                <Swatch color={theme.tokens["surface-1"]} />
                <Swatch color={theme.tokens["surface-4"]} />
                <Swatch color={theme.tokens["primary"]} />
                <Swatch color={theme.tokens["text-primary"]} />
              </span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

function Swatch(props: { color?: string }) {
  return (
    <span
      class="h-5 w-5 rounded-full border border-border"
      style={{ background: props.color ?? "transparent" }}
    />
  );
}
