import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  CommunityReportRecord,
  ReportStatus,
} from "@shared/lib/backend/records";
import { communityReports } from "@shared/collections/reports/selectors";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { resolveColorProp } from "@shared/themes";
import { useCore, useHavenCore, useNameOf, useStore } from "@mobile-data";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { ThemedIonicons } from "@/theme-rn";

const STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  dismissed: "Dismissed",
  escalated: "Sent to Haven",
};

/** What a moderator sets; escalating is its own button, and final. */
const SETTABLE: Exclude<ReportStatus, "escalated">[] = [
  "open",
  "in_review",
  "resolved",
  "dismissed",
];

const WAITING: ReportStatus[] = ["open", "in_review"];

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Modmail: the reports of every community the person moderates, newest
 * first. A report shows what the database wrote down when it was filed (the
 * message, its neighbours, the person), never who filed it.
 */
export function MobileModmailPanel({
  managedCommunityIds,
}: {
  managedCommunityIds: string[];
}) {
  const core = useHavenCore();
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const key = [...managedCommunityIds].sort().join(",");

  // Only the moderated set is a dependency; loading writes the reports store.
  useEffect(() => {
    const held = core.stores.reports.getState().byCommunity;
    for (const id of key ? key.split(",") : []) {
      if (!(id in held)) void core.reports.loadCommunity(id);
    }
  }, [core, key]);

  const reports = useStore("reports", (s) =>
    managedCommunityIds
      .flatMap((id) => communityReports(s, id))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
  );
  const shown = showAll
    ? reports
    : reports.filter((r) => WAITING.includes(r.status));
  const selected = reports.find((r) => r.id === selectedId) ?? null;

  if (selected) {
    return (
      <ReportDetail report={selected} onBack={() => setSelectedId(null)} />
    );
  }

  return (
    <View className="min-h-0 flex-1">
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowAll((v) => !v)}
        className="mx-4 my-2 self-start rounded-full bg-surface-panel px-3 py-1.5"
      >
        <Text className="text-xs font-semibold text-foreground">
          {showAll ? "Showing all reports" : "Showing waiting reports"}
        </Text>
      </Pressable>
      <FlatList
        data={shown}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <ReportRow report={item} onPress={() => setSelectedId(item.id)} />
        )}
        ListEmptyComponent={
          <Text className="px-4 py-8 text-center text-sm text-muted-foreground">
            {showAll ? "No reports." : "Nothing waiting. Nice."}
          </Text>
        }
      />
    </View>
  );
}

function ReportRow({
  report,
  onPress,
}: {
  report: CommunityReportRecord;
  onPress: () => void;
}) {
  const subject = useNameOf(report.subject_user_id, report.community_id);
  const community = useStore(
    "communities",
    (s) => s.byId[report.community_id]?.name ?? "",
  );
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="border-b border-border-panel px-4 py-3 active:bg-surface-hover"
    >
      <View className="flex-row items-center gap-2">
        <Text
          className="flex-1 text-sm font-semibold text-foreground"
          numberOfLines={1}
        >
          {subject}
        </Text>
        <StatusPill status={report.status} />
      </View>
      <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
        {community} · {formatTime(report.created_at)}
      </Text>
      {report.reason ? (
        <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={2}>
          {report.reason}
        </Text>
      ) : null}
    </Pressable>
  );
}

function StatusPill({ status }: { status: ReportStatus }) {
  return (
    <View
      className={`rounded px-1.5 py-0.5 ${
        status === "open"
          ? "bg-destructive/15"
          : status === "in_review"
            ? "bg-primary/15"
            : "bg-surface-panel"
      }`}
    >
      <Text
        className={`text-xs font-semibold ${
          status === "open"
            ? "text-destructive"
            : status === "in_review"
              ? "text-primary"
              : "text-muted-foreground"
        }`}
      >
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

function ReportDetail({
  report,
  onBack,
}: {
  report: CommunityReportRecord;
  onBack: () => void;
}) {
  const core = useHavenCore();
  const tokens = useMobileThemeTokens();
  const placeholder = resolveColorProp(tokens, "muted-foreground") ?? "#8b9cbb";
  const notes = useStore("reports", (s) => s.notes[report.id] ?? []);
  const subject = useNameOf(report.subject_user_id, report.community_id);
  const community = useStore(
    "communities",
    (s) => s.byId[report.community_id]?.name ?? "",
  );
  const noteAuthors = useCore(["members", "profiles"], () =>
    Object.fromEntries(
      notes.map((n) => [
        n.author_id,
        core.nameOf(n.author_id, report.community_id),
      ]),
    ),
  );
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);

  // Only the report is a dependency; loading notes writes the store.
  useEffect(() => {
    void core.reports.loadNotes(report.id);
  }, [core, report.id]);
  useEffect(() => {
    void core.profiles.ensure([
      report.subject_user_id,
      ...notes.map((n) => n.author_id),
    ]);
  }, [core, notes, report.subject_user_id]);

  const run = async (work: () => Promise<unknown>, done?: string) => {
    setWorking(true);
    try {
      await work();
      if (done) Alert.alert(done);
    } catch (error) {
      Alert.alert(
        "That didn't work",
        getErrorMessage(error, "Try again in a moment."),
      );
    } finally {
      setWorking(false);
    }
  };

  const escalate = () =>
    Alert.alert(
      "Send this report to Haven staff?",
      "Haven's safety team takes it over. It can't be taken back.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send to Haven",
          onPress: () =>
            void run(
              () => core.reports.escalate(report.id),
              "Sent to Haven staff",
            ),
        },
      ],
    );

  const snapshot = report.snapshot;
  const at = snapshot.message?.created_at ?? "";
  const before = (snapshot.context ?? []).filter((c) => c.created_at < at);
  const after = (snapshot.context ?? []).filter((c) => c.created_at > at);

  return (
    <ScrollView className="px-4" keyboardShouldPersistTaps="handled">
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        className="my-2 flex-row items-center gap-1"
      >
        <ThemedIonicons
          name="chevron-back"
          size={18}
          colorClassName="accent-foreground"
        />
        <Text className="text-sm font-semibold text-foreground">Reports</Text>
      </Pressable>
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-base font-semibold text-foreground">
          {subject}
        </Text>
        <StatusPill status={report.status} />
      </View>
      <Text className="mb-3 text-xs text-muted-foreground">
        Reported {formatTime(report.created_at)} in {community}
      </Text>

      {report.reason ? (
        <Block title="Reason">
          <Text className="text-sm text-foreground">{report.reason}</Text>
        </Block>
      ) : null}

      {snapshot.message ? (
        <Block title="The message, as it was when reported">
          {before.map((line, i) => (
            <ContextLine
              key={`b${i}`}
              username={line.username}
              body={line.body}
            />
          ))}
          <Text className="my-1 rounded bg-destructive/10 px-2 py-1 text-sm text-foreground">
            <Text className="font-semibold">
              {snapshot.author?.username ?? "Deleted user"}:
            </Text>{" "}
            {snapshot.message.body}
          </Text>
          {after.map((line, i) => (
            <ContextLine
              key={`a${i}`}
              username={line.username}
              body={line.body}
            />
          ))}
        </Block>
      ) : null}

      {snapshot.profile ? (
        <Block title="Their profile, as it was when reported">
          <Text className="text-sm font-semibold text-foreground">
            {snapshot.profile.username ?? "Deleted user"}
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {snapshot.profile.bio || "No bio."}
          </Text>
        </Block>
      ) : null}

      {report.status !== "escalated" ? (
        <View className="mb-4 flex-row flex-wrap gap-2">
          {SETTABLE.map((status) => (
            <Pressable
              key={status}
              accessibilityRole="button"
              disabled={working || report.status === status}
              onPress={() =>
                void run(() => core.reports.setStatus(report.id, status))
              }
              className={`rounded-lg px-3 py-2 ${
                report.status === status ? "bg-primary" : "bg-surface-panel"
              } ${working ? "opacity-50" : ""}`}
            >
              <Text
                className={`text-xs font-semibold ${
                  report.status === status
                    ? "text-primary-foreground"
                    : "text-foreground"
                }`}
              >
                {STATUS_LABELS[status]}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            disabled={working}
            onPress={escalate}
            className="rounded-lg bg-surface-panel px-3 py-2"
          >
            <Text className="text-xs font-semibold text-foreground">
              Send to Haven staff
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Block title="Moderator notes">
        {notes.length === 0 ? (
          <Text className="text-sm text-muted-foreground">No notes yet.</Text>
        ) : null}
        {notes.map((entry) => (
          <View key={entry.id} className="mb-2 rounded-lg bg-surface-panel p-2">
            <Text className="text-xs text-muted-foreground">
              {noteAuthors[entry.author_id] ?? "…"} ·{" "}
              {formatTime(entry.created_at)}
            </Text>
            <Text className="mt-1 text-sm text-foreground">{entry.body}</Text>
          </View>
        ))}
        <View className="mt-2 flex-row gap-2">
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note for other moderators"
            placeholderTextColor={placeholder}
            className="min-w-0 flex-1 rounded-lg border border-border-control bg-surface-panel px-3 py-2 text-sm text-foreground"
          />
          <Pressable
            accessibilityRole="button"
            disabled={working || !note.trim()}
            onPress={() =>
              void run(async () => {
                await core.reports.addNote(report.id, note.trim());
                setNote("");
              })
            }
            className={`rounded-lg bg-primary px-3 py-2 ${
              working || !note.trim() ? "opacity-50" : ""
            }`}
          >
            <Text className="text-sm font-semibold text-primary-foreground">
              Add
            </Text>
          </Pressable>
        </View>
      </Block>
    </ScrollView>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-4">
      <Text className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
        {title}
      </Text>
      <View className="rounded-lg border border-border-panel p-3">
        {children}
      </View>
    </View>
  );
}

function ContextLine({
  username,
  body,
}: {
  username: string | null;
  body: string;
}) {
  return (
    <Text className="text-sm text-muted-foreground">
      <Text className="font-semibold">{username ?? "Deleted user"}:</Text>{" "}
      {body}
    </Text>
  );
}
