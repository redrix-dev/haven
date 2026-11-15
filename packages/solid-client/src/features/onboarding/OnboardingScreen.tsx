import { Show } from "solid-js";
import { ScrollText, Sparkles } from "lucide-solid";
import type { OnboardingCampaign } from "@shared/lib/backend/records";
import {
  HAVEN_PRIVACY_URL,
  HAVEN_TERMS_URL,
} from "@shared/infrastructure/platform/urls";

const card =
  "w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-xl";
const primary =
  "mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60";

/**
 * One introduction, full screen. Presentational: the account gate in
 * routes/ wires it to the core. An introduction that is not required can be
 * skipped; skipping is an answer too, and it is not offered again.
 */
export function OnboardingScreen(props: {
  campaign: OnboardingCampaign;
  busy: boolean;
  error?: string | null;
  onComplete: () => void;
  onSkip: () => void;
}) {
  return (
    <div class="flex h-full w-full items-center justify-center bg-background p-6">
      <div class={card}>
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
          disabled={props.busy}
          onClick={() => props.onComplete()}
          class={primary}
        >
          {props.busy ? "Just a moment…" : "Get started"}
        </button>
        <Show when={!props.campaign.required}>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onSkip()}
            class="mt-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            Not now
          </button>
        </Show>
      </div>
    </div>
  );
}

/** The newest terms, until the person accepts them. Haven cannot be used before. */
export function TermsScreen(props: {
  version: string;
  busy: boolean;
  error?: string | null;
  onAccept: () => void;
}) {
  return (
    <div class="flex h-full w-full items-center justify-center bg-background p-6">
      <div class={card}>
        <ScrollText size={28} class="mx-auto mb-4 text-primary" />
        <h1 class="text-xl font-semibold text-foreground">
          Haven's terms have changed
        </h1>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          Please read the{" "}
          <a
            href={HAVEN_TERMS_URL}
            target="_blank"
            rel="noreferrer"
            class="text-primary underline"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href={HAVEN_PRIVACY_URL}
            target="_blank"
            rel="noreferrer"
            class="text-primary underline"
          >
            Privacy Policy
          </a>{" "}
          (version {props.version}) before carrying on.
        </p>
        <Show when={props.error}>
          <p class="mt-3 text-sm text-destructive">{props.error}</p>
        </Show>
        <button
          type="button"
          disabled={props.busy}
          onClick={() => props.onAccept()}
          class={primary}
        >
          {props.busy ? "Just a moment…" : "I agree"}
        </button>
      </div>
    </div>
  );
}
