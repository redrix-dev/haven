import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";
import { myCommunities } from "@shared/collections/communities/selectors";
import { communityChannels } from "@shared/collections/channels/selectors";
import { answered } from "@shared/collections/kit/requests";
import { useHavenCore, useStore } from "@mobile-data";
import { CommunityChatScreen } from "@/screens/main/CommunityChatScreen";
import type { MainStackParamList } from "@/navigation/types";
import { CommunityChannelDrawer } from "@/navigation/community/CommunityChannelDrawer";
import { CommunityTopBar } from "@/navigation/community/CommunityTopBar";
import { CommunityRail } from "./CommunityRail";
import { CommunityActionSheets } from "./CommunityActionSheets";
import { setLastCommunitySurface } from "@/storage/communitySurfacePrefs";
import { HavenShell, type HavenShellHandle } from "@/navigation/HavenShell";
import { DmInboxDrawer } from "@/features/direct-messages/DmInboxDrawer";
import { DmChatSurface } from "@/features/direct-messages/DmChatSurface";
import { DmTopBar } from "@/features/direct-messages/DmTopBar";

type Props = NativeStackScreenProps<MainStackParamList, "Community">;
type CommunityShellProps = Props & {
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  onOpenFriends: () => void;
  notificationsUnreadCount: number;
  inboxUnreadCount: number;
  friendRequestCount: number;
  activeVoiceChannelId: string | null;
  onSelectVoiceChannel: (channelId: string) => void;
  onOpenVoiceSession: () => void;
};

/**
 * The community surface: the rail of communities, the drawer of channels (or
 * conversations), and the open chat. The route says which community; the
 * session store says which channel is open there (`core.openChannel`), and
 * opening a community goes back to the channel last open in it.
 */
export function CommunityShell({
  route,
  navigation,
  onOpenProfile,
  onOpenNotifications,
  onOpenFriends,
  notificationsUnreadCount,
  inboxUnreadCount,
  friendRequestCount,
  activeVoiceChannelId,
  onSelectVoiceChannel,
  onOpenVoiceSession,
}: CommunityShellProps) {
  const serverId = route.params?.serverId ?? null;
  const openDrawerOnEnter = route.params?.openDrawer ?? !serverId;
  const pendingDmConversationId = route.params?.pendingDmConversationId;
  const core = useHavenCore();
  const shellRef = useRef<HavenShellHandle>(null);

  const communities = useStore("communities", myCommunities);
  const communitiesLoaded = useStore("communities", (s) =>
    answered(s.requests, "mine"),
  );
  const community = useStore("communities", (s) =>
    serverId ? (s.byId[serverId] ?? null) : null,
  );
  const channels = useStore("channels", (s) =>
    serverId ? communityChannels(s, serverId) : [],
  );
  const openChannelId = useStore("session", (s) =>
    s.place?.kind === "community" && s.place.community_id === serverId
      ? s.place.channel_id
      : null,
  );

  // ── DM mode ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"community" | "dm">("community");

  const switchToDm = useCallback(() => setMode("dm"), []);

  const switchToCommunity = useCallback(() => {
    setMode("community");
    if (serverId) void core.openCommunity(serverId);
    shellRef.current?.setDrawerOpen(false);
  }, [core, serverId]);

  // A conversation opened from a push or a link.
  const handledDmConversationIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!pendingDmConversationId) return;
    if (handledDmConversationIdRef.current === pendingDmConversationId) return;
    handledDmConversationIdRef.current = pendingDmConversationId;
    void core.openConversation(pendingDmConversationId);
    setMode("dm");
    shellRef.current?.setDrawerOpen(false);
    navigation.setParams({ pendingDmConversationId: undefined });
  }, [core, navigation, pendingDmConversationId]);

  const [drawerOpen, setDrawerOpen] = useState(openDrawerOnEnter || !serverId);
  const [drawerGestureNonce, setDrawerGestureNonce] = useState(0);

  const handleDrawerGestureStart = useCallback(() => {
    setDrawerGestureNonce((value) => value + 1);
  }, []);

  const handleDrawerStateChange = useCallback((open: boolean) => {
    setDrawerOpen(open);
    void setLastCommunitySurface(open ? "drawer" : "chat");
  }, []);

  // Hardware back in DM mode (drawer closed) → back to the community.
  // HavenShell's own handler closes an open drawer first.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (mode === "dm" && !drawerOpen) {
        switchToCommunity();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [mode, drawerOpen, switchToCommunity]);

  // The route's community is the one open. Only the id is a dependency:
  // opening writes the session store, which this does not read.
  useEffect(() => {
    if (mode !== "community") return;
    if (!serverId) {
      core.session.goHome();
      return;
    }
    const place = core.stores.session.getState().place;
    if (place?.kind === "community" && place.community_id === serverId) return;
    void core.openCommunity(serverId);
  }, [core, mode, serverId]);

  // A community with no channel open opens its first text channel.
  useEffect(() => {
    if (mode !== "community" || !serverId) return;
    const open = channels.find((c) => c.id === openChannelId);
    if (open?.kind === "text") return;
    const first = channels.find((c) => c.kind === "text");
    if (first) void core.openChannel(serverId, first.id);
  }, [channels, core, mode, openChannelId, serverId]);

  // Sync drawer open state when route params (serverId / openDrawer) change.
  useEffect(() => {
    shellRef.current?.setDrawerOpen(openDrawerOnEnter || !serverId);
  }, [openDrawerOnEnter, serverId]);

  // The route's community is gone (left, removed, deleted): go to another.
  useEffect(() => {
    if (!serverId || !communitiesLoaded) return;
    if (communities.some((c) => c.id === serverId)) return;
    navigation.setParams({
      serverId: communities[0]?.id ?? null,
      openDrawer: true,
    });
    shellRef.current?.setDrawerOpen(true);
  }, [communities, communitiesLoaded, navigation, serverId]);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [communityActionsOpen, setCommunityActionsOpen] = useState(false);

  // An invite link opens the join sheet pre-filled; joining stays a tap.
  // `seq` re-fills the sheet when the same invite is opened again.
  const pendingInviteCode = route.params?.pendingInviteCode;
  const [joinPrefill, setJoinPrefill] = useState<{
    code: string;
    seq: number;
  } | null>(null);
  useEffect(() => {
    if (!pendingInviteCode) return;
    setJoinPrefill((prev) => ({
      code: pendingInviteCode,
      seq: (prev?.seq ?? 0) + 1,
    }));
    setCommunityActionsOpen(false);
    setCreateOpen(false);
    setJoinOpen(true);
    navigation.setParams({ pendingInviteCode: undefined });
  }, [navigation, pendingInviteCode]);

  const handleCommunityReady = useCallback(
    (communityId: string) => {
      setMode("community");
      navigation.setParams({ serverId: communityId, openDrawer: true });
      shellRef.current?.setDrawerOpen(true);
    },
    [navigation],
  );

  const handleSelectTextChannel = useCallback(
    (channelId: string) => {
      if (!serverId) return;
      void core.openChannel(serverId, channelId);
      shellRef.current?.setDrawerOpen(false);
    },
    [core, serverId],
  );

  const handleSelectCommunity = useCallback(
    (nextServerId: string) => {
      setMode("community");
      if (nextServerId === serverId) {
        void core.openCommunity(nextServerId);
        shellRef.current?.setDrawerOpen(true);
        return;
      }
      navigation.setParams({ serverId: nextServerId, openDrawer: true });
      shellRef.current?.setDrawerOpen(true);
    },
    [core, navigation, serverId],
  );

  const openChannel = channels.find((c) => c.id === openChannelId) ?? null;

  return (
    <View className="flex-1 bg-background">
      <HavenShell
        ref={shellRef}
        hasContent={mode === "dm" ? true : Boolean(serverId)}
        openDrawerOnMount={openDrawerOnEnter || !serverId}
        onDrawerGestureStart={handleDrawerGestureStart}
        onDrawerStateChange={handleDrawerStateChange}
        rail={
          <CommunityRail
            communities={communities}
            activeCommunityId={serverId}
            onSelectCommunity={handleSelectCommunity}
            onOpenProfile={onOpenProfile}
            onOpenNotifications={onOpenNotifications}
            onOpenFriends={onOpenFriends}
            onOpenInbox={switchToDm}
            notificationsUnreadCount={notificationsUnreadCount}
            inboxUnreadCount={inboxUnreadCount}
            friendRequestCount={friendRequestCount}
            isDmActive={mode === "dm"}
            onOpenCommunityActions={() => setCommunityActionsOpen(true)}
          />
        }
        drawerContent={
          mode === "dm" ? (
            <DmInboxDrawer
              onConversationSelected={() =>
                shellRef.current?.setDrawerOpen(false)
              }
            />
          ) : (
            <CommunityChannelDrawer
              serverId={serverId}
              selectedChannelId={openChannelId}
              activeVoiceChannelId={activeVoiceChannelId}
              onSelectTextChannel={handleSelectTextChannel}
              onSelectVoiceChannel={onSelectVoiceChannel}
              onOpenVoiceSession={onOpenVoiceSession}
              onCreateCommunity={() => setCreateOpen(true)}
              onJoinCommunity={() => setJoinOpen(true)}
            />
          )
        }
        topBar={
          mode === "dm" ? (
            <DmTopBar
              onOpenDrawer={() => shellRef.current?.setDrawerOpen(true)}
            />
          ) : serverId ? (
            <CommunityTopBar
              communityName={community?.name ?? "Communities"}
              selectedChannelName={openChannel?.name ?? "Select channel"}
              onPressCommunity={() => shellRef.current?.setDrawerOpen(true)}
              onPressChannel={() => shellRef.current?.setDrawerOpen(true)}
            />
          ) : null
        }
        chatContent={
          mode === "dm" ? (
            <DmChatSurface />
          ) : serverId && openChannel?.kind === "text" ? (
            <CommunityChatScreen
              communityId={serverId}
              channelId={openChannel.id}
              drawerGestureNonce={drawerGestureNonce}
            />
          ) : (
            <View className="flex-1 bg-background" />
          )
        }
      />
      <CommunityActionSheets
        actionsOpen={communityActionsOpen}
        createOpen={createOpen}
        joinOpen={joinOpen}
        joinPrefill={joinPrefill}
        onCloseActions={() => setCommunityActionsOpen(false)}
        onChooseCreate={() => {
          setCommunityActionsOpen(false);
          setCreateOpen(true);
        }}
        onChooseJoin={() => {
          setCommunityActionsOpen(false);
          setJoinOpen(true);
        }}
        onCloseCreate={() => setCreateOpen(false)}
        onCloseJoin={() => setJoinOpen(false)}
        onCommunityReady={handleCommunityReady}
      />
    </View>
  );
}
