import { useNavigation } from "@react-navigation/native";
import type { VoiceKickPayload } from "@shared/features/voice/types";
import { VoiceControlNotice } from "@/features/voice/VoiceControlNotice";
import type { NavigationProp } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSharedValue, withTiming } from "react-native-reanimated";
import { useHydrateMobileThemeFromProfile } from "@/hooks/useHydrateMobileThemeFromProfile";
import { CommunityEntry } from "@/navigation/community/CommunityEntry";
import { CommunityShell } from "@/navigation/community/CommunityShell";
import type {
  MainStackParamList,
  RootStackParamList,
} from "@/navigation/types";
import { NAV_THEME } from "@/lib/theme";
import {
  communityChannels,
  conversations,
  isMuted,
  unreadCount,
} from "@shared/collections/channels/selectors";
import {
  openChannelId,
  openCommunityId,
} from "@shared/collections/session/selectors";
import { incomingRequests } from "@shared/collections/social/selectors";
import {
  useAvatarUrl,
  useHavenCore,
  useMe,
  useNameOf,
  useStore,
} from "@mobile-data";
import { PeopleProvider } from "@/features/people/PeopleProvider";
import { useVoice } from "@/features/voice/hooks/useVoice";
import { useMobilePushNotificationRouting } from "@/hooks/useMobilePushNotificationRouting";
import { useMobilePushNavigationStore } from "@/stores/mobilePushNavigationStore";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { resolveColorProp } from "@shared/themes";
import { VoiceJoinPromptSheet } from "@/features/voice/VoiceJoinPromptSheet";
import { VoiceSessionSheet } from "@/features/voice/VoiceSessionSheet";
import { VoiceFloatingController } from "@/features/voice/VoiceFloatingController";
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
import { FriendsScreen } from "@/screens/main/FriendsScreen";
import { FriendLinkScreen } from "@/screens/main/FriendLinkScreen";

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

function MainNavigationShell({ userId }: { userId: string }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const core = useHavenCore();
  const currentServerId = useStore("session", openCommunityId);
  const currentChannelId = useStore("session", openChannelId);
  const channels = useStore("channels", (s) =>
    currentServerId ? communityChannels(s, currentServerId) : [],
  );
  const setCurrentChannelId = useCallback(
    (id: string | null) => {
      if (currentServerId && id) void core.openChannel(currentServerId, id);
    },
    [core, currentServerId],
  );
  useMobilePushNotificationRouting();

  const currentUserIdentity = {
    id: userId,
    displayName: useNameOf(userId),
    avatarUrl: useAvatarUrl(userId),
  };

  const notificationsUnreadCount = useStore("notifications", (s) => s.unseen);
  const dmUnreadCount = useStore("channels", (s) =>
    conversations(s).reduce(
      (total, c) => total + (isMuted(s, c.id) ? 0 : unreadCount(s, c.id)),
      0,
    ),
  );
  const friendRequestCount = useStore(
    "social",
    (s) => incomingRequests(s, userId).length,
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
  // Single 0→1 progress shared by the floating bubble and the session panel so
  // they morph as one coordinated motion (0 = bubble, 1 = panel) anchored at the
  // bubble's on-screen position.
  const voiceMorph = useSharedValue(0);
  const [voiceBubbleAnchor, setVoiceBubbleAnchor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // The floating bubble is the panel's *minimized* form, so it stays suppressed
  // on a fresh join (which opens straight into the panel) and is only revealed
  // once the user first minimizes. Resets when the session ends.
  const [voiceBubbleArmed, setVoiceBubbleArmed] = useState(false);
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

  // Drive the morph in lockstep with the sheet toggle.
  useEffect(() => {
    voiceMorph.value = withTiming(voiceSheetOpen ? 1 : 0, {
      duration: voiceSheetOpen ? 300 : 260,
    });
  }, [voiceMorph, voiceSheetOpen]);

  const handleVoiceBubbleAnchor = useCallback(
    (center: { x: number; y: number }) => {
      setVoiceBubbleAnchor(center);
    },
    [],
  );

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

  // Close the panel without revealing the bubble — used for teardown (leave /
  // kick / error) so the session exits cleanly instead of flashing the bubble.
  const dismissVoiceSheet = useCallback(() => {
    clearPendingVoiceSheetOpen();
    setVoiceSheetOpen(false);
  }, [clearPendingVoiceSheetOpen]);

  const closeVoiceSheet = useCallback(() => {
    // User-initiated minimize: reveal the bubble; from now on the panel morphs
    // to/from it.
    setVoiceBubbleArmed(true);
    dismissVoiceSheet();
  }, [dismissVoiceSheet]);

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
      dismissVoiceSheet();
      Alert.alert("Voice connection failed", message);
      void disconnectVoiceSession({ triggerPaneLeave: false }).catch(
        (error: unknown) => {
          console.warn("[voice] Failed to reset after session error.", error);
        },
      );
    },
    [dismissVoiceSheet, disconnectVoiceSession],
  );

  const handleVoiceKick = useCallback(
    (payload: VoiceKickPayload) => {
      dismissVoiceSheet();
      void forceDisconnectVoice("kicked")
        .then(() => {
          Alert.alert(
            "Removed from voice",
            `You've been removed from ${payload.channelName ?? "the voice channel"} by ${payload.kickedByName ?? "a moderator"}.`,
            [{ text: "OK", onPress: () => core.voice.dismissControlNotice() }],
          );
        })
        .catch((error: unknown) => {
          console.warn("[voice] Failed to disconnect after kick.", error);
        });
    },
    [core.voice, dismissVoiceSheet, forceDisconnectVoice],
  );

  // Losing a community (left elsewhere, removed, banned, deleted): the core
  // has already forgotten it, so its name is remembered here. Leave its voice
  // channel and say why; the community shell moves off it.
  const communityNames = useStore("communities", (s) => s.byId);
  const namesRef = useRef(new Map<string, string>());
  useEffect(() => {
    for (const community of Object.values(communityNames)) {
      namesRef.current.set(community.id, community.name);
    }
  }, [communityNames]);
  useEffect(() => {
    core.listen({
      communityGone: (communityId) => {
        const voice = core.stores.voice.getState();
        if (voice.activeChannel?.community_id === communityId) {
          dismissVoiceSheet();
          void forceDisconnectVoice("access_lost").catch((error: unknown) => {
            console.warn(
              "[voice] Failed to disconnect after access loss.",
              error,
            );
          });
        }
        const name = namesRef.current.get(communityId);
        namesRef.current.delete(communityId);
        Alert.alert(
          "No longer in a community",
          name ? `You're no longer in ${name}.` : undefined,
        );
      },
    });
  }, [core, dismissVoiceSheet, forceDisconnectVoice]);

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

  // Re-arm (suppress) the bubble whenever a voice session ends so the next join
  // opens straight into the panel again.
  const voiceSessionActive =
    voiceController.state.joined || voiceController.state.joining;
  useEffect(() => {
    if (!voiceSessionActive) setVoiceBubbleArmed(false);
  }, [voiceSessionActive]);

  const handleLeaveVoiceSession = useCallback(() => {
    // Leaving dismisses the panel without arming the bubble, so teardown is a
    // clean exit rather than a flash of the bubble appearing then disappearing.
    dismissVoiceSheet();
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
  }, [dismissVoiceSheet, disconnectVoiceSession, leaveVoiceChannel]);

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

  const activeVoiceCommunityName = useStore("communities", (s) => {
    const communityId = voiceDerived.activeVoiceChannel?.community_id;
    return communityId ? (s.byId[communityId]?.name ?? null) : null;
  });
  const enrichedVoiceControllerState = voiceController.state;

  const handleOpenFriendsFromNotification = useCallback(
    (input: {
      tab: "requests" | "friends";
      highlightedRequestId: string | null;
    }) => {
      navigation.navigate("Main", {
        screen: "Friends",
        params: {
          initialTab: input.tab === "requests" ? "requests" : "friends",
          highlightedRequestId: input.highlightedRequestId,
        },
      });
    },
    [navigation],
  );

  const handleNavigateToDm = useCallback(
    (conversationId: string) => {
      navigation.navigate("Main", {
        screen: "Community",
        params: {
          pendingDmConversationId: conversationId,
          serverId:
            core.stores.session.getState().place?.kind === "community"
              ? openCommunityId(core.stores.session.getState())
              : null,
          openDrawer: false,
        },
      });
    },
    [core, navigation],
  );

  // Push taps and links (features/links) both navigate through these.
  useEffect(() => {
    useMobilePushNavigationStore.getState().setHandlers({
      openDm: handleNavigateToDm,
      openFriends: (input) => {
        handleOpenFriendsFromNotification(input);
      },
      openMention: (communityId, channelId) => {
        void core.openChannel(communityId, channelId);
        navigation.navigate("Main", {
          screen: "Community",
          params: { serverId: communityId, openDrawer: false },
        });
      },
      openCommunity: (communityId) => {
        void core.openCommunity(communityId);
        navigation.navigate("Main", {
          screen: "Community",
          params: { serverId: communityId, openDrawer: true },
        });
      },
      openInvite: (code) => {
        // Stay on the current community; the join sheet opens over it.
        navigation.navigate("Main", {
          screen: "Community",
          params: {
            serverId: openCommunityId(core.stores.session.getState()),
            openDrawer: false,
            pendingInviteCode: code,
          },
        });
      },
      openFriendLink: (code) => {
        navigation.navigate("Main", { screen: "FriendLink", params: { code } });
      },
      openNotifications: () => {
        navigation.navigate("Main", { screen: "Notifications" });
      },
    });

    return () => {
      useMobilePushNavigationStore.getState().setHandlers(null);
    };
  }, [core, handleNavigateToDm, handleOpenFriendsFromNotification, navigation]);

  return (
    <PeopleProvider onOpenConversation={handleNavigateToDm}>
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
                onOpenNotifications={() =>
                  navigation.navigate("Main", { screen: "Notifications" })
                }
                notificationsUnreadCount={notificationsUnreadCount}
                inboxUnreadCount={dmUnreadCount}
                friendRequestCount={friendRequestCount}
                onOpenFriends={() => {
                  navigation.navigate("Main", {
                    screen: "Friends",
                    params: {
                      initialTab: "friends",
                      highlightedRequestId: null,
                    },
                  });
                }}
                activeVoiceChannelId={voiceState.activeVoiceChannelId}
                onSelectVoiceChannel={handleSelectVoiceChannel}
                onOpenVoiceSession={openVoiceSheet}
              />
            )}
          </Stack.Screen>
          <Stack.Screen
            name="Friends"
            component={FriendsScreen}
            options={{ animation: "slide_from_right", gestureEnabled: true }}
          />
          <Stack.Screen
            name="FriendLink"
            component={FriendLinkScreen}
            options={{ animation: "slide_from_right", gestureEnabled: true }}
          />
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
        <VoiceFloatingController
          visible={!voiceSheetOpen}
          state={enrichedVoiceControllerState}
          actions={voiceController.actions}
          onLeave={handleLeaveVoiceSession}
          onOpenFullSheet={openVoiceSheet}
          morphProgress={voiceMorph}
          onRestPositionCommit={handleVoiceBubbleAnchor}
          armed={voiceBubbleArmed}
        />
      </View>

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
        morphProgress={voiceMorph}
        // First open (pre-minimize) rises from bottom-center; once the bubble is
        // revealed, subsequent opens morph from its on-screen position.
        morphAnchor={voiceBubbleArmed ? voiceBubbleAnchor : null}
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
    </PeopleProvider>
  );
}

export function MainNavigator() {
  const userId = useMe();
  const themeTokens = useMobileThemeTokens();
  const spinnerFg = resolveColorProp(themeTokens, "foreground") ?? "#e6edf7";
  useHydrateMobileThemeFromProfile();

  if (!userId) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-app">
        <ActivityIndicator color={spinnerFg} size="large" />
      </View>
    );
  }

  return (
    <>
      <MainNavigationShell userId={userId} />
      <VoiceControlNotice floating />
    </>
  );
}
