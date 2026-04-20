import { Ionicons } from "@expo/vector-icons";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";
import { useMobileCommunityWorkspace } from "../features/community/useMobileCommunityWorkspace";

type CommunityNav = NativeStackNavigationProp<
  RootStackParamList,
  "Community"
>;

/**
 * Mobile community workspace entry: keeps navigationStore in sync with the
 * shared “current server” id, loads membership via Supabase auth + control
 * plane backend (Haven runtime), and renders a minimal shell for UI iteration.
 */
export function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<CommunityNav>();
  const route = useRoute<RouteProp<RootStackParamList, "Community">>();
  const { communityId } = route.params;
  const { phase, errorMessage, community, refresh } =
  useMobileCommunityWorkspace(communityId);

  const title =
    phase === "ready" && community
      ? community.name
      : phase === "loading"
        ? "Community"
        : phase === "missing"
          ? "Community"
          : "Community";

  return (
    <View className="flex-1 bg-surface-app" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center border-b border-border-panel bg-surface-modal px-3 py-3">
        <Pressable
          accessibilityRole="button"
          className="mr-2 h-10 w-10 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={22} color="#e6edf7" />
        </Pressable>
        <Text
          className="flex-1 text-lg font-semibold text-foreground"
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>

      <View className="flex-1 items-center justify-center px-6">
        {phase === "loading" ? (
          <ActivityIndicator color="#e6edf7" size="large" />
        ) : null}

        {phase === "ready" && community?.name ? (
          <Text className="text-center text-base text-muted-foreground">
            Placeholder —{" "}
            <Text className="font-semibold text-foreground">{community.name}</Text>
          </Text>
        ) : null}

        {phase === "missing" ? (
          <Text className="text-center text-sm text-muted-foreground">
            This community is not in your list or you no longer have access.
          </Text>
        ) : null}

        {phase === "error" && errorMessage ? (
          <Text className="text-center text-sm text-destructive">{errorMessage}</Text>
        ) : null}

        <Text
          className="mt-6 text-center text-xs text-muted-foreground opacity-80"
          selectable
        >
          id: {communityId}
        </Text>
      </View>
    </View>
  );
}
