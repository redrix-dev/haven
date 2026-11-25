import { Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FriendsSurface } from "@/features/friends/FriendsSurface";
import type { MainStackParamList } from "@/navigation/types";
import { ThemedIonicons } from "@/theme-rn";

type Props = NativeStackScreenProps<MainStackParamList, "Friends">;

export function FriendsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      <View
        style={{ paddingTop: insets.top }}
        className="border-b border-border-panel bg-surface-panel"
      >
        <View className="flex-row items-center gap-1 px-2 py-2">
          <Pressable
            onPress={navigation.goBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="rounded-xl p-2 active:bg-surface-hover"
          >
            <ThemedIonicons
              name="chevron-back"
              size={24}
              colorClassName="accent-foreground"
            />
          </Pressable>
          <Text className="text-lg font-semibold text-foreground">Friends</Text>
        </View>
      </View>

      <View className="min-h-0 flex-1 px-4 pt-4">
        <FriendsSurface
          initialTab={route.params?.initialTab ?? "friends"}
          highlightedRequestId={route.params?.highlightedRequestId ?? null}
          onOpenConversation={(channelId) =>
            navigation.navigate("Community", {
              pendingDmConversationId: channelId,
              openDrawer: false,
            })
          }
        />
      </View>
    </View>
  );
}
