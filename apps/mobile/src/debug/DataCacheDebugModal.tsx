import { dataCacheDebug } from "@shared/debug";
import type { DataCacheDebugCategory } from "@shared/debug";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { exportDataCacheDebugLog } from "@/debug/exportDataCacheDebugLog";
import { useDataCacheDebugRevision } from "@/debug/useDataCacheDebugSnapshot";

const CATEGORIES: Array<DataCacheDebugCategory | "all"> = [
  "all",
  "store",
  "fetch",
  "cache-read",
  "cache-write",
  "hydration",
  "realtime",
  "component",
  "lifecycle",
  "navigation",
];

type TabId = "log" | "snapshots" | "meta";

type DataCacheDebugModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function DataCacheDebugModal({ visible, onClose }: DataCacheDebugModalProps) {
  useDataCacheDebugRevision(visible);
  const [tab, setTab] = useState<TabId>("log");
  const [category, setCategory] = useState<DataCacheDebugCategory | "all">("all");
  const [enabled, setEnabled] = useState(dataCacheDebug.isEnabled());
  const [exporting, setExporting] = useState(false);
  const [lastExportPath, setLastExportPath] = useState<string | null>(null);

  const entries = dataCacheDebug.getEntries();
  const snapshots = dataCacheDebug.getComponentSnapshots();

  const filteredEntries = useMemo(() => {
    const list = [...entries].reverse();
    if (category === "all") return list;
    return list.filter((e) => e.category === category);
  }, [category, entries]);

  const toggleEnabled = useCallback(() => {
    const next = !enabled;
    dataCacheDebug.setEnabled(next);
    setEnabled(next);
  }, [enabled]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const result = await exportDataCacheDebugLog();
      setLastExportPath(result.filePath);
      Alert.alert(
        "Debug log exported",
        `${result.entryCount} entries\n${result.filePath}${result.shared ? "\n\nShare sheet opened." : ""}`,
      );
    } catch (e) {
      Alert.alert(
        "Export failed",
        e instanceof Error ? e.message : "Could not write debug log file.",
      );
    } finally {
      setExporting(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    dataCacheDebug.clear();
  }, []);

  const handleResetSession = useCallback(() => {
    dataCacheDebug.resetSession();
    dataCacheDebug.lifecycle("DataCacheDebugModal", "Session reset");
  }, []);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-background pt-12">
        <View className="border-b border-border px-4 pb-3">
          <Text className="text-xl font-bold text-foreground">Data Cache Debug</Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            {entries.length} events · {snapshots.length} component snapshots
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            <Pressable
              onPress={toggleEnabled}
              className={`rounded-lg px-3 py-2 ${enabled ? "bg-primary" : "bg-surface-panel"}`}
            >
              <Text
                className={`text-xs font-semibold ${enabled ? "text-primary-foreground" : "text-foreground"}`}
              >
                {enabled ? "Logging ON" : "Logging OFF"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleExport()}
              disabled={exporting}
              className="rounded-lg bg-surface-panel px-3 py-2"
            >
              {exporting ? (
                // uniwind-theme-allow mobile-theme/no-raw-color-prop - ActivityIndicator requires raw color; resolves to --foreground
                <ActivityIndicator size="small" color="#e6edf7" />
              ) : (
                <Text className="text-xs font-semibold text-foreground">Export log</Text>
              )}
            </Pressable>
            <Pressable onPress={handleClear} className="rounded-lg bg-surface-panel px-3 py-2">
              <Text className="text-xs font-semibold text-foreground">Clear</Text>
            </Pressable>
            <Pressable
              onPress={handleResetSession}
              className="rounded-lg bg-surface-panel px-3 py-2"
            >
              <Text className="text-xs font-semibold text-foreground">Reset session</Text>
            </Pressable>
            <Pressable onPress={onClose} className="rounded-lg bg-surface-panel px-3 py-2">
              <Text className="text-xs font-semibold text-foreground">Close</Text>
            </Pressable>
          </View>
          {lastExportPath ? (
            <Text className="mt-2 text-[10px] text-muted-foreground" numberOfLines={2}>
              Last export: {lastExportPath}
            </Text>
          ) : null}
        </View>

        <View className="flex-row border-b border-border">
          {(
            [
              ["log", "Event log"],
              ["snapshots", "Components"],
              ["meta", "Meta"],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setTab(id)}
              className={`flex-1 py-3 ${tab === id ? "border-b-2 border-primary" : ""}`}
            >
              <Text
                className={`text-center text-xs font-semibold ${
                  tab === id ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === "log" ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="max-h-10 border-b border-border"
              contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  className={`rounded-full px-3 py-1 ${
                    category === cat ? "bg-primary" : "bg-surface-panel"
                  }`}
                >
                  <Text
                    className={`text-[10px] font-medium ${
                      category === cat ? "text-primary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView className="flex-1 px-3 py-2">
              {filteredEntries.length === 0 ? (
                <Text className="py-6 text-center text-sm text-muted-foreground">
                  No events yet. Navigate communities / channels to generate activity.
                </Text>
              ) : (
                filteredEntries.map((entry) => (
                  <View
                    key={entry.id}
                    className="mb-2 rounded-lg border border-border-panel bg-surface-embedded p-2"
                  >
                    <Text className="text-[10px] text-muted-foreground">
                      +{entry.elapsedMs}ms · {entry.category} · {entry.source}
                    </Text>
                    <Text className="mt-0.5 text-xs text-foreground">{entry.message}</Text>
                    {entry.data ? (
                      <Text className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {JSON.stringify(entry.data, null, 0)}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
          </>
        ) : null}

        {tab === "snapshots" ? (
          <ScrollView className="flex-1 px-3 py-2">
            {snapshots.length === 0 ? (
              <Text className="py-6 text-center text-sm text-muted-foreground">
                No component snapshots yet.
              </Text>
            ) : (
              snapshots.map((snap) => (
                <View
                  key={`${snap.componentId}-${snap.ts}`}
                  className="mb-3 rounded-lg border border-border-panel bg-surface-embedded p-3"
                >
                  <Text className="text-sm font-semibold text-foreground">{snap.componentId}</Text>
                  <Text className="text-[10px] text-muted-foreground">+{snap.elapsedMs}ms</Text>
                  <Text className="mt-2 font-mono text-[10px] text-muted-foreground">
                    {JSON.stringify(snap.values, null, 2)}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        ) : null}

        {tab === "meta" ? (
          <ScrollView className="flex-1 px-4 py-3">
            <Text className="text-sm text-foreground">
              Metro console receives every event when logging is ON.
            </Text>
            <Text className="mt-3 text-xs text-muted-foreground">
              Export writes a chronological .txt file to the app documents directory and opens the
              share sheet so you can AirDrop, save to Files, or paste into Notes.
            </Text>
            <Text className="mt-3 text-xs text-muted-foreground">
              From the JS debugger you can also call:
            </Text>
            <Text className="mt-1 font-mono text-[10px] text-foreground">
              global.__havenDataCacheDebug.exportText()
            </Text>
            <Text className="mt-4 text-xs font-semibold text-foreground">Instrumented stores</Text>
            <Text className="text-xs text-muted-foreground">
              authStore
            </Text>
            <Text className="mt-4 text-xs font-semibold text-foreground">Instrumented hooks</Text>
            <Text className="text-xs text-muted-foreground">
              HavenCore prepareCommunityEntry, prefetchCommunityChannelMessages,
              servers realtime bootstrap, auth session cache clears
            </Text>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}
