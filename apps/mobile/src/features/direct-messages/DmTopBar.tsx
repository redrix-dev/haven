import { useCallback, useMemo } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHavenCore } from "@shared/core";
import { resolveLiveUsername } from "@shared/lib/liveProfiles";

const HEADER_ROW_HEIGHT = 44;

type DmTopBarProps = {
  /** Called when the user taps the title / menu area to open the inbox drawer. */
  onOpenDrawer: () => void;
};

export function DmTopBar({ onOpenDrawer }: DmTopBarProps) {
  const insets = useSafeAreaInsets();
  const core = useHavenCore();
  const dm = core.directMessages;
  const liveProfiles = core.profiles.useProfilesRecord();

  const activeConversationId = dm.useActiveConversationId();
  const conversations = dm.useConversations();

  const activeConversation = useMemo(
    () =>
      activeConversationId
        ? (conversations.find((c) => c.conversationId === activeConversationId) ?? null)
        : null,
    [activeConversationId, conversations],
  );

  const peerName = useMemo(() => {
    if (!activeConversation) return null;
    return (
      resolveLiveUsername(
        liveProfiles,
        activeConversation.otherUserId,
        activeConversation.otherUsername,
      )?.trim() ||
      activeConversation.otherUsername ||
      "Direct"
    );
  }, [activeConversation, liveProfiles]);

  const handleMuteToggle = useCallback(
    (nextMuted: boolean) => {
      if (!activeConversation) return;
      void (async () => {
        await dm.setMuted(activeConversation.conversationId, nextMuted);
        await dm.loadConversations();
      })().catch(() => {});
    },
    [activeConversation, dm],
  );

  return (
    <View
      className="border-b border-border-panel bg-surface-modal"
      style={{ paddingTop: insets.top }}
    >
      <View
        style={{ height: HEADER_ROW_HEIGHT, paddingHorizontal: 12 }}
        className="flex-row items-center"
      >
        {/* Tapping the title opens the inbox drawer — mirrors community name in CommunityTopBar */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={peerName ? `Conversation with ${peerName}, open inbox` : "Open messages inbox"}
          className="flex-1 rounded-lg px-2 py-2 active:bg-surface-hover"
          onPress={onOpenDrawer}
        >
          <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
            {peerName ?? "Messages"}
          </Text>
        </Pressable>

        {/* Mute toggle — only shown when a conversation is active */}
        {activeConversation ? (
          <View className="flex-row items-center gap-2 pl-2">
            <Text className="text-xs text-muted-foreground">Mute</Text>
            <Switch
              value={activeConversation.isMuted}
              onValueChange={handleMuteToggle}
              // uniwind-theme-allow mobile-theme/no-raw-color-prop - Switch trackColor requires raw values; false=border-panel, true=primary
              trackColor={{ false: "#3d4f6a", true: "#4f8df5" }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
