import { useCallback, useMemo } from "react";
import { FlatList, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "@shared/stores/authStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useServers } from "@shared/features/community/hooks/useServers";
import type { ServerSummary } from "@shared/lib/backend/types";
import { Spinner } from "@/components/ui/spinner";
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import type { Rev2CommunityStackParamList } from "@/haven-rev2/navigation/types";

type Nav = NativeStackNavigationProp<Rev2CommunityStackParamList>;

export function Rev2CommunityListScreen() {
  const navigation = useNavigation<Nav>();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const setCurrentServerId = useNavigationStore((s) => s.setCurrentServerId);
  const setCurrentChannelId = useNavigationStore((s) => s.setCurrentChannelId);

  const { servers, status, error: serversError, loading: serversLoading } = useServers();

  const sortedServers = useMemo(
    () => [...servers].sort((a, b) => a.name.localeCompare(b.name)),
    [servers],
  );

  const onSelectCommunity = useCallback(
    (server: ServerSummary) => {
      setCurrentServerId(server.id);
      setCurrentChannelId(null);
      navigation.navigate("Rev2CommunityHost");
    },
    [navigation, setCurrentChannelId, setCurrentServerId],
  );

  const renderItem = useCallback(
    ({ item }: { item: ServerSummary }) => (
      <Pressable
        onPress={() => onSelectCommunity(item)}
        className="border-b border-border py-3 active:bg-surface-hover"
      >
        <Text className="text-base text-foreground">{item.name}</Text>
      </Pressable>
    ),
    [onSelectCommunity],
  );

  if (!currentUserId) {
    return (
      <Box className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-center text-muted-foreground">Sign in to see your communities.</Text>
      </Box>
    );
  }

  if (serversLoading && servers.length === 0) {
    return (
      <Box className="flex-1 items-center justify-center bg-background">
        <Spinner colorClassName="accent-foreground" />
      </Box>
    );
  }

  return (
    <Box className="min-h-0 flex-1 bg-background px-4 pt-2">
      {serversError ? (
        <Text className="mb-2 text-sm text-red-400">{serversError}</Text>
      ) : null}
      <Text className="mb-3 text-sm text-muted-foreground">Choose a community to open channels and chat.</Text>
      <FlatList
        data={sortedServers}
        keyExtractor={(s) => s.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text className="py-8 text-center text-muted-foreground">
            {status === "loading" ? "Loading communities…" : "No communities yet."}
          </Text>
        }
      />
    </Box>
  );
}
