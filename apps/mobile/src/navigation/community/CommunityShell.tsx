import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Channel } from "@shared/lib/backend/types";
import {
  applyCommunityFocus,
  resolvePreferredChannelIdForServer,
  toChannel,
  toServerSummaries,
  useHavenCore,
} from "@shared/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, View } from "react-native";
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
import { HavenShell, type HavenShellHandle } from "@/navigation/HavenShell";
import { useUiStore } from "@shared/stores/uiStore";
import { DmInboxDrawer } from "@/features/direct-messages/DmInboxDrawer";
import { DmChatSurface } from "@/features/direct-messages/DmChatSurface";
import { DmTopBar } from "@/features/direct-messages/DmTopBar";

type Props = NativeStackScreenProps<MainStackParamList, "Community">;
type CommunityShellProps = Props & {
  onOpenProfile: () => void;
  onOpenProfileCard: (target: UserProfileModalTarget) => void;
  onOpenNotifications: () => void;
  onOpenFriends: () => void;
  onStartDirectMessage: (userId: string) => void;
  notificationsUnreadCount: number;
  inboxUnreadCount: number;
  friendRequestCount: number;
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
  onOpenFriends,
  onStartDirectMessage,
  notificationsUnreadCount,
  inboxUnreadCount,
  friendRequestCount,
  activeVoiceChannelId,
  voiceChannelParticipants,
  onSelectVoiceChannel,
  onOpenVoiceSession,
}: CommunityShellProps) {
  const serverId = route.params?.serverId ?? null;
  const openDrawerOnEnter = route.params?.openDrawer ?? !serverId;
  const pendingDmConversationId = route.params?.pendingDmConversationId;
  const core = useHavenCore();
  const dm = core.directMessages;
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode);

  const shellRef = useRef<HavenShellHandle>(null);

  // ── DM mode ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"community" | "dm">("community");

  const switchToDm = useCallback(() => {
    setMode("dm");
    setWorkspaceMode("dm");
  }, [setWorkspaceMode]);

  const switchToCommunity = useCallback(() => {
    setMode("community");
    setWorkspaceMode("community");
    shellRef.current?.setDrawerOpen(false);
  }, [setWorkspaceMode]);

  // Handle pendingDmConversationId from route params (push notifications / deep links).
  const handledDmConversationIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!pendingDmConversationId) return;
    if (handledDmConversationIdRef.current === pendingDmConversationId) return;
    handledDmConversationIdRef.current = pendingDmConversationId;
    void dm.openConversation(pendingDmConversationId, { markRead: true }).catch(() => {});
    switchToDm();
    shellRef.current?.setDrawerOpen(false);
    navigation.setParams({ pendingDmConversationId: undefined });
  }, [pendingDmConversationId, dm, switchToDm, navigation]);

  // Track drawer state locally — used by the DM back handler and the debug probe.
  const [drawerOpen, setDrawerOpen] = useState(openDrawerOnEnter || !serverId);

  const handleDrawerStateChange = useCallback((open: boolean) => {
    setDrawerOpen(open);
    void setLastCommunitySurface(open ? "drawer" : "chat");
  }, []);

  // Hardware back in DM mode (drawer closed) → switch back to community in-place.
  // HavenShell's own BackHandler fires first and handles "drawer open → close drawer".
  // This handler fires only when the drawer is already closed and we're in DM mode.
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

  const setCurrentChannelId = useCallback(
    (id: string | null) => {
      core.channels.setActiveChannelId(id);
    },
    [core],
  );

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

  // Sync drawer open state when route params (serverId / openDrawer) change.
  useEffect(() => {
    const shouldOpen = openDrawerOnEnter || !serverId;
    shellRef.current?.setDrawerOpen(shouldOpen);
  }, [openDrawerOnEnter, serverId]);

  // Navigate to a fallback community when the current serverId disappears from the list.
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
    shellRef.current?.setDrawerOpen(true);
  }, [
    communitiesLoading,
    core,
    navigation,
    serverId,
    servers,
  ]);

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
      shellRef.current?.setDrawerOpen(true);
    },
    [navigation],
  );

  const handleSelectChannel = useCallback(
    (channel: Channel) => {
      if (!serverId) return;
      setCurrentChannelId(channel.id);
      shellRef.current?.setDrawerOpen(false);
    },
    [serverId, setCurrentChannelId],
  );

  const handleSelectTextChannel = useCallback(
    (channelId: string) => {
      const ch = channels.find((c) => c.id === channelId);
      if (ch && ch.kind === "text") handleSelectChannel(ch);
    },
    [channels, handleSelectChannel],
  );

  const handleSelectCommunity = useCallback(
    (nextServerId: string) => {
      // Always switch back to community mode when selecting a server.
      if (mode === "dm") {
        setMode("community");
        setWorkspaceMode("community");
      }

      if (nextServerId === serverId) {
        shellRef.current?.setDrawerOpen(true);
        return;
      }

      applyCommunityFocus(core, nextServerId);
      navigation.setParams({
        serverId: nextServerId,
        openDrawer: true,
      });
      shellRef.current?.setDrawerOpen(true);
      void core.prepareCommunityEntry(nextServerId).catch((error) => {
        console.warn("[CommunityShell] prepare selected community failed", error);
        applyCommunityFocus(core, nextServerId);
      });
    },
    [core, mode, navigation, serverId, setWorkspaceMode],
  );

  return (
    <View className="flex-1 bg-background">
      <HavenShell
        ref={shellRef}
        hasContent={mode === "dm" ? true : Boolean(serverId)}
        openDrawerOnMount={openDrawerOnEnter || !serverId}
        onDrawerStateChange={handleDrawerStateChange}
        rail={
          <CommunityRail
            communities={servers}
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
            onOpenCommunityActions={openCommunityActions}
          />
        }
        drawerContent={
          mode === "dm" ? (
            <DmInboxDrawer
              onConversationSelected={() => shellRef.current?.setDrawerOpen(false)}
              onStartDirectMessage={onStartDirectMessage}
            />
          ) : (
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
          )
        }
        topBar={
          mode === "dm" ? (
            <DmTopBar onOpenDrawer={() => shellRef.current?.setDrawerOpen(true)} />
          ) : serverId ? (
            <CommunityTopBar
              communityName={community?.name ?? "Communities"}
              selectedChannelName={currentRenderableChannel?.name ?? "Select channel"}
              onPressCommunity={() => shellRef.current?.setDrawerOpen(true)}
              onPressChannel={() => shellRef.current?.setDrawerOpen(true)}
            />
          ) : null
        }
        chatContent={
          mode === "dm" ? (
            <DmChatSurface />
          ) : serverId ? (
            <CommunityChatScreen
              serverId={serverId}
              onOpenProfileCard={onOpenProfileCard}
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
