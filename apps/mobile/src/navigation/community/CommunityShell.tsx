import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Channel } from "@shared/lib/backend/types";
import {
  applyCommunityFocus,
  resolvePreferredChannelIdForServer,
  toChannel,
  toServerSummaries,
  useHavenCore,
} from "@shared/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Dimensions, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { CommunityChatScreen } from "@/screens/main/CommunityChatScreen";
import type { UserProfileModalTarget } from "@/features/user-profile/UserProfileModal";
import type { MainStackParamList } from "@/navigation/types";
import { CommunityChannelDrawer } from "@/navigation/community/CommunityChannelDrawer";
import { CommunityTopBar } from "@/navigation/community/CommunityTopBar";
import { useDataCacheComponentProbe } from "@shared/debug";
import { CommunityRail } from "./CommunityRail";
import { CommunityActionSheets } from "./CommunityActionSheets";
import { setLastCommunitySurface } from "@/storage/communitySurfacePrefs";
import { useAuthStore } from "@shared/stores/authStore";
import type { VoiceSidebarParticipant } from "@shared/types/types";

const CHANNEL_DRAWER_WIDTH = Math.min(
  320,
  Dimensions.get("window").width * 0.86,
);
const RAIL_WIDTH = 72;
const DRAWER_SURFACE_WIDTH = RAIL_WIDTH + CHANNEL_DRAWER_WIDTH;
const DRAWER_TIMING = { duration: 220, easing: Easing.out(Easing.cubic) };
const EDGE_WIDTH = 28;

type Props = NativeStackScreenProps<MainStackParamList, "Community">;
type CommunityShellProps = Props & {
  onOpenProfile: () => void;
  onOpenProfileCard: (target: UserProfileModalTarget) => void;
  onOpenNotifications: () => void;
  onOpenInbox: () => void;
  notificationsUnreadCount: number;
  inboxUnreadCount: number;
  activeVoiceChannelId: string | null;
  voiceChannelParticipants: Record<string, VoiceSidebarParticipant[]>;
  onSelectVoiceChannel: (channelId: string) => void;
  onOpenVoiceSession: () => void;
};

export function CommunityShell({
  route,
  navigation,
  onOpenProfile,
  onOpenProfileCard,
  onOpenNotifications,
  onOpenInbox,
  notificationsUnreadCount,
  inboxUnreadCount,
  activeVoiceChannelId,
  voiceChannelParticipants,
  onSelectVoiceChannel,
  onOpenVoiceSession,
}: CommunityShellProps) {
  const serverId = route.params?.serverId ?? null;
  const openDrawerOnEnter = route.params?.openDrawer ?? !serverId;
  const core = useHavenCore();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const setCurrentChannelId = useCallback(
    (id: string | null) => {
      core.channels.setActiveChannelId(id);
    },
    [core],
  );
  const [drawerOpen, setDrawerOpen] = useState(openDrawerOnEnter);
  const drawerOffset = useSharedValue(
    openDrawerOnEnter ? 0 : -DRAWER_SURFACE_WIDTH,
  );
  const dragStartOffset = useSharedValue(0);

  useEffect(() => {
    if (!serverId) {
      core.communities.setActiveId(null);
      core.channels.setActiveChannelId(null);
      return;
    }
    const activeCommunityId = core.communities.getActiveId();
    const activeChannelId = core.channels.getActiveChannelId();
    if (activeCommunityId === serverId && activeChannelId) return;
    applyCommunityFocus(core, serverId);
  }, [core, serverId]);

  const nexusCommunities = core.communities.useOrderedCommunities();
  const communitiesLoading = core.communities.useIsLoading();
  const servers = useMemo(
    () => toServerSummaries(nexusCommunities),
    [nexusCommunities],
  );
  const currentChannelId = core.channels.useActiveChannelId();
  const havenChannels = core.channels.useChannels(serverId ?? "__empty__");
  const channels = useMemo(() => havenChannels.map(toChannel), [havenChannels]);

  useEffect(() => {
    if (!serverId) return;
    void core.channels.ensureLoaded(serverId).catch((error) => {
      console.warn("[CommunityShell] ensureLoaded failed", error);
    });
    void core.ensureCommunityPermissions(serverId).catch((error) => {
      console.warn("[CommunityShell] ensureCommunityPermissions failed", error);
    });
  }, [core, serverId]);

  useEffect(() => {
    if (!serverId) return;
    if (channels.length === 0) return;
    const valid =
      currentChannelId != null &&
      channels.some((channel) => channel.id === currentChannelId);
    if (valid) return;
    const preferred = resolvePreferredChannelIdForServer(
      core,
      serverId,
      channels,
      { previousChannelId: currentChannelId },
    );
    core.communities.setActiveId(serverId);
    core.channels.setActiveChannelId(preferred);
  }, [channels, core, currentChannelId, serverId]);

  const currentChannel = useMemo(
    () => channels.find((channel) => channel.id === currentChannelId) ?? null,
    [channels, currentChannelId],
  );
  const currentChannelBelongsToCurrentServer = Boolean(
    serverId && currentChannel && currentChannel.community_id === serverId,
  );
  const currentRenderableChannel = useMemo(
    () =>
      currentChannel &&
      currentChannelBelongsToCurrentServer &&
      currentChannel.kind === "text"
        ? currentChannel
        : (channels.find(
            (channel) =>
              channel.kind === "text" && channel.community_id === serverId,
          ) ?? (currentChannelBelongsToCurrentServer ? currentChannel : null)),
    [channels, currentChannel, currentChannelBelongsToCurrentServer, serverId],
  );

  const community = useMemo(
    () => (serverId ? servers.find((s) => s.id === serverId) ?? null : null),
    [serverId, servers],
  );

  useDataCacheComponentProbe("CommunityShell", {
    routeServerId: serverId,
    channelsCount: channels.length,
    selectedChannelId: currentRenderableChannel?.id ?? null,
    drawerOpen,
    communityName: community?.name ?? null,
  });

  const setDrawerOpenAnimated = useCallback(
    (open: boolean) => {
      if (!serverId && !open) return;
      setDrawerOpen(open);
      void setLastCommunitySurface(open ? "drawer" : "chat");
      drawerOffset.value = withTiming(
        open ? 0 : -DRAWER_SURFACE_WIDTH,
        DRAWER_TIMING,
      );
    },
    [drawerOffset, serverId],
  );

  useEffect(() => {
    const shouldOpen = openDrawerOnEnter || !serverId;
    setDrawerOpen(shouldOpen);
    void setLastCommunitySurface(shouldOpen ? "drawer" : "chat");
    drawerOffset.value = withTiming(
      shouldOpen ? 0 : -DRAWER_SURFACE_WIDTH,
      DRAWER_TIMING,
    );
  }, [drawerOffset, openDrawerOnEnter, serverId]);

  useEffect(() => {
    if (!serverId || communitiesLoading) return;
    if (servers.some((server) => server.id === serverId)) return;

    const fallbackId = servers[0]?.id ?? null;
    if (fallbackId) {
      navigation.setParams({ serverId: fallbackId, openDrawer: true });
      void core.prepareCommunityEntry(fallbackId).catch((error) => {
        console.warn("[CommunityShell] prepare fallback failed", error);
        applyCommunityFocus(core, fallbackId);
      });
    } else {
      core.communities.setActiveId(null);
      core.channels.setActiveChannelId(null);
      navigation.setParams({ serverId: null, openDrawer: true });
    }
    setDrawerOpenAnimated(true);
  }, [
    communitiesLoading,
    core,
    navigation,
    serverId,
    servers,
    setDrawerOpenAnimated,
  ]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (drawerOpen) {
        if (serverId) setDrawerOpenAnimated(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [drawerOpen, serverId, setDrawerOpenAnimated]);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [communityActionsOpen, setCommunityActionsOpen] = useState(false);
  const openCommunityActions = useCallback(() => setCommunityActionsOpen(true), []);
  const closeCommunityActions = useCallback(() => setCommunityActionsOpen(false), []);
  const openCreateCommunity = useCallback(() => setCreateOpen(true), []);
  const openJoinCommunity = useCallback(() => setJoinOpen(true), []);
  const chooseCreateCommunity = useCallback(() => {
    setCommunityActionsOpen(false);
    setCreateOpen(true);
  }, []);
  const chooseJoinCommunity = useCallback(() => {
    setCommunityActionsOpen(false);
    setJoinOpen(true);
  }, []);

  const handleCommunityReady = useCallback(
    (communityId: string) => {
      navigation.setParams({ serverId: communityId, openDrawer: true });
      setDrawerOpenAnimated(true);
    },
    [navigation, setDrawerOpenAnimated],
  );

  const handleSelectChannel = useCallback(
    async (channel: Channel) => {
      if (!serverId) return;
      setCurrentChannelId(channel.id);
      await setLastCommunitySurface("chat");
      setDrawerOpenAnimated(false);
    },
    [serverId, setCurrentChannelId, setDrawerOpenAnimated],
  );

  const handleSelectTextChannel = useCallback(
    (channelId: string) => {
      const ch = channels.find((c) => c.id === channelId);
      if (ch && ch.kind === "text") void handleSelectChannel(ch);
    },
    [channels, handleSelectChannel],
  );

  const handleSelectCommunity = useCallback(
    (nextServerId: string) => {
      if (nextServerId === serverId) {
        setDrawerOpenAnimated(true);
        return;
      }

      applyCommunityFocus(core, nextServerId);
      navigation.setParams({
        serverId: nextServerId,
        openDrawer: true,
      });
      setDrawerOpenAnimated(true);
      void core.prepareCommunityEntry(nextServerId).catch((error) => {
        console.warn("[CommunityShell] prepare selected community failed", error);
        applyCommunityFocus(core, nextServerId);
      });
    },
    [core, navigation, serverId, setDrawerOpenAnimated],
  );

  const panGesture = Gesture.Pan()
    .enabled(Boolean(serverId))
    .activeOffsetX([-18, 18])
    .failOffsetY([-12, 12])
    .onStart(() => {
      dragStartOffset.value = drawerOffset.value;
    })
    .onUpdate((event) => {
      const next = dragStartOffset.value + event.translationX;
      drawerOffset.value = Math.min(0, Math.max(-DRAWER_SURFACE_WIDTH, next));
    })
    .onEnd((event) => {
      const projected = drawerOffset.value + event.velocityX * 0.12;
      const shouldOpen = projected > -DRAWER_SURFACE_WIDTH / 2;
      runOnJS(setDrawerOpenAnimated)(shouldOpen);
    });

  const edgeOpenGesture = Gesture.Pan()
    .enabled(Boolean(serverId))
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart(() => {
      dragStartOffset.value = drawerOffset.value;
    })
    .onUpdate((event) => {
      if (event.translationX <= 0) return;
      const next = dragStartOffset.value + event.translationX;
      drawerOffset.value = Math.min(0, Math.max(-DRAWER_SURFACE_WIDTH, next));
    })
    .onEnd((event) => {
      const projected = drawerOffset.value + event.velocityX * 0.12;
      const shouldOpen = projected > -DRAWER_SURFACE_WIDTH / 2;
      runOnJS(setDrawerOpenAnimated)(shouldOpen);
    });

  const drawerCloseGesture = Gesture.Pan()
    .enabled(Boolean(serverId && drawerOpen))
    .activeOffsetX([-18, 18])
    .failOffsetY([-12, 12])
    .onStart(() => {
      dragStartOffset.value = drawerOffset.value;
    })
    .onUpdate((event) => {
      if (event.translationX > 0) return;
      const next = dragStartOffset.value + event.translationX;
      drawerOffset.value = Math.min(0, Math.max(-DRAWER_SURFACE_WIDTH, next));
    })
    .onEnd((event) => {
      const projected = drawerOffset.value + event.velocityX * 0.12;
      const shouldOpen =
        event.velocityX > -350 && projected > -DRAWER_SURFACE_WIDTH / 2;
      runOnJS(setDrawerOpenAnimated)(shouldOpen);
    });

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerOffset.value }],
  }));

  const scrimStyle = useAnimatedStyle(() => {
    const progress = Math.max(
      0,
      Math.min(1, 1 + drawerOffset.value / DRAWER_SURFACE_WIDTH),
    );
    return { opacity: progress * 0.45 };
  });

  const mainShiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerOffset.value + DRAWER_SURFACE_WIDTH }],
  }));

  return (
    <View className="flex-1 bg-background">
      <View className="flex-1 overflow-hidden">
        <GestureDetector gesture={drawerCloseGesture}>
          <Animated.View
            style={[
              {
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: DRAWER_SURFACE_WIDTH,
                zIndex: 2,
                flexDirection: "row",
              },
              drawerStyle,
            ]}
          >
            <CommunityRail
              communities={servers}
              activeCommunityId={serverId}
              onSelectCommunity={handleSelectCommunity}
              onOpenProfile={onOpenProfile}
              onOpenNotifications={onOpenNotifications}
              onOpenInbox={onOpenInbox}
              notificationsUnreadCount={notificationsUnreadCount}
              inboxUnreadCount={inboxUnreadCount}
              onOpenCommunityActions={openCommunityActions}
            />
            <View style={{ width: CHANNEL_DRAWER_WIDTH }}>
              <CommunityChannelDrawer
                serverId={serverId}
                communityName={community?.name ?? "Communities"}
                channels={channels}
                selectedChannelId={currentRenderableChannel?.id ?? null}
                activeVoiceChannelId={activeVoiceChannelId}
                voiceChannelParticipants={voiceChannelParticipants}
                onSelectTextChannel={handleSelectTextChannel}
                onSelectVoiceChannel={onSelectVoiceChannel}
                onOpenVoiceSession={onOpenVoiceSession}
                onCreateCommunity={openCreateCommunity}
                onJoinCommunity={openJoinCommunity}
              />
            </View>
          </Animated.View>
        </GestureDetector>

        <GestureDetector gesture={panGesture}>
          <Animated.View className="flex-1" style={mainShiftStyle}>
            {serverId ? (
              <CommunityTopBar
                communityName={community?.name ?? "Communities"}
                selectedChannelName={currentRenderableChannel?.name ?? "Select channel"}
                onPressCommunity={() => setDrawerOpenAnimated(true)}
                onPressChannel={() => setDrawerOpenAnimated(true)}
              />
            ) : null}

            {serverId ? (
              <CommunityChatScreen
                serverId={serverId}
                onOpenProfileCard={onOpenProfileCard}
              />
            ) : (
              <View className="flex-1 bg-background" />
            )}

            <Animated.View
              pointerEvents={drawerOpen ? "auto" : "none"}
              style={[
                {
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0, 0, 0, 1)",
                },
                scrimStyle,
              ]}
            >
              <Pressable
                className="flex-1"
                onPress={() => setDrawerOpenAnimated(false)}
              />
            </Animated.View>
          </Animated.View>
        </GestureDetector>

        {!drawerOpen && serverId ? (
          <GestureDetector gesture={edgeOpenGesture}>
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: EDGE_WIDTH,
                zIndex: 3,
              }}
            />
          </GestureDetector>
        ) : null}
      </View>
      <CommunityActionSheets
        actionsOpen={communityActionsOpen}
        createOpen={createOpen}
        joinOpen={joinOpen}
        userId={userId}
        onCloseActions={closeCommunityActions}
        onChooseCreate={chooseCreateCommunity}
        onChooseJoin={chooseJoinCommunity}
        onCloseCreate={() => setCreateOpen(false)}
        onCloseJoin={() => setJoinOpen(false)}
        onCommunityReady={handleCommunityReady}
      />
    </View>
  );
}
