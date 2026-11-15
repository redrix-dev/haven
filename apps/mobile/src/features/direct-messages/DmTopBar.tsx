import { useState } from "react";
import { Image, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isMuted, otherPerson } from "@shared/collections/channels/selectors";
import {
  useAvatarUrl,
  useHavenCore,
  useMe,
  useNameOf,
  useStore,
} from "@mobile-data";
import { ThemedIonicons } from "@/theme-rn";

const HEADER_ROW_HEIGHT = 82;
/** Muting a conversation is until it is unmuted. */
const MUTED_FOR_GOOD = "9999-12-31T00:00:00.000Z";

type DmTopBarProps = {
  /** Called when the user taps the title / menu area to open the inbox drawer. */
  onOpenDrawer: () => void;
};

export function DmTopBar({ onOpenDrawer }: DmTopBarProps) {
  const insets = useSafeAreaInsets();
  const core = useHavenCore();
  const me = useMe() ?? "";
  const [actionsOpen, setActionsOpen] = useState(false);
  const channelId = useStore("session", (s) =>
    s.place?.kind === "conversation" ? s.place.channel_id : null,
  );
  const peerId = useStore("channels", (s) =>
    channelId ? otherPerson(s, channelId, me) : null,
  );
  const muted = useStore("channels", (s) =>
    channelId ? isMuted(s, channelId) : false,
  );
  const peerName = useNameOf(peerId ?? "");
  const peerAvatarUrl = useAvatarUrl(peerId);
  const title = peerId ? peerName : "Messages";
  const peerInitial = title.trim().charAt(0).toUpperCase() || "M";

  const toggleMute = () => {
    if (!channelId) return;
    void core.channels
      .mute(channelId, muted ? null : MUTED_FOR_GOOD)
      .catch(() => {});
    setActionsOpen(false);
  };

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
          <ThemedIonicons
            name="mail-outline"
            size={20}
            colorClassName="accent-foreground"
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            peerId
              ? `Conversation with ${peerName}, open inbox`
              : "Open messages inbox"
          }
          className="mx-3 min-w-0 flex-1 items-center rounded-xl px-3 py-1.5 active:bg-surface-hover"
          onPress={onOpenDrawer}
        >
          {peerAvatarUrl ? (
            <Image
              source={{ uri: peerAvatarUrl }}
              className="h-9 w-9 rounded-full"
              accessibilityLabel={`${peerName} avatar`}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-panel">
              <Text className="text-base font-semibold text-foreground">
                {peerInitial}
              </Text>
            </View>
          )}
          <Text
            className="mt-1 max-w-full text-center text-lg font-semibold leading-6 text-foreground"
            numberOfLines={1}
          >
            {title}
          </Text>
        </Pressable>

        {channelId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Conversation options"
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
        <Pressable
          className="flex-1 justify-end bg-black/55"
          onPress={() => setActionsOpen(false)}
        >
          <Pressable
            className="rounded-t-2xl border-t border-border-panel bg-surface-modal px-4 pb-8 pt-3"
            onPress={(event) => event.stopPropagation()}
          >
            <Text
              className="mb-3 text-center text-xs text-muted-foreground"
              numberOfLines={2}
            >
              {title}
            </Text>
            <Pressable
              className="mb-2 rounded-xl bg-surface-panel py-3.5 active:opacity-90"
              onPress={toggleMute}
            >
              <Text className="text-center text-base font-medium text-foreground">
                {muted ? "Unmute conversation" : "Mute conversation"}
              </Text>
            </Pressable>
            <Pressable
              className="mt-1 rounded-xl py-3 active:opacity-90"
              onPress={() => setActionsOpen(false)}
            >
              <Text className="text-center text-base text-muted-foreground">
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
