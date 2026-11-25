import { A } from "@solidjs/router";
import { For, Show, onMount } from "solid-js";
import { ArrowLeft, Flag } from "lucide-solid";
import {
  decisionActionsLabel,
  reportAudienceLabel,
  reportStatusLabel,
} from "@shared/collections/reports/selectors";
import { requireHavenSolidCore } from "@solid-client/core";

const day = (iso: string) => new Date(iso).toLocaleDateString();

/**
 * What the person reported and where each report stands, and any staff
 * decision in force about their account (REPORTING.md, "Who sees what").
 * Loads when opened; a report's outcome notice loads it again (HavenCore).
 */
export function ReportsSettings() {
  const core = requireHavenSolidCore();
  const mine = () => core.stores.reports.mine;
  const decisions = () => core.stores.reports.decisionsAboutMe ?? [];

  // onMount tracks nothing, so the load cannot retrigger it.
  onMount(() => void core.reports.loadMine().catch(() => {}));

  return (
    <div class="h-full overflow-y-auto bg-surface-app px-8 py-6">
      <div class="mx-auto max-w-3xl">
        <A
          href="/settings/appearance"
          class="mb-5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={13} />
          Appearance
        </A>
        <div class="flex items-center gap-2">
          <Flag size={20} class="text-primary" />
          <h1 class="text-xl font-bold text-foreground">Your reports</h1>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">
          What you reported and where each report stands.
        </p>

        <div class="mt-8 overflow-hidden rounded-xl border border-border bg-card">
          <Show
            when={mine()}
            fallback={
              <p class="px-4 py-4 text-sm text-muted-foreground">Loading…</p>
            }
          >
            {(reports) => (
              <Show
                when={reports().length > 0}
                fallback={
                  <p class="px-4 py-4 text-sm text-muted-foreground">
                    You haven't reported anything.
                  </p>
                }
              >
                <For each={reports()}>
                  {(report) => (
                    <div class="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0">
                      <div>
                        <p class="text-sm text-foreground">
                          To {reportAudienceLabel(report).toLowerCase()}
                        </p>
                        <p class="mt-0.5 text-xs text-muted-foreground">
                          {day(report.created_at)}
                        </p>
                      </div>
                      <span class="text-sm font-medium text-foreground">
                        {reportStatusLabel(report)}
                      </span>
                    </div>
                  )}
                </For>
              </Show>
            )}
          </Show>
        </div>

        <Show when={decisions().length > 0}>
          <h2 class="mb-1 mt-10 text-lg font-bold text-foreground">
            Decisions about your account
          </h2>
          <p class="mb-4 text-sm text-muted-foreground">
            If you think a decision is a mistake, reply to the email Haven sent
            you about it.
          </p>
          <div class="overflow-hidden rounded-xl border border-border bg-card">
            <For each={decisions()}>
              {(decision) => (
                <div class="border-b border-border px-4 py-3 last:border-b-0">
                  <p class="text-sm font-medium text-foreground">
                    {decisionActionsLabel(decision)}
                  </p>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    {day(decision.decided_at)}
                    {decision.restricted_until
                      ? ` · until ${day(decision.restricted_until)}`
                      : ""}
                  </p>
                  <p class="mt-2 text-sm text-foreground">
                    Rule: {decision.rule}
                  </p>
                  <p class="text-sm text-muted-foreground">{decision.reason}</p>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
