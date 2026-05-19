import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Text,
  TextInput,
  View,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { normalizeInviteCode } from "@shared/features/community/utils/inviteCode";
import type { ServerSummary } from "@shared/lib/backend/types";
import { getControlPlaneBackend } from "@shared/lib/backend";
import { getPlatformInviteInputPlaceholder } from "@shared/infrastructure/platform/urls";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { applyCommunityNavigationTarget } from "@shared/features/community/communityNavigation";
import { useMobileMainSession } from "@/contexts/MobileMainSessionContext";
import { getLastTextChannelIdForCommunity } from "@/storage/communityChannelPrefs";
import { useMemo, useState, useCallback } from "react";
import { HavenFormSheet } from "@/components/HavenFormSheet";
import type { MainStackParamList } from "@/navigation/types";
import { resolveColorProp } from "@shared/themes";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";

type GridItem =
  | { kind: "server"; server: ServerSummary }
  | { kind: "create" }
  | { kind: "join" };

const COLS = 4;
const H_PAD = 16;
const GAP = 8;
function buildGridItems(servers: ServerSummary[]): GridItem[] {
  return [
    ...servers.map((server) => ({ kind: "server" as const, server })),
    { kind: "create" as const },
    { kind: "join" as const },
  ];
}


export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const {
    servers,
    serversStatus: status,
    serversError: loadError,
    refreshServers,
    createServer,
    warmCommunityForEntry,
  } = useMobileMainSession();
  const controlPlaneBackend = useMemo(() => getControlPlaneBackend(), []);
  const themeTokens = useMobileThemeTokens();
  const { placeholderMuted, spinnerFg } = useMemo(
    () => ({
      placeholderMuted: resolveColorProp(themeTokens, "text-dim") ?? "#8e8e93",
      spinnerFg: resolveColorProp(themeTokens, "foreground") ?? "#e6edf7",
    }),
    [themeTokens],
  );

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinInvite, setJoinInvite] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const width = Dimensions.get("window").width;
  const cell = (width - H_PAD * 2 - GAP * (COLS - 1)) / COLS;

  const items = buildGridItems(servers);

  const openCommunityForServer = useCallback(
    async (serverId: string) => {
      await Promise.race([
        warmCommunityForEntry(serverId),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 350);
        }),
      ]);
      const lastVisited = await getLastTextChannelIdForCommunity(serverId);
      applyCommunityNavigationTarget(serverId, { lastVisitedChannelId: lastVisited });
      navigation.navigate("Community", { serverId, openDrawer: true });
    },
    [navigation, warmCommunityForEntry],
  );

  const primeCommunityForServer = useCallback(
    (serverId: string) => {
      void warmCommunityForEntry(serverId);
    },
    [warmCommunityForEntry],
  );

  const handleCreateCommunity = useCallback(async () => {
    const name = createName.trim();
    if (!name) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      const { id } = await createServer(name);
      setCreateModalOpen(false);
      setCreateName("");
      await warmCommunityForEntry(id);
      applyCommunityNavigationTarget(id);
      navigation.navigate("Community", { serverId: id, openDrawer: true });
    } catch (err) {
      setCreateError(getErrorMessage(err, "Could not create community."));
    } finally {
      setCreateLoading(false);
    }
  }, [createName, createServer, navigation, warmCommunityForEntry]);

  const handleJoinCommunity = useCallback(async () => {
    const code = normalizeInviteCode(joinInvite);
    if (!code) {
      setJoinError("Enter an invite code or paste an invite link.");
      return;
    }
    setJoinLoading(true);
    setJoinError(null);
    try {
      const redeemed = await controlPlaneBackend.redeemCommunityInvite(code);
      await refreshServers();
      setJoinModalOpen(false);
      setJoinInvite("");
      const communityId = redeemed.communityId;
      await warmCommunityForEntry(communityId);
      applyCommunityNavigationTarget(communityId);
      navigation.navigate("Community", {
        serverId: communityId,
        openDrawer: true,
      });
    } catch (err) {
      setJoinError(getErrorMessage(err, "Failed to join from invite."));
    } finally {
      setJoinLoading(false);
    }
  }, [controlPlaneBackend, joinInvite, navigation, refreshServers, warmCommunityForEntry]);

  if (status === "loading" && servers.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-modal">
        <ActivityIndicator color={spinnerFg} size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-modal">
      {loadError ? (
        <Text className="px-4 pt-4 text-center text-sm text-destructive">{loadError}</Text>
      ) : null}

      <FlatList
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: H_PAD,
          paddingTop: insets.top + GAP * 2,
          paddingBottom: insets.bottom + 24,
        }}
        columnWrapperStyle={{ gap: GAP, marginBottom: GAP }}
        data={items}
        keyExtractor={(item, index) =>
          item.kind === "server" ? item.server.id : `${item.kind}-${index}`
        }
        numColumns={COLS}
        refreshing={status === "loading" && servers.length > 0}
        onRefresh={() => void refreshServers()}
        renderItem={({ item }) => {
          if (item.kind === "server") {
            const initial = item.server.name.trim().charAt(0).toUpperCase() || "?";
            return (
              <View style={{ width: cell }}>
                <Pressable
                  style={{ height: cell }}
                  className="items-center justify-center rounded-2xl bg-surface-panel active:bg-surface-hover"
                  onPressIn={() => primeCommunityForServer(item.server.id)}
                  onPress={() => openCommunityForServer(item.server.id)}
                >
                  <Text className="text-3xl font-bold text-foreground">{initial}</Text>
                </Pressable>
                <Text
                  className="mt-1 text-center text-xs text-muted-foreground"
                  numberOfLines={1}
                >
                  {item.server.name}
                </Text>
              </View>
            );
          }
          if (item.kind === "create") {
            return (
              <View style={{ width: cell }}>
                <Pressable
                  style={{ height: cell }}
                  className="items-center justify-center rounded-2xl border-2 border-dashed border-border-control bg-transparent active:bg-surface-embedded"
                  onPress={() => setCreateModalOpen(true)}
                >
                  <Text className="text-3xl font-light text-foreground">+</Text>
                </Pressable>
                <Text
                  className="mt-1 text-center text-xs text-muted-foreground"
                  numberOfLines={1}
                >
                  Create
                </Text>
              </View>
            );
          }
          return (
            <View style={{ width: cell }}>
              <Pressable
                style={{ height: cell }}
                className="items-center justify-center rounded-2xl border-2 border-dashed border-border-control bg-transparent active:bg-surface-embedded"
                onPress={() => setJoinModalOpen(true)}
              >
                <Text className="text-3xl font-light text-foreground">#</Text>
              </Pressable>
              <Text
                className="mt-1 text-center text-xs text-muted-foreground"
                numberOfLines={1}
              >
                Join
              </Text>
            </View>
          );
        }}
      />

      <HavenFormSheet
        visible={createModalOpen}
        onDismiss={() => {
          setCreateModalOpen(false);
          setCreateError(null);
        }}
        title="Create community"
      >
        <View className="mt-2 gap-4">
          <Text className="text-sm text-muted-foreground">
            Give your community a name. You can change it later in settings.
          </Text>
          <View>
            <Text className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
              Community name
            </Text>
            <TextInput
              value={createName}
              onChangeText={setCreateName}
              placeholder="My community"
              placeholderTextColor={placeholderMuted}
              editable={!createLoading}
              className="rounded-xl border border-border bg-surface-panel px-3 py-3 text-base text-foreground"
              autoCapitalize="words"
            />
          </View>
          {createError ? <Text className="text-sm text-destructive">{createError}</Text> : null}
          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={() => {
                setCreateModalOpen(false);
                setCreateError(null);
              }}
              disabled={createLoading}
              className="py-2 active:opacity-80"
            >
              <Text className="text-base text-muted-foreground">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleCreateCommunity()}
              disabled={createLoading || !createName.trim()}
              className={`rounded-xl bg-primary px-5 py-2.5 ${createLoading || !createName.trim() ? "opacity-45" : ""}`}
            >
              <Text className="text-center font-semibold text-primary-foreground">
                {createLoading ? "Creating…" : "Create"}
              </Text>
            </Pressable>
          </View>
        </View>
      </HavenFormSheet>
      <HavenFormSheet
        visible={joinModalOpen}
        onDismiss={() => {
          setJoinModalOpen(false);
          setJoinError(null);
        }}
        title="Join community"
      >
        <View className="mt-2 gap-4">
          <Text className="text-sm text-muted-foreground">
            Paste an invite code or invite link to join.
          </Text>
          <View>
            <Text className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
              Invite
            </Text>
            <TextInput
              value={joinInvite}
              onChangeText={setJoinInvite}
              placeholder={getPlatformInviteInputPlaceholder()}
              placeholderTextColor={placeholderMuted}
              editable={!joinLoading}
              autoCapitalize="characters"
              autoCorrect={false}
              className="rounded-xl border border-border bg-surface-panel px-3 py-3 text-base text-foreground"
            />
          </View>
          {joinError ? <Text className="text-sm text-destructive">{joinError}</Text> : null}
          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={() => {
                setJoinModalOpen(false);
                setJoinError(null);
              }}
              disabled={joinLoading}
              className="py-2 active:opacity-80"
            >
              <Text className="text-base text-muted-foreground">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleJoinCommunity()}
              disabled={joinLoading || !joinInvite.trim()}
              className={`rounded-xl bg-primary px-5 py-2.5 ${joinLoading || !joinInvite.trim() ? "opacity-45" : ""}`}
            >
              <Text className="text-center font-semibold text-primary-foreground">
                {joinLoading ? "Joining…" : "Join"}
              </Text>
            </Pressable>
          </View>
        </View>
      </HavenFormSheet>
    </View>
  );
}
