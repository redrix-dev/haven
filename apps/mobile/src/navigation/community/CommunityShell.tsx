import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Channel } from "@shared/lib/backend/types";
import {
  useMobileCommunityWorkspace,
  useMobileServersFromSession,
} from "@/contexts/MobileMainSessionContext";
import { applyCommunityNavigationTarget } from "@shared/features/community/communityNavigation";
import { useNavigationStore } from "@shared/stores/navigationStore";
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
import { setLastTextChannelIdForCommunity } from "@/storage/communityChannelPrefs";
import { CommunityChatScreen } from "@/screens/main/CommunityChatScreen";
import type { MainStackParamList } from "@/navigation/types";
import { CommunityChannelDrawer } from "@/navigation/community/CommunityChannelDrawer";
import { CommunityTopBar } from "@/navigation/community/CommunityTopBar";
import { useDataCacheComponentProbe } from "@shared/debug";

const DRAWER_WIDTH = Math.min(320, Dimensions.get("window").width * 0.86);
const DRAWER_TIMING = { duration: 220, easing: Easing.out(Easing.cubic) };
const EDGE_WIDTH = 28;

type Props = NativeStackScreenProps<MainStackParamList, "Community">;

export function CommunityShell({ route, navigation }: Props) {
  const { serverId, openDrawer: openDrawerOnEnter = false } = route.params;
  const setCurrentChannelId = useNavigationStore((state) => state.setCurrentChannelId);
  const [drawerOpen, setDrawerOpen] = useState(openDrawerOnEnter);
  const drawerOffset = useSharedValue(openDrawerOnEnter ? 0 : -DRAWER_WIDTH);
  const dragStartOffset = useSharedValue(0);

  useEffect(() => {
    const nav = useNavigationStore.getState();
    if (nav.currentServerId === serverId && nav.currentChannelId) return;
    applyCommunityNavigationTarget(serverId);
  }, [serverId]);

  const { servers } = useMobileServersFromSession();
  const {
    state: { channels },
    derived: { currentRenderableChannel },
  } = useMobileCommunityWorkspace();

  const community = useMemo(
    () => servers.find((s) => s.id === serverId) ?? null,
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
      setDrawerOpen(open);
      drawerOffset.value = withTiming(open ? 0 : -DRAWER_WIDTH, DRAWER_TIMING);
    },
    [drawerOffset],
  );

  useEffect(() => {
    if (openDrawerOnEnter) {
      setDrawerOpen(true);
      drawerOffset.value = 0;
    }
  }, [drawerOffset, openDrawerOnEnter]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (drawerOpen) {
        setDrawerOpenAnimated(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [drawerOpen, setDrawerOpenAnimated]);

  const handleSelectChannel = useCallback(
    async (channel: Channel) => {
      setCurrentChannelId(channel.id);
      await setLastTextChannelIdForCommunity(serverId, channel.id);
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

  const panGesture = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-12, 12])
    .onStart(() => {
      dragStartOffset.value = drawerOffset.value;
    })
    .onUpdate((event) => {
      const next = dragStartOffset.value + event.translationX;
      drawerOffset.value = Math.min(0, Math.max(-DRAWER_WIDTH, next));
    })
    .onEnd((event) => {
      const projected = drawerOffset.value + event.velocityX * 0.12;
      const shouldOpen = projected > -DRAWER_WIDTH / 2;
      runOnJS(setDrawerOpenAnimated)(shouldOpen);
    });

  const edgeOpenGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart(() => {
      dragStartOffset.value = drawerOffset.value;
    })
    .onUpdate((event) => {
      if (event.translationX <= 0) return;
      const next = dragStartOffset.value + event.translationX;
      drawerOffset.value = Math.min(0, Math.max(-DRAWER_WIDTH, next));
    })
    .onEnd((event) => {
      const projected = drawerOffset.value + event.velocityX * 0.12;
      const shouldOpen = projected > -DRAWER_WIDTH / 2;
      runOnJS(setDrawerOpenAnimated)(shouldOpen);
    });

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerOffset.value }],
  }));

  const scrimStyle = useAnimatedStyle(() => {
    const progress = 1 + drawerOffset.value / DRAWER_WIDTH;
    return { opacity: progress * 0.45 };
  });

  const mainShiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerOffset.value + DRAWER_WIDTH }],
  }));

  return (
    <View className="flex-1 bg-background">
      <CommunityTopBar
        communityName={community?.name ?? "Community"}
        selectedChannelName={currentRenderableChannel?.name ?? "Select channel"}
        onPressCommunity={() => setDrawerOpenAnimated(true)}
        onPressChannel={() => setDrawerOpenAnimated(true)}
      />

      <View className="flex-1 overflow-hidden">
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: DRAWER_WIDTH,
              zIndex: 2,
            },
            drawerStyle,
          ]}
        >
          <CommunityChannelDrawer
            communityName={community?.name ?? "Community"}
            channels={channels}
            selectedChannelId={currentRenderableChannel?.id ?? null}
            onSelectTextChannel={handleSelectTextChannel}
            onPressAllCommunities={() => navigation.goBack()}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View className="flex-1" style={mainShiftStyle}>
            <CommunityChatScreen serverId={serverId} />

            <Animated.View
              pointerEvents={drawerOpen ? "auto" : "none"}
              style={[
                {
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  backgroundColor: "#000",
                },
                scrimStyle,
              ]}
            >
              <Pressable className="flex-1" onPress={() => setDrawerOpenAnimated(false)} />
            </Animated.View>
          </Animated.View>
        </GestureDetector>

        {!drawerOpen ? (
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
    </View>
  );
}
