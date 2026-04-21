import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useCallback, useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";
import { useServers } from "@shared/features/community/hooks/useServers";
import { useCommunityWorkspace } from "@shared/features/community/hooks/useCommunityWorkspace";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useAuthStore } from "@shared/stores/authStore";

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
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ?? null;
  const { servers, status: serversStatus, error: serversError, refreshServers } =
    useServers();
  const {
    state: { channels, channelsLoading, channelsError },
    derived: { currentChannel },
  } = useCommunityWorkspace({
    servers,
    currentUserId,
  });

  useEffect(() => {
    useNavigationStore.getState().setCurrentServerId(communityId);
    return () => {
      useNavigationStore.getState().setCurrentServerId(null);
      useNavigationStore.getState().setCurrentChannelId(null);
    };
  }, [communityId]);

  const community = servers.find((entry) => entry.id === communityId) ?? null;
  const phase: "loading" | "ready" | "missing" | "error" =
    serversStatus === "loading" && servers.length === 0
      ? "loading"
      : serversStatus === "error"
        ? "error"
        : community
          ? "ready"
          : "missing";
  const errorMessage = phase === "error" ? serversError : null;

  const handleSelectChannel = useCallback((channelId: string) => {
    useNavigationStore.getState().setCurrentChannelId(channelId);
  }, []);
  const title = phase === "ready" && community ? community.name : "Community";

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
        <Text className="flex-1 text-lg font-semibold text-foreground" numberOfLines={1}>
          {title}
        </Text>
      </View>
  
      <View className="flex-1 px-6">
        {phase === "loading" ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#e6edf7" size="large" />
          </View>
        ) : null}
  
        {phase === "ready" ? (
          <View className="h-full w-full flex-row">
            <View className="w-44 border-r border-border-panel bg-surface-modal p-3">
              {channelsLoading && channels.length === 0 ? (
                <ActivityIndicator color="#e6edf7" />
              ) : channelsError && channels.length === 0 ? (
                <View>
                  <Text className="text-sm text-destructive">{channelsError}</Text>
                  <Pressable
                    onPress={() => void refreshServers()}
                    className="mt-2 rounded-lg bg-surface-panel px-3 py-2"
                  >
                    <Text className="text-foreground">Retry</Text>
                  </Pressable>
                </View>
              ) : channels.length === 0 ? (
                <Text className="text-sm text-muted-foreground">No channels available.</Text>
              ) : (
                channels.map((channel) => {
                  const active = currentChannel?.id === channel.id;
                  return (
                    <Pressable
                      key={channel.id}
                      onPress={() => handleSelectChannel(channel.id)}
                      className={`mb-2 rounded px-3 py-2 ${
                        active ? "bg-surface-panel" : "bg-transparent"
                      }`}
                    >
                      <Text className={active ? "text-foreground" : "text-muted-foreground"}>
                        {channel.kind === "voice" ? "🔊 " : "# "}
                        {channel.name}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
  
            <View className="flex-1 p-4">
              {currentChannel ? (
                <>
                  <Text className="text-lg font-semibold text-foreground">
                    {currentChannel.name}
                  </Text>
                  <Text className="mt-1 text-sm text-muted-foreground">
                    kind: {currentChannel.kind}
                  </Text>
                  <Text className="mt-1 text-xs text-muted-foreground opacity-80" selectable>
                    id: {currentChannel.id}
                  </Text>
                  <Text className="mt-4 text-sm text-muted-foreground">
                    Message timeline wiring is next.
                  </Text>
                </>
              ) : (
                <Text className="text-sm text-muted-foreground">Select a channel.</Text>
              )}
            </View>
          </View>
        ) : null}
  
        {phase === "missing" ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-center text-sm text-muted-foreground">
              This community is not in your list or you no longer have access.
            </Text>
            <Pressable
              onPress={() => void refreshServers()}
              className="mt-3 rounded-lg bg-surface-panel px-4 py-2"
            >
              <Text className="text-foreground">Retry</Text>
            </Pressable>
          </View>
        ) : null}
  
        {phase === "error" && errorMessage ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-center text-sm text-destructive">{errorMessage}</Text>
            <Pressable
              onPress={() => void refreshServers()}
              className="mt-3 rounded-lg bg-surface-panel px-4 py-2"
            >
              <Text className="text-foreground">Retry</Text>
            </Pressable>
          </View>
        ) : null}
  
        <Text className="pb-4 text-center text-xs text-muted-foreground opacity-80" selectable>
          id: {communityId}
        </Text>
      </View>
    </View>
  );
}