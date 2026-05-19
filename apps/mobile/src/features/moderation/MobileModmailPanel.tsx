import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { ServerReportDetail, ServerReportSummary } from "@shared/lib/backend/types";
import { getServerModmailBackend } from "@shared/lib/backend";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

type MobileModmailPanelProps = {
  /** Communities where `canManageReports` is true */
  managedCommunityIds: string[];
};

export function MobileModmailPanel({ managedCommunityIds }: MobileModmailPanelProps) {
  const modmail = useMemo(() => getServerModmailBackend(), []);
  const [reports, setReports] = useState<ServerReportSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ServerReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (managedCommunityIds.length === 0) {
      setReports([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await modmail.listServerReports(managedCommunityIds);
      setReports(rows);
    } catch (e) {
      setError(getErrorMessage(e, "Could not load ModMail."));
    } finally {
      setLoading(false);
    }
  }, [managedCommunityIds, modmail]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetailLoading(true);
    try {
      const d = await modmail.getServerReport(id);
      setDetail(d);
    } catch (e) {
      Alert.alert("Error", getErrorMessage(e, "Could not load report."));
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const renderItem = ({ item }: { item: ServerReportSummary }) => (
    <Pressable
      className="mb-2 rounded-xl border border-amber-700/50 bg-amber-950/40 px-3 py-3 active:opacity-90"
      onPress={() => void openDetail(item.reportId)}
    >
      <Text className="text-xs uppercase text-amber-200/80">{item.serverName}</Text>
      <Text className="mt-1 font-medium text-foreground">{item.title}</Text>
      <Text className="mt-1 text-[11px] text-muted-foreground">
        {item.status} · {new Date(item.createdAt).toLocaleString()}
      </Text>
    </Pressable>
  );

  if (managedCommunityIds.length === 0) {
    return (
      <Text className="py-6 text-center text-sm text-muted-foreground">
        ModMail is available when you can manage reports in a community.
      </Text>
    );
  }

  return (
    <View className="min-h-0 flex-1 rounded-xl border border-amber-700/40 bg-amber-950/25 p-3">
      <Text className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-200">
        Moderation inbox
      </Text>
      {loading ? (
        <ActivityIndicator color="#fbbf24" />
      ) : error ? (
        <Text className="text-sm text-red-400">{error}</Text>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r.reportId}
          renderItem={renderItem}
          refreshing={loading}
          onRefresh={() => void refresh()}
          ListEmptyComponent={
            <Text className="py-6 text-center text-sm text-muted-foreground">No open reports.</Text>
          }
        />
      )}

      <Modal visible={Boolean(detailId)} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-card px-4 pt-14">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-foreground">Report</Text>
            <Pressable onPress={() => setDetailId(null)}>
              <Text className="text-lg text-muted-foreground">Close</Text>
            </Pressable>
          </View>
          {detailLoading ? (
            <ActivityIndicator color="#e6edf7" />
          ) : detail ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text className="text-sm text-muted-foreground">{detail.serverName}</Text>
              <Text className="mt-2 text-base font-semibold text-foreground">{detail.title}</Text>
              <Text className="mt-2 text-xs text-muted-foreground">Status: {detail.status}</Text>
              {detail.targetDisplayName ? (
                <Text className="mt-2 text-sm text-foreground">Target: {detail.targetDisplayName}</Text>
              ) : null}
              <Pressable
                className="mt-6 rounded-xl bg-primary py-3"
                onPress={() => {
                  void modmail
                    .escalateReport(detail.reportId)
                    .then(() => {
                      Alert.alert("Escalated", "Report escalated to Haven.");
                      setDetailId(null);
                      void refresh();
                    })
                    .catch((e) => Alert.alert("Error", getErrorMessage(e, "Escalate failed.")));
                }}
              >
                <Text className="text-center font-semibold text-white">Escalate to Haven</Text>
              </Pressable>
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
