import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ServerSummary } from "@shared/lib/backend/types";
import { useServers } from "@shared/features/community/hooks/useServers";
import type { RootStackParamList } from "../navigation/types";

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
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, "Home">>();
  const { servers, status, error: loadError, refreshServers } = useServers();

  const width = Dimensions.get("window").width;
  const cell = (width - H_PAD * 2 - GAP * (COLS - 1)) / COLS;
  const tile = Math.max(cell - 24, 56);
  

  const items = buildGridItems(servers);

  const iconBtn = (
    name: keyof typeof Ionicons.glyphMap,
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      className="h-11 w-11 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
      onPress={onPress}
    >
      <Ionicons name={name} size={22} color="#e6edf7" />
    </Pressable>
  );

  if (status === "loading" && servers.length === 0) {
    return (
      <View className="flex-1 bg-surface-modal">
        <View
          className="border-b border-border-panel bg-surface-modal"
          style={{ paddingTop: insets.top + 8 }}
        >
          <View className="flex-row items-center justify-between px-3 pb-3">
            <View className="z-10 flex-row gap-2">
              {iconBtn("chevron-back", () => undefined)}
              {iconBtn("home", () => undefined)}
              {iconBtn("people", () => undefined)}
            </View>
            <Text className="absolute left-0 right-0 text-center text-lg font-semibold text-foreground">
              Haven
            </Text>
            <View className="z-10 flex-row gap-2">
              {iconBtn("notifications-outline", () => undefined)}
              {iconBtn("chatbubble-outline", () => undefined)}
              {iconBtn("cog-outline", () =>
                navigation.navigate("SettingsPlaceholder"),
              )}
            </View>
          </View>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e6edf7" size="large" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-modal">
      <View
        className="border-b border-border-panel bg-surface-modal"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center justify-between px-3 pb-3">
          <View className="z-10 flex-row gap-2">
            {iconBtn("chevron-back", () => undefined)}
            {iconBtn("home", () => undefined)}
            {iconBtn("people", () => undefined)}
          </View>
          <Text className="absolute left-0 right-0 text-center text-lg font-semibold text-foreground">
            Haven
          </Text>
          <View className="z-10 flex-row gap-2">
            {iconBtn("notifications-outline", () => undefined)}
            {iconBtn("chatbubble-outline", () => undefined)}
            {iconBtn("cog-outline", () =>
              navigation.navigate("SettingsPlaceholder"),
            )}
          </View>
        </View>
      </View>

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
        refreshing={status === "loading"}
        onRefresh={() => void refreshServers()}
        renderItem={({ item }) => {
          if (item.kind === "server") {
            const initial = item.server.name.trim().charAt(0).toUpperCase() || "?";
            return (
              <View style={{ width: cell }}>
                <Pressable
                  style={{ height: cell }}
                  className="items-center justify-center rounded-2xl bg-surface-panel active:bg-surface-hover"
                  onPress={() =>
                    navigation.navigate("Community", {
                      communityId: item.server.id,
                    })
                  }
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
                  onPress={() => navigation.navigate("CreatePlaceholder")}
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
                onPress={() => navigation.navigate("JoinPlaceholder")}
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
    </View>
  );
}
