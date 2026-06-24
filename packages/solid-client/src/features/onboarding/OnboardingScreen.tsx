import { Show } from "solid-js";
import { Sparkles } from "lucide-solid";
import type { OnboardingCampaign } from "@shared/lib/backend/types";

/**
 * Full-screen onboarding card for a single campaign. Presentational — the gate
 * wires it to the onboarding nexus.
 */
export function OnboardingScreen(props: {
  campaign: OnboardingCampaign;
  completing: boolean;
  error?: string | null;
  onComplete: () => void;
}) {
  return (
    <div class="flex h-full w-full items-center justify-center bg-background p-6">
      <div class="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-xl">
        <Sparkles size={28} class="mx-auto mb-4 text-primary" />
        <h1 class="text-xl font-semibold text-foreground">
          {props.campaign.title}
        </h1>
        <Show when={props.campaign.description}>
          <p class="mt-3 text-sm leading-6 text-muted-foreground">
            {props.campaign.description}
          </p>
        </Show>
        <Show when={props.error}>
          <p class="mt-3 text-sm text-destructive">{props.error}</p>
        </Show>
        <button
          type="button"
          disabled={props.completing}
          onClick={() => props.onComplete()}
          class="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {props.completing ? "Just a moment…" : "Get started"}
        </button>
      </div>
    </div>
  );
}
