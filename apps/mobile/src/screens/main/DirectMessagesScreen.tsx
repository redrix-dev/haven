import { useCallback, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHavenCore } from "@shared/core";
import { useUiStore } from "@shared/stores/uiStore";
import type { MainStackParamList } from "@/navigation/types";
import { DirectMessagesContainer } from "@/features/direct-messages/DirectMessagesContainer";

type Props = NativeStackScreenProps<MainStackParamList, "DirectMessages">;

export function DirectMessagesScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const core = useHavenCore();
  const dm = core.directMessages;
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode);
  const handledConversationIdRef = useRef<string | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      setWorkspaceMode("dm");
      return () => {
        setWorkspaceMode("community");
      };
    }, [setWorkspaceMode]),
  );

  useFocusEffect(
    useCallback(() => {
      const conversationId = route.params?.openConversationId;
      if (!conversationId || handledConversationIdRef.current === conversationId) return;
      handledConversationIdRef.current = conversationId;
      void dm.openConversation(conversationId, { markRead: true }).catch(() => {});
    }, [route.params?.openConversationId, dm]),
  );

  return (
    <View className="flex-1 bg-background">
      <View style={{ paddingTop: insets.top }} className="border-b border-border-panel bg-surface-panel">
        <View className="flex-row items-center gap-1 px-2 py-2">
          <Pressable
            onPress={navigation.goBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="rounded-xl p-2 active:bg-surface-hover"
          >
            <Ionicons name="chevron-back" size={24} color="#e6edf7" />
          </Pressable>
          <Text className="text-lg font-semibold text-foreground">Messages</Text>
        </View>
      </View>
      <DirectMessagesContainer />
    </View>
  );
}
