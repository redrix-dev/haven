import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Channel, ChannelCategory } from "@shared/lib/backend/records";
import type { VoiceSidebarParticipant } from "@shared/features/voice/types";
import {
  communityChannels,
  isMuted,
  unreadCount,
} from "@shared/collections/channels/selectors";
import {
  categoriesOf,
  isCollapsed,
} from "@shared/collections/categories/selectors";
import { selectChannelParticipants } from "@shared/collections/voice/voice";
import { useCore, useHavenCore, useStore } from "@mobile-data";
import { CommunityManagementEntry } from "@/features/community/management/CommunityManagementEntry";
import { ThemedIonicons } from "@/theme-rn";

type CommunityChannelDrawerProps = {
  serverId: string | null;
  selectedChannelId: string | null;
  activeVoiceChannelId: string | null;
  onSelectTextChannel: (channelId: string) => void;
  onSelectVoiceChannel: (channelId: string) => void;
  onOpenVoiceSession: () => void;
  onCreateCommunity: () => void;
  onJoinCommunity: () => void;
};

/** One group of channels: those without a category first, then each category. */
type ChannelGroup = { category: ChannelCategory | null; channels: Channel[] };

function participantInitial(displayName: string): string {
  return displayName.trim().charAt(0).toUpperCase() || "?";
}

function VoiceParticipantRow({
  participant,
}: {
  participant: VoiceSidebarParticipant;
}) {
  return (
    <View className="flex-row items-center gap-2 rounded-lg px-2 py-1.5">
      <View
        className={[
          "h-6 w-6 items-center justify-center overflow-hidden rounded-full border bg-surface-panel",
          participant.isSpeaking ? "border-primary" : "border-border-panel",
        ].join(" ")}
      >
        {participant.avatarUrl ? (
          <Image
            source={{ uri: participant.avatarUrl }}
            className="h-full w-full rounded-full"
          />
        ) : (
          <Text className="text-xs font-bold text-foreground">
            {participantInitial(participant.displayName)}
          </Text>
        )}
      </View>
      <Text
        className="min-w-0 flex-1 text-xs text-muted-foreground"
        numberOfLines={1}
      >
        {participant.displayName}
      </Text>
      {participant.isSpeaking ? (
        <View className="h-2 w-2 rounded-full bg-primary" />
      ) : null}
    </View>
  );
}

function ChannelRow({
  channel,
  active,
  activeVoiceChannelId,
  onSelectTextChannel,
  onSelectVoiceChannel,
  onOpenVoiceSession,
}: {
  channel: Channel;
  active: boolean;
  activeVoiceChannelId: string | null;
  onSelectTextChannel: (channelId: string) => void;
  onSelectVoiceChannel: (channelId: string) => void;
  onOpenVoiceSession: () => void;
}) {
  const isVoice = channel.kind === "voice";
  const unread = useStore(
    "channels",
    (s) => unreadCount(s, channel.id) > 0 && !isMuted(s, channel.id),
  );
  const participants = useStore("voice", (s) =>
    isVoice ? (selectChannelParticipants(s, channel.id) ?? []) : [],
  );
  const showUnread = unread && !active;
  return (
    <View className="mb-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          showUnread ? `${channel.name ?? ""}, unread` : (channel.name ?? "")
        }
        className={`flex-row items-center gap-2.5 rounded-xl px-3 py-2.5 ${
          active ? "bg-surface-panel" : "active:bg-surface-hover"
        }`}
        onPress={() => {
          if (!isVoice) return onSelectTextChannel(channel.id);
          if (activeVoiceChannelId === channel.id) onOpenVoiceSession();
          else onSelectVoiceChannel(channel.id);
        }}
      >
        <ThemedIonicons
          name={isVoice ? "volume-medium-outline" : "chatbox-outline"}
          size={16}
          colorClassName={
            active || showUnread ? "accent-foreground" : "accent-text-dim"
          }
        />
        <Text
          className={`flex-1 text-sm ${
            active || showUnread
              ? "font-semibold text-foreground"
              : "font-medium text-muted-foreground"
          }`}
          numberOfLines={1}
        >
          {channel.name}
        </Text>
        {isVoice && participants.length > 0 ? (
          <Text className="text-xs font-semibold text-muted-foreground">
            {participants.length}
          </Text>
        ) : null}
        {showUnread ? (
          <View className="h-2 w-2 rounded-full bg-foreground" />
        ) : null}
        {active ? (
          <ThemedIonicons
            name="checkmark"
            size={15}
            colorClassName="accent-foreground"
          />
        ) : null}
      </Pressable>
      {participants.length > 0 ? (
        <View className="ml-8 mt-1 gap-0.5">
          {participants.map((participant) => (
            <VoiceParticipantRow
              key={participant.userId}
              participant={participant}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function CommunityChannelDrawer({
  serverId,
  selectedChannelId,
  activeVoiceChannelId,
  onSelectTextChannel,
  onSelectVoiceChannel,
  onOpenVoiceSession,
  onCreateCommunity,
  onJoinCommunity,
}: CommunityChannelDrawerProps) {
  const insets = useSafeAreaInsets();
  const core = useHavenCore();
  const communityName = useStore("communities", (s) =>
    serverId ? (s.byId[serverId]?.name ?? "Communities") : "Communities",
  );
  const groups = useCore(
    ["channels", "categories"],
    (s): ChannelGroup[] => {
      if (!serverId) return [];
      const channels = communityChannels(s.channels, serverId);
      const categories = categoriesOf(s.categories, serverId);
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
      ].filter((group) => group.category !== null || group.channels.length > 0);
    },
    groupsEqual,
  );
  const collapsed = useStore("categories", (s) => s.collapsed);
  const unread = useStore("channels", (s) => s.unread);
  const initial = communityName.trim().charAt(0).toUpperCase() || "?";

  if (!serverId) {
    return (
      <View className="flex-1 border-r border-border-panel bg-surface-modal">
        <View
          className="border-b border-border-panel px-4 pb-4"
          style={{ paddingTop: insets.top + 16 }}
        >
          <Text className="text-base font-semibold text-foreground">
            Communities
          </Text>
        </View>
        <View className="flex-1 justify-center px-5">
          <Text className="text-xl font-bold text-foreground">
            Start with a community
          </Text>
          <Text className="mt-2 text-sm leading-5 text-muted-foreground">
            Create your own server or join one with an invite to see channels
            here.
          </Text>
          <View className="mt-5 gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={onCreateCommunity}
              className="rounded-xl bg-primary px-4 py-3 active:bg-primary-hover"
            >
              <Text className="text-center font-semibold text-primary-foreground">
                Create community
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onJoinCommunity}
              className="rounded-xl border border-border-control bg-surface-panel px-4 py-3 active:bg-surface-hover"
            >
              <Text className="text-center font-semibold text-foreground">
                Join community
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const hasChannels = groups.some((group) => group.channels.length > 0);

  return (
    <View className="flex-1 border-r border-border-panel bg-surface-modal">
      <View
        className="border-b border-border-panel px-4 pb-4"
        style={{ paddingTop: insets.top + 16 }}
      >
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-surface-panel">
            <Text className="text-base font-bold text-foreground">
              {initial}
            </Text>
          </View>
          <Text
            className="flex-1 text-base font-semibold text-foreground"
            numberOfLines={2}
          >
            {communityName}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {!hasChannels ? (
          <Text className="py-4 text-sm text-muted-foreground">
            No channels yet.
          </Text>
        ) : (
          groups.map((group) => {
            const folded = group.category
              ? collapsed[group.category.id] === true
              : false;
            // A folded category still shows its channels with unread messages.
            const shown = group.channels.filter(
              (channel) =>
                !folded ||
                channel.id === selectedChannelId ||
                (unread[channel.id] ?? 0) > 0,
            );
            return (
              <View key={group.category?.id ?? "uncategorized"}>
                {group.category ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !folded }}
                    className="mt-3 flex-row items-center gap-1 px-2 py-1"
                    onPress={() => {
                      const category = group.category!;
                      void core.categories.setCollapsed(
                        category.id,
                        !isCollapsed(
                          core.stores.categories.getState(),
                          category.id,
                        ),
                      );
                    }}
                  >
                    <ThemedIonicons
                      name={folded ? "chevron-forward" : "chevron-down"}
                      size={12}
                      colorClassName="accent-text-dim"
                    />
                    <Text
                      className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      numberOfLines={1}
                    >
                      {group.category.name}
                    </Text>
                  </Pressable>
                ) : null}
                {shown.map((channel) => (
                  <ChannelRow
                    key={channel.id}
                    channel={channel}
                    active={
                      channel.kind === "voice"
                        ? activeVoiceChannelId === channel.id
                        : selectedChannelId === channel.id
                    }
                    activeVoiceChannelId={activeVoiceChannelId}
                    onSelectTextChannel={onSelectTextChannel}
                    onSelectVoiceChannel={onSelectVoiceChannel}
                    onOpenVoiceSession={onOpenVoiceSession}
                  />
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      <CommunityManagementEntry serverId={serverId} />
    </View>
  );
}

const groupsEqual = (a: ChannelGroup[], b: ChannelGroup[]) =>
  a.length === b.length &&
  a.every(
    (group, i) =>
      group.category === b[i].category &&
      group.channels.length === b[i].channels.length &&
      group.channels.every((channel, j) => channel === b[i].channels[j]),
  );
