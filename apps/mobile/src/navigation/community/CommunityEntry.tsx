import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MainStackParamList } from "@/navigation/types";
import {
  applyCommunityFocus,
  resolveCommunityEntrypointTarget,
  toServerSummaries,
  useBootstrapPhase,
  useHavenCore,
} from "@shared/core";
import { useAuthStore } from "@shared/stores/authStore";
import { getLastCommunitySurface } from "@/storage/communitySurfacePrefs";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { resolveColorProp } from "@shared/themes";

type Props = NativeStackScreenProps<MainStackParamList, "CommunityEntry">;

export function CommunityEntry({ navigation }: Props) {
  const core = useHavenCore();
  const bootstrapPhase = useBootstrapPhase();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const communities = core.communities.useOrderedCommunities();
  const communitiesLoading = core.communities.useIsLoading();
  const loadError = core.communities.useLoadError();
  const themeTokens = useMobileThemeTokens();
  const spinnerFg = resolveColorProp(themeTokens, "foreground") ?? "#e6edf7";
  const routedRef = useRef(false);

  useEffect(() => {
    if (routedRef.current) return;
    if (bootstrapPhase.phase !== "ready") return;
    if (communitiesLoading && communities.length === 0) return;

    routedRef.current = true;
    const routeToCommunity = async () => {
      const servers = toServerSummaries(communities);
      if (servers.length === 0) {
        navigation.replace("Community", { serverId: null, openDrawer: true });
        return;
      }

      const activeCommunityId = core.communities.getActiveId();
      const target = resolveCommunityEntrypointTarget({
        activeCommunityId,
        communityIds: servers.map((server) => server.id),
      });
      const targetCommunityId = target.communityId;

      if (!targetCommunityId) {
        navigation.replace("Community", { serverId: null, openDrawer: true });
        return;
      }

      try {
        await core.prepareCommunityEntry(targetCommunityId);
        await core.warmCommunitySurface(targetCommunityId);
      } catch (error) {
        console.warn("[CommunityEntry] prepareCommunityEntry failed", error);
        applyCommunityFocus(core, targetCommunityId);
      }

      if (userId) {
        await core.warmSessionSurfaces(userId);
      }

      const lastSurface = target.restoredActiveCommunity
        ? await getLastCommunitySurface()
        : null;
      navigation.replace("Community", {
        serverId: targetCommunityId,
        openDrawer: lastSurface !== "chat",
      });
    };

    void routeToCommunity();
  }, [bootstrapPhase.phase, communities, communitiesLoading, core, navigation, userId]);

  if (bootstrapPhase.phase === "error" || loadError) {
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
          onPress={() => {
            routedRef.current = false;
            if (userId) void core.refreshCommunities(userId);
          }}
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
