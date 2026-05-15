import { useCallback, useLayoutEffect, useMemo } from "react";
import { FlatList, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "@shared/stores/authStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useCommunityWorkspace } from "@shared/features/community/hooks/useCommunityWorkspace";
import { useServers } from "@shared/features/community/hooks/useServers";
import type { Channel } from "@shared/lib/backend/types";
import { Spinner } from "@/components/ui/spinner";
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import type { Rev2CommunityStackParamList } from "@/haven-rev2/navigation/types";

type Nav = NativeStackNavigationProp<Rev2CommunityStackParamList>;

export function Rev2CommunityHostScreen() {
  const navigation = useNavigation<Nav>();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const communityId = useNavigationStore((s) => s.currentServerId);
  const setCurrentChannelId = useNavigationStore((s) => s.setCurrentChannelId);

  const { servers, status, error: serversError, loading: serversLoading } = useServers();
  const {
    state: { channels, channelsLoading, channelsError },
    derived: { currentRenderableChannel },
  } = useCommunityWorkspace({ servers, currentUserId, autoSelectFirstServer: false });

  const data = useMemo(() => channels.filter((c) => c.kind === "text" || c.kind === "voice"), [channels]);

  const communityName = useMemo(
    () => (communityId ? servers.find((s) => s.id === communityId)?.name ?? null : null),
    [communityId, servers],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: communityName ?? "Channels",
    });
  }, [communityName, navigation]);

  const onSelectChannel = useCallback(
    (channel: Channel) => {
      if (!communityId) return;
      setCurrentChannelId(channel.id);
      navigation.navigate("Rev2ChannelThread");
    },
    [communityId, navigation, setCurrentChannelId],
  );

  const renderItem = useCallback(
    ({ item }: { item: Channel }) => (
      <Pressable
        onPress={() => onSelectChannel(item)}
        className="border-b border-border py-3 active:bg-surface-hover"
      >
        <Text className="text-base text-foreground"># {item.name}</Text>
        <Text className="text-xs text-muted-foreground">{item.kind}</Text>
      </Pressable>
    ),
    [onSelectChannel],
  );

  if (!communityId) {
    return (
      <Box className="min-h-0 flex-1 items-center justify-center bg-background px-6">
        <Text className="mb-4 text-center text-muted-foreground">Pick a community first.</Text>
        <Pressable
          onPress={() => navigation.navigate("Rev2CommunityList")}
          className="rounded-xl bg-primary px-5 py-3 active:opacity-90"
        >
          <Text className="text-center text-sm font-semibold text-primary-foreground">Browse communities</Text>
        </Pressable>
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
      {channelsError ? (
        <Text className="mb-2 text-sm text-red-400">{channelsError}</Text>
      ) : null}
      {currentRenderableChannel ? (
        <Text className="mb-2 text-xs text-muted-foreground">
          Open thread: #{currentRenderableChannel.name}
        </Text>
      ) : null}
      {channelsLoading && data.length === 0 ? (
        <Spinner colorClassName="accent-foreground" />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text className="py-8 text-center text-muted-foreground">No channels yet.</Text>
          }
        />
      )}
    </Box>
  );
}
