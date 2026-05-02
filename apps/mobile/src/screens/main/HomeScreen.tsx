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
import { normalizeInviteCode } from "@shared/app/chat-app/inviteCode";
import type { ServerSummary } from "@shared/lib/backend/types";
import { getControlPlaneBackend } from "@shared/lib/backend";
import { getPlatformInviteInputPlaceholder } from "@shared/platform/urls";
import { getErrorMessage } from "@platform/lib/errors";
import { useServers } from "@shared/features/community/hooks/useServers";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useMemo, useState, useCallback } from "react";
import { HavenModalShell } from "@/components/HavenModalShell";
import type { RootStackParamList } from "@/navigation/types";

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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { servers, status, error: loadError, refreshServers, createServer } = useServers();
  const controlPlaneBackend = useMemo(() => getControlPlaneBackend(), []);

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
    (serverId: string) => {
      useNavigationStore.getState().setCurrentServerId(serverId);
      navigation.navigate("Main", { screen: "Community" });
    },
    [navigation],
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
      useNavigationStore.getState().setCurrentServerId(id);
      navigation.navigate("Main", { screen: "Community" });
    } catch (err) {
      setCreateError(getErrorMessage(err, "Could not create community."));
    } finally {
      setCreateLoading(false);
    }
  }, [createName, createServer, navigation]);

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
      useNavigationStore.getState().setCurrentServerId(redeemed.communityId);
      navigation.navigate("Main", { screen: "Community" });
    } catch (err) {
      setJoinError(getErrorMessage(err, "Failed to join from invite."));
    } finally {
      setJoinLoading(false);
    }
  }, [controlPlaneBackend, joinInvite, navigation, refreshServers]);

  if (status === "loading" && servers.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-modal">
        <ActivityIndicator color="#e6edf7" size="large" />
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
          paddingTop: GAP * 2,
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

      <HavenModalShell
        variant="settings"
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
              placeholderTextColor="#8e8e93"
              editable={!createLoading}
              className="rounded-xl border border-border bg-surface-panel px-3 py-3 text-base text-foreground"
              autoCapitalize="words"
            />
          </View>
          {createError ? (
            <Text className="text-sm text-red-400">{createError}</Text>
          ) : null}
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
              <Text className="text-center font-semibold text-white">
                {createLoading ? "Creating…" : "Create"}
              </Text>
            </Pressable>
          </View>
        </View>
      </HavenModalShell>
      <HavenModalShell
        variant="settings"
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
              placeholderTextColor="#8e8e93"
              editable={!joinLoading}
              autoCapitalize="characters"
              autoCorrect={false}
              className="rounded-xl border border-border bg-surface-panel px-3 py-3 text-base text-foreground"
            />
          </View>
          {joinError ? <Text className="text-sm text-red-400">{joinError}</Text> : null}
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
              <Text className="text-center font-semibold text-white">
                {joinLoading ? "Joining…" : "Join"}
              </Text>
            </Pressable>
          </View>
        </View>
      </HavenModalShell>
    </View>
  );
}
