import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import type { Channel, ChannelCategory } from "@shared/lib/backend/records";
import { communityChannels } from "@shared/collections/channels/selectors";
import { categoriesOf } from "@shared/collections/categories/selectors";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useCore, useHavenCore, useStore } from "@mobile-data";
import { ThemedIonicons } from "@/theme-rn";
import { ChannelPermissionsSheet } from "./ChannelPermissionsSheet";
import {
  Choices,
  EditorSheet,
  ErrorText,
  Muted,
  SettingsButton,
  SettingsField,
} from "./settingsUi";

type Group = { category: ChannelCategory | null; channels: Channel[] };

type ChannelEditor =
  | { mode: "create"; categoryId: string | null }
  | { mode: "edit"; channel: Channel };

type CategoryEditor =
  | { mode: "create" }
  | { mode: "edit"; category: ChannelCategory };

/**
 * A community's channels and categories, for those with `manage_channels`.
 * Every change goes to the database; its answer, and any other channel it
 * touched, come back through the channels and categories collections.
 */
export function ChannelsSection({ communityId }: { communityId: string }) {
  const core = useHavenCore();
  const groups = useCore(
    ["channels", "categories"],
    (s): Group[] => {
      const channels = communityChannels(s.channels, communityId);
      const categories = categoriesOf(s.categories, communityId);
      const known = new Set(categories.map((c) => c.id));
      return [
        {
          category: null,
          channels: channels.filter(
            (c) => c.category_id === null || !known.has(c.category_id),
          ),
        },
        ...categories.map((category) => ({
          category,
          channels: channels.filter((c) => c.category_id === category.id),
        })),
      ];
    },
    groupsEqual,
  );
  const canSetPermissions = useStore("communities", () =>
    core.communities.can(communityId, "manage_channel_permissions"),
  );
  const [editor, setEditor] = useState<ChannelEditor | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditor | null>(
    null,
  );
  const [permissionsTarget, setPermissionsTarget] = useState<Channel | null>(
    null,
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = groups.flatMap((g) => (g.category ? [g.category] : []));

  const run = async (work: () => Promise<unknown>, failure: string) => {
    setWorking(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(getErrorMessage(cause, failure));
    } finally {
      setWorking(false);
    }
  };

  /** Puts the group in this order; only channels that change are sent. */
  const placeInOrder = (categoryId: string | null, ordered: Channel[]) =>
    run(async () => {
      for (const [position, channel] of ordered.entries()) {
        if (
          channel.position !== position ||
          channel.category_id !== categoryId
        ) {
          await core.channels.move(channel.id, categoryId, position);
        }
      }
    }, "Couldn't move the channel.");

  const shift = (group: Group, index: number, by: -1 | 1) => {
    const ordered = [...group.channels];
    const [moving] = ordered.splice(index, 1);
    ordered.splice(index + by, 0, moving);
    void placeInOrder(group.category?.id ?? null, ordered);
  };

  const moveTo = (channel: Channel, categoryId: string | null) => {
    const target = groups.find((g) => (g.category?.id ?? null) === categoryId);
    void placeInOrder(categoryId, [
      ...(target?.channels.filter((c) => c.id !== channel.id) ?? []),
      channel,
    ]);
  };

  const channelActions = (channel: Channel) =>
    Alert.alert(channel.name ?? "Channel", undefined, [
      { text: "Edit", onPress: () => setEditor({ mode: "edit", channel }) },
      ...(canSetPermissions
        ? [
            {
              text: "Permissions",
              onPress: () => setPermissionsTarget(channel),
            },
          ]
        : []),
      ...(categories.length > 0
        ? [
            {
              text: "Move to category",
              onPress: () =>
                Alert.alert("Move to", undefined, [
                  { text: "No category", onPress: () => moveTo(channel, null) },
                  ...categories.map((category) => ({
                    text: category.name,
                    onPress: () => moveTo(channel, category.id),
                  })),
                  { text: "Cancel", style: "cancel" as const },
                ]),
            },
          ]
        : []),
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            "Delete this channel?",
            "Its messages are deleted for everyone. This can't be undone.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () =>
                  void run(
                    () => core.deleteChannel(channel.id),
                    "Couldn't delete it.",
                  ),
              },
            ],
          ),
      },
      { text: "Cancel", style: "cancel" },
    ]);

  const categoryActions = (category: ChannelCategory) =>
    Alert.alert(category.name, undefined, [
      {
        text: "Rename",
        onPress: () => setCategoryEditor({ mode: "edit", category }),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            "Delete this category?",
            "Its channels stay, outside any category.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () =>
                  void run(
                    () => core.categories.remove(category.id),
                    "Couldn't delete it.",
                  ),
              },
            ],
          ),
      },
      { text: "Cancel", style: "cancel" },
    ]);

  return (
    <ScrollView>
      <View className="mb-3 flex-row gap-2">
        <View className="flex-1">
          <SettingsButton
            label="Add channel"
            tone="primary"
            onPress={() => setEditor({ mode: "create", categoryId: null })}
          />
        </View>
        <View className="flex-1">
          <SettingsButton
            label="Add category"
            onPress={() => setCategoryEditor({ mode: "create" })}
          />
        </View>
      </View>
      <ErrorText message={error} />
      {groups.map((group) => (
        <View
          key={group.category?.id ?? "uncategorized"}
          className="mb-3 overflow-hidden rounded-xl border border-border-panel"
        >
          <Pressable
            accessibilityRole={group.category ? "button" : undefined}
            disabled={!group.category}
            onPress={() => group.category && categoryActions(group.category)}
            className="flex-row items-center border-b border-border-panel bg-surface-panel px-3 py-2"
          >
            <Text className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.category?.name ?? "Not in a category"}
            </Text>
            {group.category ? (
              <ThemedIonicons
                name="ellipsis-horizontal"
                size={16}
                colorClassName="accent-muted-foreground"
              />
            ) : null}
          </Pressable>
          {group.channels.length === 0 ? (
            <View className="px-3">
              <Muted>No channels here.</Muted>
            </View>
          ) : null}
          {group.channels.map((channel, index) => (
            <View
              key={channel.id}
              className="flex-row items-center gap-1 border-b border-border-panel px-3 py-2"
            >
              <Text className="w-4 text-muted-foreground">
                {channel.kind === "voice" ? "♪" : "#"}
              </Text>
              <Pressable
                accessibilityRole="button"
                className="min-w-0 flex-1"
                onPress={() => channelActions(channel)}
              >
                <Text className="text-sm text-foreground" numberOfLines={1}>
                  {channel.name}
                </Text>
                {channel.topic ? (
                  <Text
                    className="text-xs text-muted-foreground"
                    numberOfLines={1}
                  >
                    {channel.topic}
                  </Text>
                ) : null}
              </Pressable>
              <IconButton
                name="arrow-up"
                label="Move up"
                disabled={working || index === 0}
                onPress={() => shift(group, index, -1)}
              />
              <IconButton
                name="arrow-down"
                label="Move down"
                disabled={working || index === group.channels.length - 1}
                onPress={() => shift(group, index, 1)}
              />
            </View>
          ))}
        </View>
      ))}

      {editor ? (
        <ChannelEditorSheet
          communityId={communityId}
          editor={editor}
          categories={categories}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {categoryEditor ? (
        <CategoryEditorSheet
          communityId={communityId}
          editor={categoryEditor}
          onClose={() => setCategoryEditor(null)}
        />
      ) : null}
      {permissionsTarget ? (
        <ChannelPermissionsSheet
          communityId={communityId}
          channel={permissionsTarget}
          onClose={() => setPermissionsTarget(null)}
        />
      ) : null}
    </ScrollView>
  );
}

function IconButton({
  name,
  label,
  onPress,
  disabled,
}: {
  name: "arrow-up" | "arrow-down";
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={`rounded-lg p-2 ${disabled ? "opacity-30" : "active:bg-surface-hover"}`}
    >
      <ThemedIonicons
        name={name}
        size={16}
        colorClassName="accent-foreground"
      />
    </Pressable>
  );
}

function ChannelEditorSheet({
  communityId,
  editor,
  categories,
  onClose,
}: {
  communityId: string;
  editor: ChannelEditor;
  categories: ChannelCategory[];
  onClose: () => void;
}) {
  const core = useHavenCore();
  const editing = editor.mode === "edit" ? editor.channel : null;
  const [kind, setKind] = useState<"text" | "voice">("text");
  const [name, setName] = useState(editing?.name ?? "");
  const [topic, setTopic] = useState(editing?.topic ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(
    editor.mode === "create" ? editor.categoryId : null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setError("A channel needs a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await core.channels.update(editing.id, {
          name: name.trim(),
          topic: topic.trim(),
        });
      } else {
        await core.channels.create(communityId, kind, name.trim(), {
          topic: topic.trim() || undefined,
          category_id: categoryId ?? undefined,
        });
      }
      onClose();
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't save the channel."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorSheet
      title={editing ? `Edit #${editing.name}` : "New channel"}
      onClose={onClose}
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        {!editing ? (
          <Choices
            options={[
              { label: "# Text", value: "text" as const },
              { label: "♪ Voice", value: "voice" as const },
            ]}
            value={kind}
            onChange={setKind}
          />
        ) : null}
        <SettingsField label="Name" value={name} onChangeText={setName} />
        <SettingsField label="Topic" value={topic} onChangeText={setTopic} />
        {!editing && categories.length > 0 ? (
          <>
            <Text className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
              Category
            </Text>
            <Choices
              options={[
                { label: "No category", value: null as string | null },
                ...categories.map((c) => ({ label: c.name, value: c.id })),
              ]}
              value={categoryId}
              onChange={setCategoryId}
            />
          </>
        ) : null}
        <ErrorText message={error} />
        <View className="flex-row justify-end gap-2">
          <SettingsButton label="Cancel" disabled={saving} onPress={onClose} />
          <SettingsButton
            label={saving ? "Saving…" : "Save"}
            tone="primary"
            disabled={saving}
            onPress={() => void save()}
          />
        </View>
      </ScrollView>
    </EditorSheet>
  );
}

function CategoryEditorSheet({
  communityId,
  editor,
  onClose,
}: {
  communityId: string;
  editor: CategoryEditor;
  onClose: () => void;
}) {
  const core = useHavenCore();
  const editing = editor.mode === "edit" ? editor.category : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setError("A category needs a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await core.categories.save(
        communityId,
        name.trim(),
        editing
          ? { category_id: editing.id, position: editing.position }
          : undefined,
      );
      onClose();
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't save the category."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorSheet
      title={editing ? "Rename category" : "New category"}
      onClose={onClose}
    >
      <SettingsField label="Name" value={name} onChangeText={setName} />
      <ErrorText message={error} />
      <View className="flex-row justify-end gap-2">
        <SettingsButton label="Cancel" disabled={saving} onPress={onClose} />
        <SettingsButton
          label={saving ? "Saving…" : "Save"}
          tone="primary"
          disabled={saving}
          onPress={() => void save()}
        />
      </View>
    </EditorSheet>
  );
}

const groupsEqual = (a: Group[], b: Group[]) =>
  a.length === b.length &&
  a.every(
    (group, i) =>
      group.category === b[i].category &&
      group.channels.length === b[i].channels.length &&
      group.channels.every((channel, j) => channel === b[i].channels[j]),
  );
