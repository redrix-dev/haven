import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHydrateMobileThemeFromProfile } from "@/hooks/useHydrateMobileThemeFromProfile";
import { CommunityEntry } from "@/navigation/community/CommunityEntry";
import { CommunityShell } from "@/navigation/community/CommunityShell";
import type { MainStackParamList, RootStackParamList } from "@/navigation/types";
import { NAV_THEME } from "@/lib/theme";
import { setMobileNavigationDelegate } from "@/lib/registerMobileAppHost";
import {
  bootstrapNotificationSoundSync,
  createNotificationSoundSyncState,
  requireHavenCore,
  resetNotificationSoundSyncState,
  syncFocusFromRoute,
  syncNotificationSounds,
  toChannel,
  toServerSummaries,
  useHavenCore,
} from "@shared/core";
import { MOBILE_DEFAULT_NOTIFICATION_AUDIO } from "@/constants/mobileNotificationAudioDefaults";
import { HavenFormSheet } from "@/components/HavenFormSheet";
import { HavenListSheet } from "@/components/HavenListSheet";
import { DirectMessagesContainer } from "@/features/direct-messages/DirectMessagesContainer";
import { FriendsModalContainer } from "@/features/friends/FriendsModalContainer";
import NotificationsContainer from "@/features/notifications/NotificationsContainer";
import UserSettingsContainer from "@/features/user-profile/UserSettingsContainer";
import { deleteOwnAccount, signOutFromAuth } from "@/auth/mobileAuthService";
import { useUiStore } from "@shared/stores/uiStore";
import { useAuthStore } from "@shared/stores/authStore";
import type { FriendsPanelTab } from "@shared/types/types";
import type { NotificationAudioSettings } from "@shared/types/settings";
import { useVoice } from "@shared/features/voice/hooks/useVoice";
import { resolveLiveAvatarUrl, resolveLiveUsername } from "@shared/lib/liveProfiles";
import { useMobilePushNotificationRouting } from "@/hooks/useMobilePushNotificationRouting";
import { useMobilePushNavigationStore } from "@/stores/mobilePushNavigationStore";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { resolveColorProp } from "@shared/themes";
import { countFilteredUnreadInInbox } from "@shared/features/notifications/inboxNotificationFilter";
import { VoiceJoinPromptSheet } from "@/features/voice/VoiceJoinPromptSheet";
import { VoiceReturnPill } from "@/features/voice/VoiceReturnPill";
import { VoiceSessionSheet } from "@/features/voice/VoiceSessionSheet";
import {
  loadSkipVoiceSwitchPrompt,
  saveSkipVoiceSwitchPrompt,
  useMobileVoiceSettings,
} from "@/features/voice/mobileVoicePreferences";
import { addVoiceNotificationOpenListener } from "@/features/voice/mobileVoiceForegroundService";
import { useMobileLiveKitVoiceSession } from "@/features/voice/useMobileLiveKitVoiceSession";

const Stack = createNativeStackNavigator<MainStackParamList>();

const mainStackScreenBackground = NAV_THEME.dark.colors.background;

/**
 * Bridges React Navigation imperative API into the shared AppHost so external
 * events (notification taps, deep links, access-revoked redirects) can move
 * the user without a navigation ref reaching into shared code.
 */
function MainNavigationDelegateBridge({
  onNavigateToDm,
}: {
  onNavigateToDm: (conversationId: string) => void;
}) {
  const navigation =
    useNavigation<NavigationProp<RootStackParamList>>();

  useEffect(() => {
    setMobileNavigationDelegate({
      navigateToCommunity: (serverId, channelId) => {
        try {
          requireHavenCore().communities.setActiveId(serverId);
          if (channelId) {
            requireHavenCore().channels.setActiveChannelId(channelId);
          }
        } catch {
          // HavenCore may not be ready during cold-start race; navigation alone is fine.
        }
        navigation.navigate("Main", {
          screen: "Community",
          params: { serverId },
        });
      },
      navigateToDm: (conversationId) => {
        onNavigateToDm(conversationId);
      },
    });
    return () => setMobileNavigationDelegate(null);
  }, [navigation, onNavigateToDm]);

  return null;
}

function MobileNotificationSoundSync({
  userId,
  audioSettings,
}: {
  userId: string;
  audioSettings: NotificationAudioSettings;
}) {
  const core = useHavenCore();
  const notificationItems = core.notifications.useNotifications();
  const soundSyncRef = useRef(createNotificationSoundSyncState());
  const audioRef = useRef(audioSettings);

  useEffect(() => {
    audioRef.current = audioSettings;
  }, [audioSettings]);

  useEffect(() => {
    if (!userId) {
      resetNotificationSoundSyncState(soundSyncRef.current);
      return;
    }
    void bootstrapNotificationSoundSync(core, soundSyncRef.current);
  }, [core, userId]);

  useEffect(() => {
    if (!userId || !soundSyncRef.current.bootstrapped) return;
    void syncNotificationSounds(core, audioRef.current, soundSyncRef.current).catch(
      (error) => {
        console.error("Failed to play notification sounds:", error);
      },
    );
  }, [core, notificationItems.length, userId]);

  return null;
}

function MainNavigationShell({ userId }: { userId: string }) {
  const navigation =
    useNavigation<NavigationProp<RootStackParamList>>();
  const core = useHavenCore();
  const dm = core.directMessages;
  const authUser = useAuthStore((s) => s.user);
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode);
  const notificationItems = core.notifications.useNotifications();
  const dmConversations = dm.useConversations();
  const currentServerId = core.communities.useActiveId();
  const currentChannelId = core.channels.useActiveChannelId();
  const activeCommunityChannels = core.channels.useChannels(currentServerId ?? "__none__");
  const channels = useMemo(
    () => activeCommunityChannels.map(toChannel),
    [activeCommunityChannels],
  );
  const setCurrentChannelId = useCallback(
    (id: string | null) => {
      core.channels.setActiveChannelId(id);
    },
    [core],
  );
  const viewerProfile = core.profiles.useViewerProfile(userId);
  const liveProfiles = core.profiles.useProfilesRecord();
  const orderedCommunities = core.communities.useOrderedCommunities();
  const servers = useMemo(
    () => toServerSummaries(orderedCommunities),
    [orderedCommunities],
  );
  useMobilePushNotificationRouting();

  useEffect(() => {
    void core.profiles.loadViewerProfile(userId).catch(() => {
      // The auth email fallback keeps voice usable if profile hydration fails.
    });
  }, [core.profiles, userId]);

  const currentUserIdentity = useMemo(() => {
    const email = authUser?.email ?? null;
    const fallbackName =
      viewerProfile?.username ?? email?.split("@")[0]?.trim() ?? "User";
    const displayName =
      resolveLiveUsername(liveProfiles, userId, fallbackName) ?? fallbackName;
    const avatarUrl =
      resolveLiveAvatarUrl(liveProfiles, userId, viewerProfile?.avatarUrl ?? null) ??
      viewerProfile?.avatarUrl ??
      null;

    return {
      id: userId,
      displayName,
      avatarUrl,
    };
  }, [authUser?.email, liveProfiles, userId, viewerProfile]);

  const notificationsUnreadCount = useMemo(
    () => countFilteredUnreadInInbox(notificationItems),
    [notificationItems],
  );
  const dmUnreadCount = useMemo(
    () =>
      dmConversations.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0,
      ),
    [dmConversations],
  );

  const mobileVoiceSettings = useMobileVoiceSettings();
  const voice = useVoice({
    currentServerId,
    currentUserId: userId,
    currentUserDisplayName: currentUserIdentity.displayName,
    currentUserAvatarUrl: currentUserIdentity.avatarUrl,
    currentChannelId,
    setCurrentChannelId,
    voiceHardwareDebugPanelEnabled: false,
    channels,
  });
  const voiceState = voice.state;
  const voiceDerived = voice.derived;
  const {
    cancelVoiceChannelJoinPrompt,
    confirmVoiceChannelJoin,
    disconnectVoiceSession,
    forceDisconnectVoice,
    requestVoiceChannelJoin,
    setVoiceControlActions,
  } = voice.actions;
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [interruptionNoticeVisible, setInterruptionNoticeVisible] = useState(false);
  const [skipVoiceSwitchPrompt, setSkipVoiceSwitchPrompt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadSkipVoiceSwitchPrompt().then((skip) => {
      if (!cancelled) setSkipVoiceSwitchPrompt(skip);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSkipVoiceSwitchPromptChange = useCallback((skip: boolean) => {
    setSkipVoiceSwitchPrompt(skip);
    void saveSkipVoiceSwitchPrompt(skip);
  }, []);

  const openVoiceSheet = useCallback(() => {
    setVoiceSheetOpen(true);
  }, []);

  useEffect(
    () => addVoiceNotificationOpenListener(openVoiceSheet),
    [openVoiceSheet],
  );

  const activeVoiceControllerChannel = useMemo(() => {
    const activeVoiceChannel = voiceDerived.activeVoiceChannel;
    if (!activeVoiceChannel) return null;
    return {
      communityId: activeVoiceChannel.community_id,
      channelId: activeVoiceChannel.id,
      channelName: activeVoiceChannel.name,
    };
  }, [voiceDerived.activeVoiceChannel]);

  const handleVoiceSessionError = useCallback(
    (message: string) => {
      Alert.alert("Voice connection failed", message);
      void disconnectVoiceSession({ triggerPaneLeave: false })
        .catch((error: unknown) => {
          console.warn("[voice] Failed to reset after session error.", error);
        });
    },
    [disconnectVoiceSession],
  );

  const handleVoiceKick = useCallback(() => {
    void forceDisconnectVoice("kicked")
      .then(() => {
        Alert.alert("Removed from voice", "You were removed from the voice channel.");
      })
      .catch((error: unknown) => {
        console.warn("[voice] Failed to disconnect after kick.", error);
      });
  }, [forceDisconnectVoice]);

  const handleVoiceInterrupted = useCallback(() => {
    setInterruptionNoticeVisible(true);
  }, []);

  const voiceController = useMobileLiveKitVoiceSession({
    activeChannel: activeVoiceControllerChannel,
    currentUserId: userId,
    currentUserDisplayName: currentUserIdentity.displayName,
    currentUserAvatarUrl: currentUserIdentity.avatarUrl,
    voiceSettings: mobileVoiceSettings.settings,
    onUpdateVoiceSettings: mobileVoiceSettings.updateVoiceSettingsPatch,
    onSessionError: handleVoiceSessionError,
    onVoiceKick: handleVoiceKick,
    onInterrupted: handleVoiceInterrupted,
  });

  const {
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
  } = voiceController.actions;

  useEffect(() => {
    setVoiceControlActions({
      join: () => {
        void joinVoiceChannel();
      },
      leave: () => {
        void leaveVoiceChannel();
      },
      toggleMute,
      toggleDeafen,
    });
    return () => setVoiceControlActions(null);
  }, [
    joinVoiceChannel,
    leaveVoiceChannel,
    setVoiceControlActions,
    toggleDeafen,
    toggleMute,
  ]);

  useEffect(() => {
    const prompt = voiceState.voiceJoinPrompt;
    if (prompt?.mode !== "switch" || !skipVoiceSwitchPrompt) return;
    void confirmVoiceChannelJoin().then(openVoiceSheet);
  }, [
    confirmVoiceChannelJoin,
    openVoiceSheet,
    skipVoiceSwitchPrompt,
    voiceState.voiceJoinPrompt,
  ]);

  const handleConfirmVoiceJoin = useCallback(() => {
    void confirmVoiceChannelJoin().then(openVoiceSheet);
  }, [confirmVoiceChannelJoin, openVoiceSheet]);

  const handleSelectVoiceChannel = useCallback(
    (channelId: string) => {
      if (channelId === voiceState.activeVoiceChannelId) {
        if (!voiceController.state.joined && !voiceController.state.joining) {
          void voiceController.actions.joinVoiceChannel();
        }
        openVoiceSheet();
        return;
      }
      requestVoiceChannelJoin(channelId);
    },
    [
      openVoiceSheet,
      requestVoiceChannelJoin,
      voiceState.activeVoiceChannelId,
      voiceController.actions,
      voiceController.state.joined,
      voiceController.state.joining,
    ],
  );

  const activeVoiceCommunityName = useMemo(() => {
    const communityId = voiceDerived.activeVoiceChannel?.community_id;
    if (!communityId) return null;
    return servers.find((server) => server.id === communityId)?.name ?? null;
  }, [servers, voiceDerived.activeVoiceChannel]);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const handleOpenSettings = useCallback(() => {
    setIsSettingsModalOpen(true);
  }, []);
  const handleCloseSettings = useCallback(() => {
    setIsSettingsModalOpen(false);
  }, []);

  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [notificationsSubScreen, setNotificationsSubScreen] = useState<
    "list" | "preferences" | "modmail"
  >("list");
  const handleOpenNotifications = useCallback(() => {
    setIsNotificationsModalOpen(true);
  }, []);
  const handleCloseNotifications = useCallback(() => {
    setNotificationsSubScreen("list");
    setIsNotificationsModalOpen(false);
  }, []);

  useEffect(() => {
    useUiStore.getState().setNotificationsPanelOpen(isNotificationsModalOpen);
    return () => {
      useUiStore.getState().setNotificationsPanelOpen(false);
    };
  }, [isNotificationsModalOpen]);

  const [isDirectMessagesModalOpen, setIsDirectMessagesModalOpen] = useState(false);
  const handleOpenDirectMessages = useCallback(() => {
    setWorkspaceMode("dm");
    setIsDirectMessagesModalOpen(true);
  }, [setWorkspaceMode]);
  const handleOpenDirectMessageConversation = useCallback(
    (conversationId: string) => {
      setWorkspaceMode("dm");
      setIsDirectMessagesModalOpen(true);
      void dm.openConversation(conversationId, { markRead: true });
    },
    [dm, setWorkspaceMode],
  );
  const handleCloseDirectMessages = useCallback(() => {
    setIsDirectMessagesModalOpen(false);
    setWorkspaceMode("community");
  }, [setWorkspaceMode]);

  const [isFriendsModalOpen, setIsFriendsModalOpen] = useState(false);
  const [friendsInitialTab, setFriendsInitialTab] = useState<FriendsPanelTab>("friends");
  const [friendsHighlightedRequestId, setFriendsHighlightedRequestId] =
    useState<string | null>(null);
  const handleOpenFriendsFromNotification = useCallback(
    (input: { tab: "requests" | "friends"; highlightedRequestId: string | null }) => {
      setFriendsInitialTab(input.tab === "requests" ? "requests" : "friends");
      setFriendsHighlightedRequestId(input.highlightedRequestId);
      setIsFriendsModalOpen(true);
    },
    [],
  );
  const handleCloseFriends = useCallback(() => {
    setIsFriendsModalOpen(false);
  }, []);

  const handleStartDmFromFriend = useCallback(
    (friendUserId: string) => {
      setIsFriendsModalOpen(false);
      setWorkspaceMode("dm");
      setIsDirectMessagesModalOpen(true);
      void dm.openWithUser(friendUserId);
    },
    [dm, setWorkspaceMode],
  );

  useEffect(() => {
    useMobilePushNavigationStore.getState().setHandlers({
      openDm: (conversationId) => {
        handleOpenDirectMessageConversation(conversationId);
      },
      openFriends: (input) => {
        handleOpenFriendsFromNotification(input);
      },
      openMention: (communityId, channelId) => {
        setWorkspaceMode("community");
        syncFocusFromRoute(core, { communityId, channelId });
        navigation.navigate("Main", {
          screen: "Community",
          params: { serverId: communityId, openDrawer: false },
        });
      },
      openNotifications: () => {
        setIsNotificationsModalOpen(true);
      },
      refreshUrgentSurfaces: () => {
        void dm.loadConversations();
        void core.social.load();
        void core.notifications.refreshInbox();
      },
    });

    return () => {
      useMobilePushNavigationStore.getState().setHandlers(null);
    };
  }, [
    core,
    dm,
    handleOpenDirectMessageConversation,
    handleOpenFriendsFromNotification,
    navigation,
    setWorkspaceMode,
  ]);

  return (
    <>
      <MainNavigationDelegateBridge
        onNavigateToDm={handleOpenDirectMessageConversation}
      />
      <View className="flex-1">
        <Stack.Navigator
          initialRouteName="CommunityEntry"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: mainStackScreenBackground },
          }}
        >
          <Stack.Screen name="CommunityEntry" component={CommunityEntry} />
          <Stack.Screen
            name="Community"
            options={{
              animation: "slide_from_right",
              gestureEnabled: true,
            }}
          >
            {(props) => (
              <CommunityShell
                {...props}
                onOpenProfile={handleOpenSettings}
                onOpenNotifications={handleOpenNotifications}
                onOpenInbox={handleOpenDirectMessages}
                notificationsUnreadCount={notificationsUnreadCount}
                inboxUnreadCount={dmUnreadCount}
                activeVoiceChannelId={voiceState.activeVoiceChannelId}
                voiceChannelParticipants={voiceDerived.voiceChannelParticipants}
                onSelectVoiceChannel={handleSelectVoiceChannel}
                onOpenVoiceSession={openVoiceSheet}
              />
            )}
          </Stack.Screen>
        </Stack.Navigator>
        {!voiceSheetOpen ? (
          <VoiceReturnPill state={voiceController.state} onPress={openVoiceSheet} />
        ) : null}
      </View>

      <HavenFormSheet
        visible={isSettingsModalOpen}
        onDismiss={handleCloseSettings}
        title="Settings"
      >
        <UserSettingsContainer
          onSignOut={async () => {
            await signOutFromAuth();
            handleCloseSettings();
          }}
          onDeleteAccount={async () => {
            await deleteOwnAccount();
            handleCloseSettings();
          }}
        />
      </HavenFormSheet>
      <HavenListSheet
        visible={isNotificationsModalOpen}
        onDismiss={handleCloseNotifications}
        bodyScrollable={false}
      >
        <NotificationsContainer
          subScreen={notificationsSubScreen}
          onSubScreenChange={setNotificationsSubScreen}
          modalVisible={isNotificationsModalOpen}
          onCloseModal={handleCloseNotifications}
          onOpenFriendsPanel={handleOpenFriendsFromNotification}
          onOpenDirectMessages={handleOpenDirectMessages}
        />
      </HavenListSheet>
      <HavenListSheet
        visible={isDirectMessagesModalOpen}
        onDismiss={handleCloseDirectMessages}
        title="Direct messages"
        bodyScrollable={false}
      >
        <DirectMessagesContainer />
      </HavenListSheet>
      <HavenListSheet
        visible={isFriendsModalOpen}
        onDismiss={handleCloseFriends}
        title="Friends"
        bodyScrollable={false}
      >
        <FriendsModalContainer
          visible={isFriendsModalOpen}
          userId={userId}
          initialTab={friendsInitialTab}
          highlightedRequestId={friendsHighlightedRequestId}
          onStartDirectMessage={handleStartDmFromFriend}
        />
      </HavenListSheet>
      <VoiceJoinPromptSheet
        prompt={voiceState.voiceJoinPrompt}
        currentChannelName={voiceDerived.activeVoiceChannel?.name ?? null}
        skipSwitchPrompt={skipVoiceSwitchPrompt}
        onSkipSwitchPromptChange={handleSkipVoiceSwitchPromptChange}
        onCancel={cancelVoiceChannelJoinPrompt}
        onConfirm={handleConfirmVoiceJoin}
      />
      <VoiceSessionSheet
        visible={voiceSheetOpen}
        communityName={activeVoiceCommunityName}
        currentUser={currentUserIdentity}
        voiceSettings={mobileVoiceSettings.settings}
        state={voiceController.state}
        actions={voiceController.actions}
        onDismiss={() => setVoiceSheetOpen(false)}
      />
      <HavenListSheet
        visible={interruptionNoticeVisible}
        onDismiss={() => setInterruptionNoticeVisible(false)}
        title="Voice paused"
      >
        <View className="gap-4">
          <Text className="text-sm leading-5 text-muted-foreground">
            We kept you connected to your friends but muted and deafened the voice session. You can unmute and undeafen whenever you're ready to be back in the conversation.
          </Text>
          <Pressable
            accessibilityRole="button"
            className="rounded-lg bg-primary px-4 py-3 active:bg-primary-hover"
            onPress={() => {
              setInterruptionNoticeVisible(false);
              setVoiceSheetOpen(true);
            }}
          >
            <Text className="text-center font-semibold text-primary-foreground">
              Return to voice
            </Text>
          </Pressable>
        </View>
      </HavenListSheet>
    </>
  );
}

export function MainNavigator() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const themeTokens = useMobileThemeTokens();
  const spinnerFg = resolveColorProp(themeTokens, "foreground") ?? "#e6edf7";
  useHydrateMobileThemeFromProfile(userId);

  if (!userId) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-app">
        <ActivityIndicator color={spinnerFg} size="large" />
      </View>
    );
  }

  return (
    <>
      <MobileNotificationSoundSync
        userId={userId}
        audioSettings={MOBILE_DEFAULT_NOTIFICATION_AUDIO}
      />
      <MainNavigationShell userId={userId} />
    </>
  );
}
