import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MainStackParamList } from "@/navigation/types";
import { perfTrace } from "@shared/debug/perfTrace";
import { myCommunities } from "@shared/collections/communities/selectors";
import { answered, NOT_REQUESTED } from "@shared/collections/kit/requests";
import { useHavenCore, useStore } from "@mobile-data";
import { getLastCommunitySurface } from "@/storage/communitySurfacePrefs";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { resolveColorProp } from "@shared/themes";

type Props = NativeStackScreenProps<MainStackParamList, "CommunityEntry">;

/**
 * Where the app opens: the community the person was last in, else their
 * first, else the community list. What the device kept shows at once; with
 * nothing kept, it waits for the first load of the person's communities.
 */
export function CommunityEntry({ navigation }: Props) {
  const core = useHavenCore();
  const phase = useStore("core", (s) => s.phase);
  const communities = useStore("communities", myCommunities);
  const mine = useStore("communities", (s) => s.requests.mine ?? NOT_REQUESTED);
  const loaded = useStore("communities", (s) => answered(s.requests, "mine"));
  const themeTokens = useMobileThemeTokens();
  const spinnerFg = resolveColorProp(themeTokens, "foreground") ?? "#e6edf7";
  const routedRef = useRef(false);

  useEffect(() => {
    if (routedRef.current || phase === "signed_out") return;
    if (communities.length === 0 && !loaded) return;
    routedRef.current = true;

    void perfTrace.measure("community-entry", async () => {
      const place = core.stores.session.getState().place;
      const kept =
        place?.kind === "community" &&
        communities.some((c) => c.id === place.community_id)
          ? place.community_id
          : null;
      const target = kept ?? communities[0]?.id ?? null;
      if (!target) {
        navigation.replace("Community", { serverId: null, openDrawer: true });
        return;
      }
      void core.openCommunity(target);
      const lastSurface = kept ? await getLastCommunitySurface() : null;
      perfTrace.mark("community-entry.navigate", { serverId: target });
      navigation.replace("Community", {
        serverId: target,
        openDrawer: lastSurface !== "chat",
      });
    });
  }, [communities, core, loaded, navigation, phase]);

  if (mine.error && communities.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-surface-app px-8">
        <Text className="text-center text-base font-semibold text-foreground">
          Could not load communities.
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          Check your connection and try again.
        </Text>
        <Pressable
          accessibilityRole="button"
          className="rounded-xl bg-primary px-5 py-2.5 active:bg-primary-hover"
          onPress={() => void core.communities.loadMine()}
        >
          <Text className="font-semibold text-primary-foreground">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-surface-app">
      <ActivityIndicator color={spinnerFg} size="large" />
    </View>
  );
}
