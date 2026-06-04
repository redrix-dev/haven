import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHydrateMobileThemeFromProfile } from "@/hooks/useHydrateMobileThemeFromProfile";
import { CommunityEntry } from "@/navigation/community/CommunityEntry";
import { CommunityShell } from "@/navigation/community/CommunityShell";
import type {
  MainStackParamList,
  RootStackParamList,
} from "@/navigation/types";
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
import { FriendsModalContainer } from "@/features/friends/FriendsModalContainer";
import UserProfileModal, {
  type UserProfileModalTarget,
} from "@/features/user-profile/UserProfileModal";
import { useUiStore } from "@shared/stores/uiStore";
import { useAuthStore } from "@shared/stores/authStore";
import type {
  FriendsPanelTab,
  VoiceSidebarParticipant,
} from "@shared/types/types";
import type { NotificationAudioSettings } from "@shared/types/settings";
import { useVoice } from "@shared/features/voice/hooks/useVoice";
import {
  type LiveProfilesRecord,
  resolveLiveAvatarUrl,
  resolveLiveUsername,
} from "@shared/lib/liveProfiles";
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
import { HavenListSheet } from "@/components/HavenListSheet";
import { NotificationsScreen } from "@/screens/main/NotificationsScreen";
import { ProfileScreen } from "@/screens/main/ProfileScreen";
import { SettingsScreen } from "@/screens/main/SettingsScreen";

const Stack = createNativeStackNavigator<MainStackParamList>();

const mainStackScreenBackground = NAV_THEME.dark.colors.background;
const VOICE_PROMPT_CLOSE_DELAY_MS = 380;

function logVoiceJoinPromptTiming(
  label: string,
  details?: Record<string, unknown>,
): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.info("[voice:join]", label, details ?? {});
}

type VoiceParticipantIdentity = {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
};

function enrichVoiceParticipant<T extends VoiceParticipantIdentity>(
  participant: T,
  liveProfiles: LiveProfilesRecord,
): T {
  const displayName =
    resolveLiveUsername(liveProfiles, participant.userId, participant.displayName) ??
    participant.displayName;
  const avatarUrl =
    resolveLiveAvatarUrl(
      liveProfiles,
      participant.userId,
      participant.avatarUrl ?? null,
    ) ??
    participant.avatarUrl ??
    null;

  if (
    displayName === participant.displayName &&
    avatarUrl === (participant.avatarUrl ?? null)
  ) {
    return participant;
  }

  return { ...participant, displayName, avatarUrl };
}

function enrichVoiceParticipantRecord(
  participantsByChannelId: Record<string, VoiceSidebarParticipant[]>,
  liveProfiles: LiveProfilesRecord,
): Record<string, VoiceSidebarParticipant[]> {
  return Object.fromEntries(
    Object.entries(participantsByChannelId).map(([channelId, participants]) => [
      channelId,
      participants.map((participant) =>
        enrichVoiceParticipant(participant, liveProfiles),
      ),
    ]),
  );
}

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
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

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
    void syncNotificationSounds(
      core,
      audioRef.current,
      soundSyncRef.current,
    ).catch((error) => {
      console.error("Failed to play notification sounds:", error);
    });
  }, [core, notificationItems.length, userId]);

  return null;
}

function MainNavigationShell({ userId }: { userId: string }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const core = useHavenCore();
  const dm = core.directMessages;
  const authUser = useAuthStore((s) => s.user);
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode);
  const notificationItems = core.notifications.useNotifications();
  const dmConversations = dm.useConversations();
  const socialCounts = core.social.useCounts();
  const currentServerId = core.communities.useActiveId();
  const currentChannelId = core.channels.useActiveChannelId();
  const activeCommunityChannels = core.channels.useChannels(
    currentServerId ?? "__none__",
  );
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
    void core.profiles.ensureViewerProfile(userId).catch(() => {
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
      resolveLiveAvatarUrl(
        liveProfiles,
        userId,
        viewerProfile?.avatarUrl ?? null,
      ) ??
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
  const [interruptionNoticeVisible, setInterruptionNoticeVisible] =
    useState(false);
  const [skipVoiceSwitchPrompt, setSkipVoiceSwitchPrompt] = useState(false);
  const voiceSheetOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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
    if (voiceSheetOpenTimeoutRef.current) {
      clearTimeout(voiceSheetOpenTimeoutRef.current);
      voiceSheetOpenTimeoutRef.current = null;
    }
    setVoiceSheetOpen(true);
  }, []);

  const openVoiceSheetAfterPromptClose = useCallback(() => {
    if (voiceSheetOpenTimeoutRef.current) {
      clearTimeout(voiceSheetOpenTimeoutRef.current);
    }
    voiceSheetOpenTimeoutRef.current = setTimeout(() => {
      voiceSheetOpenTimeoutRef.current = null;
      setVoiceSheetOpen(true);
    }, VOICE_PROMPT_CLOSE_DELAY_MS);
  }, []);

  const clearPendingVoiceSheetOpen = useCallback(() => {
    if (!voiceSheetOpenTimeoutRef.current) return;
    clearTimeout(voiceSheetOpenTimeoutRef.current);
    voiceSheetOpenTimeoutRef.current = null;
  }, []);

  const closeVoiceSheet = useCallback(() => {
    clearPendingVoiceSheetOpen();
    setVoiceSheetOpen(false);
  }, [clearPendingVoiceSheetOpen]);

  useEffect(() => {
    return () => {
      if (voiceSheetOpenTimeoutRef.current) {
        clearTimeout(voiceSheetOpenTimeoutRef.current);
      }
    };
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
  const activeVoiceControllerChannelKey = activeVoiceControllerChannel
    ? `${activeVoiceControllerChannel.communityId}:${activeVoiceControllerChannel.channelId}`
    : null;

  const handleVoiceSessionError = useCallback(
    (message: string) => {
      closeVoiceSheet();
      Alert.alert("Voice connection failed", message);
      void disconnectVoiceSession({ triggerPaneLeave: false }).catch(
        (error: unknown) => {
          console.warn("[voice] Failed to reset after session error.", error);
        },
      );
    },
    [closeVoiceSheet, disconnectVoiceSession],
  );

  const handleVoiceKick = useCallback(() => {
    closeVoiceSheet();
    void forceDisconnectVoice("kicked")
      .then(() => {
        Alert.alert(
          "Removed from voice",
          "You were removed from the voice channel.",
        );
      })
      .catch((error: unknown) => {
        console.warn("[voice] Failed to disconnect after kick.", error);
      });
  }, [closeVoiceSheet, forceDisconnectVoice]);

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

  const { joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleDeafen } =
    voiceController.actions;

  const handleLeaveVoiceSession = useCallback(() => {
    closeVoiceSheet();
    void (async () => {
      try {
        await leaveVoiceChannel();
      } catch (error: unknown) {
        console.warn("[voice] Failed to stop mobile voice transport.", error);
      }
      try {
        await disconnectVoiceSession({ triggerPaneLeave: false });
      } catch (error: unknown) {
        console.warn("[voice] Failed to clear voice session state.", error);
      }
    })();
  }, [closeVoiceSheet, disconnectVoiceSession, leaveVoiceChannel]);

  useEffect(() => {
    if (!activeVoiceControllerChannelKey) {
      setVoiceControlActions(null);
      return;
    }

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
    activeVoiceControllerChannelKey,
    joinVoiceChannel,
    leaveVoiceChannel,
    setVoiceControlActions,
    toggleDeafen,
    toggleMute,
  ]);

  useEffect(() => {
    const prompt = voiceState.voiceJoinPrompt;
    if (prompt?.mode !== "switch" || !skipVoiceSwitchPrompt) return;
    void confirmVoiceChannelJoin().then(openVoiceSheetAfterPromptClose);
  }, [
    confirmVoiceChannelJoin,
    openVoiceSheetAfterPromptClose,
    skipVoiceSwitchPrompt,
    voiceState.voiceJoinPrompt,
  ]);

  const handleConfirmVoiceJoin = useCallback(() => {
    const startedAt = Date.now();
    logVoiceJoinPromptTiming("confirm tapped");
    void confirmVoiceChannelJoin().then(() => {
      logVoiceJoinPromptTiming("confirm resolved", {
        elapsedMs: Date.now() - startedAt,
      });
      openVoiceSheetAfterPromptClose();
    });
  }, [confirmVoiceChannelJoin, openVoiceSheetAfterPromptClose]);

  const handleSelectVoiceChannel = useCallback(
    (channelId: string) => {
      if (channelId === voiceState.activeVoiceChannelId) {
        if (!voiceController.state.joined && !voiceController.state.joining) {
          void joinVoiceChannel();
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
      joinVoiceChannel,
      voiceController.state.joined,
      voiceController.state.joining,
    ],
  );

  const activeVoiceCommunityName = useMemo(() => {
    const communityId = voiceDerived.activeVoiceChannel?.community_id;
    if (!communityId) return null;
    return servers.find((server) => server.id === communityId)?.name ?? null;
  }, [servers, voiceDerived.activeVoiceChannel]);
  const enrichedVoiceChannelParticipants = useMemo(
    () =>
      enrichVoiceParticipantRecord(
        voiceDerived.voiceChannelParticipants,
        liveProfiles,
      ),
    [liveProfiles, voiceDerived.voiceChannelParticipants],
  );
  const enrichedVoiceControllerState = useMemo(
    () => ({
      ...voiceController.state,
      participants: voiceController.state.participants.map((participant) =>
        enrichVoiceParticipant(participant, liveProfiles),
      ),
    }),
    [liveProfiles, voiceController.state],
  );

  const [isFriendsModalOpen, setIsFriendsModalOpen] = useState(false);
  const [friendsInitialTab, setFriendsInitialTab] =
    useState<FriendsPanelTab>("friends");
  const [friendsHighlightedRequestId, setFriendsHighlightedRequestId] =
    useState<string | null>(null);
  const handleOpenFriendsFromNotification = useCallback(
    (input: {
      tab: "requests" | "friends";
      highlightedRequestId: string | null;
    }) => {
      setFriendsInitialTab(input.tab === "requests" ? "requests" : "friends");
      setFriendsHighlightedRequestId(input.highlightedRequestId);
      setIsFriendsModalOpen(true);
    },
    [],
  );
  const handleCloseFriends = useCallback(() => {
    setIsFriendsModalOpen(false);
  }, []);

  const handleOpenDmWithUser = useCallback(
    async (targetUserId: string) => {
      const conversationId = await dm.openWithUser(targetUserId);
      navigation.navigate("Main", {
        screen: "Community",
        params: { pendingDmConversationId: conversationId, serverId: null, openDrawer: false },
      });
    },
    [dm, navigation],
  );

  const handleStartDmFromFriend = useCallback(
    (friendUserId: string) => {
      setIsFriendsModalOpen(false);
      void handleOpenDmWithUser(friendUserId).catch((error) => {
        Alert.alert("Message failed", error instanceof Error ? error.message : "Could not open that conversation.");
      });
    },
    [handleOpenDmWithUser],
  );

  const [profileCardTarget, setProfileCardTarget] =
    useState<UserProfileModalTarget | null>(null);
  const handleOpenProfileCard = useCallback((target: UserProfileModalTarget) => {
    setProfileCardTarget(target);
  }, []);
  const handleCloseProfileCard = useCallback(() => {
    setProfileCardTarget(null);
  }, []);

  const handleNavigateToDm = useCallback(
    (conversationId: string) => {
      navigation.navigate("Main", {
        screen: "Community",
        params: { pendingDmConversationId: conversationId, serverId: null, openDrawer: false },
      });
    },
    [navigation],
  );

  useEffect(() => {
    useMobilePushNavigationStore.getState().setHandlers({
      openDm: (conversationId) => {
        navigation.navigate("Main", {
          screen: "Community",
          params: { pendingDmConversationId: conversationId, serverId: null, openDrawer: false },
        });
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
        navigation.navigate("Main", { screen: "Notifications" });
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
    handleOpenFriendsFromNotification,
    navigation,
    setWorkspaceMode,
  ]);

  return (
    <>
      <MainNavigationDelegateBridge onNavigateToDm={handleNavigateToDm} />
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
                onOpenProfile={() =>
                  navigation.navigate("Main", { screen: "Profile" })
                }
                onOpenProfileCard={handleOpenProfileCard}
                onOpenNotifications={() =>
                  navigation.navigate("Main", { screen: "Notifications" })
                }
                notificationsUnreadCount={notificationsUnreadCount}
                inboxUnreadCount={dmUnreadCount}
                friendRequestCount={socialCounts.incomingPendingRequestCount}
                onOpenFriends={() => {
                  setFriendsInitialTab("friends");
                  setFriendsHighlightedRequestId(null);
                  setIsFriendsModalOpen(true);
                }}
                onStartDirectMessage={(targetUserId) => {
                  void handleOpenDmWithUser(targetUserId).catch((error) => {
                    Alert.alert("Message failed", error instanceof Error ? error.message : "Could not open that conversation.");
                  });
                }}
                activeVoiceChannelId={voiceState.activeVoiceChannelId}
                voiceChannelParticipants={enrichedVoiceChannelParticipants}
                onSelectVoiceChannel={handleSelectVoiceChannel}
                onOpenVoiceSession={openVoiceSheet}
              />
            )}
          </Stack.Screen>
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ animation: "slide_from_right", gestureEnabled: true }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ animation: "slide_from_right", gestureEnabled: true }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ animation: "slide_from_right", gestureEnabled: true }}
          />
        </Stack.Navigator>
        {!voiceSheetOpen ? (
          <VoiceReturnPill
            state={voiceController.state}
            onPress={openVoiceSheet}
          />
        ) : null}
      </View>

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
          onOpenProfile={(target) => {
            setIsFriendsModalOpen(false);
            setProfileCardTarget(target);
          }}
        />
      </HavenListSheet>
      <UserProfileModal
        visible={Boolean(profileCardTarget)}
        target={profileCardTarget}
        onDismiss={handleCloseProfileCard}
        onStartDirectMessage={(targetUserId) => {
          void handleOpenDmWithUser(targetUserId).catch((error) => {
            Alert.alert("Message failed", error instanceof Error ? error.message : "Could not open that conversation.");
          });
        }}
      />
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
        state={enrichedVoiceControllerState}
        actions={voiceController.actions}
        onLeave={handleLeaveVoiceSession}
        onDismiss={closeVoiceSheet}
      />
      <HavenListSheet
        visible={interruptionNoticeVisible}
        onDismiss={() => setInterruptionNoticeVisible(false)}
        title="Voice paused"
      >
        <View className="gap-4">
          <Text className="text-sm leading-5 text-muted-foreground">
            We kept you connected to your friends but muted and deafened the
            voice session. You can unmute and undeafen whenever you're ready to
            be back in the conversation.
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
