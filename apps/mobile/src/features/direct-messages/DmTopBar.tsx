import { useCallback, useMemo, useState } from "react";
import { Image, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHavenCore } from "@shared/core";
import { resolveLiveAvatarUrl, resolveLiveUsername } from "@shared/lib/liveProfiles";
import { ThemedIonicons } from "@/theme-rn";

const HEADER_ROW_HEIGHT = 82;

type DmTopBarProps = {
  /** Called when the user taps the title / menu area to open the inbox drawer. */
  onOpenDrawer: () => void;
};

export function DmTopBar({ onOpenDrawer }: DmTopBarProps) {
  const insets = useSafeAreaInsets();
  const core = useHavenCore();
  const dm = core.directMessages;
  const liveProfiles = core.profiles.useProfilesRecord();
  const [actionsOpen, setActionsOpen] = useState(false);

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

  const peerAvatarUrl = useMemo(() => {
    if (!activeConversation) return null;
    return resolveLiveAvatarUrl(
      liveProfiles,
      activeConversation.otherUserId,
      activeConversation.otherAvatarUrl,
    );
  }, [activeConversation, liveProfiles]);

  const peerInitial = (peerName ?? "M").trim().charAt(0).toUpperCase() || "M";

  const handleMuteToggle = useCallback(
    (nextMuted: boolean) => {
      if (!activeConversation) return;
      void (async () => {
        await dm.setMuted(activeConversation.conversationId, nextMuted);
        await dm.loadConversations();
        setActionsOpen(false);
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
        style={{ minHeight: HEADER_ROW_HEIGHT, paddingHorizontal: 12 }}
        className="flex-row items-center py-2"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open messages inbox"
          className="h-11 w-11 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
          onPress={onOpenDrawer}
        >
          <ThemedIonicons name="mail-outline" size={20} colorClassName="accent-foreground" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={peerName ? `Conversation with ${peerName}, open inbox` : "Open messages inbox"}
          className="mx-3 min-w-0 flex-1 items-center rounded-xl px-3 py-1.5 active:bg-surface-hover"
          onPress={onOpenDrawer}
        >
          {peerAvatarUrl ? (
            <Image
              source={{ uri: peerAvatarUrl }}
              className="h-9 w-9 rounded-full"
              accessibilityLabel={peerName ? `${peerName} avatar` : "Conversation avatar"}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-panel">
              <Text className="text-base font-semibold text-foreground">{peerInitial}</Text>
            </View>
          )}
          <Text
            className="mt-1 max-w-full text-center text-lg font-semibold leading-6 text-foreground"
            numberOfLines={1}
          >
            {peerName ?? "Messages"}
          </Text>
        </Pressable>

        {activeConversation ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Direct message options"
            className="h-11 w-11 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
            onPress={() => setActionsOpen(true)}
          >
            <ThemedIonicons
              name="ellipsis-horizontal"
              size={20}
              colorClassName="accent-foreground"
            />
          </Pressable>
        ) : (
          <View className="h-11 w-11" />
        )}
      </View>

      <Modal
        visible={actionsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setActionsOpen(false)}
      >
        {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - modal sheet scrim overlay, invariant across themes */}
        <Pressable className="flex-1 justify-end bg-black/55" onPress={() => setActionsOpen(false)}>
          <Pressable
            className="rounded-t-2xl border-t border-border-panel bg-surface-modal px-4 pb-8 pt-3"
            onPress={(event) => event.stopPropagation()}
          >
            <Text className="mb-3 text-center text-xs text-muted-foreground" numberOfLines={2}>
              {peerName ?? "Direct message"}
            </Text>
            <Pressable
              className="mb-2 rounded-xl bg-surface-panel py-3.5 active:opacity-90"
              onPress={() => handleMuteToggle(!activeConversation?.isMuted)}
            >
              <Text className="text-center text-base font-medium text-foreground">
                {activeConversation?.isMuted ? "Unmute conversation" : "Mute conversation"}
              </Text>
            </Pressable>
            <Pressable
              className="mt-1 rounded-xl py-3 active:opacity-90"
              onPress={() => setActionsOpen(false)}
            >
              <Text className="text-center text-base text-muted-foreground">Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
