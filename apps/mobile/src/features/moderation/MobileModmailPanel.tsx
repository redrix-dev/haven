import { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useHavenCore } from "@mobile-data";
import {
  useDetail,
  useIsLoadingDetail,
  useIsLoadingReports,
  useReports,
  useSelectedReportId,
} from "@mobile-data/hooks";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

type MobileModmailPanelProps = {
  /** Communities where `canManageReports` is true */
  managedCommunityIds: string[];
};

export function MobileModmailPanel({
  managedCommunityIds,
}: MobileModmailPanelProps) {
  const core = useHavenCore();
  const reports = useReports(core.moderation);
  const detail = useDetail(core.moderation);
  const selectedReportId = useSelectedReportId(core.moderation);
  const loading = useIsLoadingReports(core.moderation);
  const loadingDetail = useIsLoadingDetail(core.moderation);

  useEffect(() => {
    if (managedCommunityIds.length === 0) return;
    void core.moderation.load(managedCommunityIds);
  }, [core, managedCommunityIds]);

  const openDetail = (id: string) => {
    void core.moderation.selectReport(id).catch((e) => {
      Alert.alert("Error", getErrorMessage(e, "Could not load report."));
    });
  };

  const closeDetail = () => {
    core.moderation.clearSelection();
  };

  const handleEscalate = () => {
    if (!detail) return;
    void core.moderation
      .escalate(detail.reportId)
      .then(() => {
        Alert.alert("Escalated", "Report escalated to Haven.");
        closeDetail();
      })
      .catch((e) =>
        Alert.alert("Error", getErrorMessage(e, "Escalate failed.")),
      );
  };

  if (managedCommunityIds.length === 0) {
    return (
      <Text className="py-6 text-center text-sm text-muted-foreground">
        ModMail is available when you can manage reports in a community.
      </Text>
    );
  }

  return (
    // uniwind-theme-allow mobile-theme/no-raw-palette-class - intentional ModMail amber brand palette, invariant across themes
    <View className="min-h-0 flex-1 rounded-xl border border-amber-700/40 bg-amber-950/25 p-3">
      {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - ModMail amber brand text */}
      <Text className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-200">
        Moderation inbox
      </Text>
      {loading ? (
        // uniwind-theme-allow mobile-theme/no-raw-color-prop - ActivityIndicator requires raw color; amber matches ModMail brand
        <ActivityIndicator color="#fbbf24" />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r.reportId}
          renderItem={({ item }) => (
            // uniwind-theme-allow mobile-theme/no-raw-palette-class - ModMail amber brand palette
            <Pressable
              className="mb-2 rounded-xl border border-amber-700/50 bg-amber-950/40 px-3 py-3 active:opacity-90"
              onPress={() => openDetail(item.reportId)}
            >
              {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - ModMail amber brand text */}
              <Text className="text-xs uppercase text-amber-200/80">
                {item.serverName}
              </Text>
              <Text className="mt-1 font-medium text-foreground">
                {item.title}
              </Text>
              <Text className="mt-1 text-[11px] text-muted-foreground">
                {item.status} · {new Date(item.createdAt).toLocaleString()}
              </Text>
            </Pressable>
          )}
          refreshing={loading}
          onRefresh={() => void core.moderation.load(managedCommunityIds)}
          ListEmptyComponent={
            <Text className="py-6 text-center text-sm text-muted-foreground">
              No open reports.
            </Text>
          }
        />
      )}

      <Modal
        visible={Boolean(selectedReportId)}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View className="flex-1 bg-card px-4 pt-14">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-foreground">
              Report
            </Text>
            <Pressable onPress={closeDetail}>
              <Text className="text-lg text-muted-foreground">Close</Text>
            </Pressable>
          </View>
          {loadingDetail ? (
            // uniwind-theme-allow mobile-theme/no-raw-color-prop - ActivityIndicator requires raw color; resolves to --foreground
            <ActivityIndicator color="#e6edf7" />
          ) : detail ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text className="text-sm text-muted-foreground">
                {detail.serverName}
              </Text>
              <Text className="mt-2 text-base font-semibold text-foreground">
                {detail.title}
              </Text>
              <Text className="mt-2 text-xs text-muted-foreground">
                Status: {detail.status}
              </Text>
              {detail.targetDisplayName ? (
                <Text className="mt-2 text-sm text-foreground">
                  Target: {detail.targetDisplayName}
                </Text>
              ) : null}
              {detail.platformAction ? (
                // uniwind-theme-allow mobile-theme/no-raw-palette-class - Haven platform action badge; intentional purple brand palette
                <View className="mt-4 rounded-xl border border-purple-500/50 bg-purple-900/20 p-3">
                  {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - Haven platform purple brand text */}
                  <Text className="text-sm font-semibold text-purple-300">
                    Haven Platform Moderation has acted on this report
                  </Text>
                  {detail.platformAction.user_banned === true && (
                    <Text className="mt-1 text-sm text-foreground">
                      ✓ User platform banned
                    </Text>
                  )}
                  {detail.platformAction.content_removed === true && (
                    <Text className="mt-1 text-sm text-foreground">
                      ✓ Content removed
                    </Text>
                  )}
                  {detail.status === "resolved_by_platform" && (
                    // uniwind-theme-allow mobile-theme/no-raw-palette-class - acknowledge action green; intentional positive-action indicator
                    <Pressable
                      className="mt-3 rounded-xl bg-green-700 py-2"
                      onPress={() => {
                        void core.moderation
                          .acknowledge(detail.reportId)
                          .then(() => {
                            Alert.alert("Acknowledged", "Report closed.");
                            closeDetail();
                          })
                          .catch((e) =>
                            Alert.alert(
                              "Error",
                              getErrorMessage(e, "Acknowledge failed."),
                            ),
                          );
                      }}
                    >
                      <Text className="text-center font-semibold text-primary-foreground">
                        Acknowledge & Close
                      </Text>
                    </Pressable>
                  )}
                </View>
              ) : null}
              {detail.status !== "escalated" &&
                detail.destination === "server_admins" &&
                !detail.platformAction && (
                  <Pressable
                    className="mt-6 rounded-xl bg-primary py-3"
                    onPress={handleEscalate}
                  >
                    <Text className="text-center font-semibold text-primary-foreground">
                      Escalate to Haven
                    </Text>
                  </Pressable>
                )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
