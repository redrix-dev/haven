import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useHavenCore, useStore } from "@mobile-data";
import {
  decisionActionsLabel,
  reportAudienceLabel,
  reportStatusLabel,
} from "@shared/collections/reports/selectors";

const day = (iso: string) => new Date(iso).toLocaleDateString();

/**
 * What the person reported and where each report stands, and any staff
 * decision in force about their account (REPORTING.md, "Who sees what").
 * Loads when shown; a report's outcome notice loads it again (HavenCore).
 */
export default function YourReportsCard() {
  const core = useHavenCore();
  const mine = useStore("reports", (s) => s.mine);
  const decisions = useStore("reports", (s) => s.decisionsAboutMe);

  useEffect(() => {
    void core.reports.loadMine().catch(() => {});
  }, [core]);

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <Text className="text-base font-semibold text-foreground">
        Your reports
      </Text>

      {mine === null ? (
        <ActivityIndicator />
      ) : mine.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          You haven't reported anything.
        </Text>
      ) : (
        mine.map((report) => (
          <View
            key={report.id}
            className="flex-row items-center justify-between gap-3"
          >
            <View className="flex-1">
              <Text className="text-sm text-foreground">
                To {reportAudienceLabel(report).toLowerCase()}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {day(report.created_at)}
              </Text>
            </View>
            <Text className="text-sm font-medium text-foreground">
              {reportStatusLabel(report)}
            </Text>
          </View>
        ))
      )}

      {decisions && decisions.length > 0 ? (
        <View className="gap-3 border-t border-border-panel pt-3">
          <Text className="text-base font-semibold text-foreground">
            Decisions about your account
          </Text>
          {decisions.map((decision) => (
            <View key={decision.case_id} className="gap-0.5">
              <Text className="text-sm font-medium text-foreground">
                {decisionActionsLabel(decision)}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {day(decision.decided_at)}
                {decision.restricted_until
                  ? ` · until ${day(decision.restricted_until)}`
                  : ""}
              </Text>
              <Text className="text-sm text-foreground">
                Rule: {decision.rule}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {decision.reason}
              </Text>
            </View>
          ))}
          <Text className="text-xs text-muted-foreground">
            If you think a decision is a mistake, reply to the email Haven sent
            you about it.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
