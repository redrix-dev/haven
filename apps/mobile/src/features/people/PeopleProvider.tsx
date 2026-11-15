import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  Text,
  View,
} from "react-native";
import {
  isBlocked,
  outgoingRequests,
} from "@shared/collections/social/selectors";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import {
  useAvatarUrl,
  useHavenCore,
  useMe,
  useNameOf,
  useStore,
} from "@mobile-data";
import { ThemedIonicons } from "@/theme-rn";
import { UserFlairBadgePill } from "@/features/user-profile/UserFlairBadgePill";
import { ReportSheet, type ReportResult } from "./ReportSheet";

/** What is being reported, and where it was seen. */
export type ReportRequest =
  | {
      subject: "message";
      messageId: string;
      /** Null in a conversation: only Haven staff can be told. */
      communityId: string | null;
      preview: string;
    }
  | {
      subject: "person";
      userId: string;
      communityId: string | null;
      name: string;
    };

type PeopleValue = {
  /** Someone's card. In a community it shows their name there. */
  openProfile: (userId: string, communityId?: string | null) => void;
  report: (request: ReportRequest) => void;
};

const PeopleContext = createContext<PeopleValue | null>(null);

/**
 * The profile sheet and the report sheet, once for the whole app: any screen
 * that shows a person or a message opens them from here. What a card offers
 * is what the database answered for this viewer (`can_message`,
 * `can_friend_request`); every action is decided again by the database.
 */
export function PeopleProvider({
  children,
  onOpenConversation,
}: {
  children: ReactNode;
  /** Shows the conversation `core.openConversationWith` opened. */
  onOpenConversation: (channelId: string) => void;
}) {
  const core = useHavenCore();
  const [profile, setProfile] = useState<{
    userId: string;
    communityId: string | null;
  } | null>(null);
  const [reporting, setReporting] = useState<ReportRequest | null>(null);

  const closeProfile = useCallback(() => {
    setProfile((open) => {
      if (open) core.profiles.closeCard(open.userId);
      return null;
    });
  }, [core]);

  const reportCommunity = useStore("communities", (s) =>
    reporting?.communityId ? (s.byId[reporting.communityId] ?? null) : null,
  );
  const canTellCommunity = useStore(
    "communities",
    () =>
      !!reporting?.communityId &&
      core.communities.can(reporting.communityId, "create_reports"),
  );

  const submitReport = async (result: ReportResult) => {
    const request = reporting;
    if (!request) return;
    const reason = result.reason || undefined;
    if (result.target === "community" && request.communityId) {
      await core.reports.fileCommunityReport(
        request.communityId,
        request.subject === "message"
          ? { kind: "message", id: request.messageId }
          : { kind: "member", id: request.userId },
        reason,
      );
    } else {
      await core.reports.fileHavenReport(
        request.subject === "message"
          ? { kind: "message", id: request.messageId }
          : { kind: "profile", id: request.userId },
        reason,
      );
    }
    setReporting(null);
    Alert.alert(
      "Report sent",
      result.target === "community"
        ? "Thanks. The community's moderators will look at it."
        : "Thanks. Haven staff will look at it.",
    );
  };

  const value = useMemo<PeopleValue>(
    () => ({
      openProfile: (userId, communityId = null) =>
        setProfile({ userId, communityId }),
      report: (request) => setReporting(request),
    }),
    [],
  );

  return (
    <PeopleContext.Provider value={value}>
      {children}
      {profile ? (
        <ProfileSheet
          key={profile.userId}
          userId={profile.userId}
          communityId={profile.communityId}
          onDismiss={closeProfile}
          onMessage={(channelId) => {
            closeProfile();
            onOpenConversation(channelId);
          }}
          onReport={(name) => {
            closeProfile();
            setReporting({
              subject: "person",
              userId: profile.userId,
              communityId: profile.communityId,
              name,
            });
          }}
        />
      ) : null}
      <ReportSheet
        visible={reporting !== null}
        title={
          reporting?.subject === "message"
            ? "Report message"
            : `Report ${reporting?.name ?? "user"}`
        }
        subjectPreview={
          reporting
            ? reporting.subject === "message"
              ? reporting.preview
              : reporting.name
            : undefined
        }
        showTarget={canTellCommunity}
        reasonRequired={reportCommunity?.report_reason_required ?? false}
        onDismiss={() => setReporting(null)}
        onSubmit={submitReport}
      />
    </PeopleContext.Provider>
  );
}

export function usePeople(): PeopleValue {
  const ctx = useContext(PeopleContext);
  if (!ctx) throw new Error("usePeople must be used within <PeopleProvider>");
  return ctx;
}

function ProfileSheet({
  userId,
  communityId,
  onDismiss,
  onMessage,
  onReport,
}: {
  userId: string;
  communityId: string | null;
  onDismiss: () => void;
  onMessage: (channelId: string) => void;
  onReport: (name: string) => void;
}) {
  const core = useHavenCore();
  const me = useMe();
  const name = useNameOf(userId, communityId);
  const avatarUrl = useAvatarUrl(userId);
  const card = useStore("profiles", (s) => s.cards[userId] ?? null);
  const cardError = useStore(
    "profiles",
    (s) => s.requests[`card:${userId}`]?.error ?? null,
  );
  const asked = useStore("social", (s) =>
    outgoingRequests(s, me ?? "").some((r) => r.recipient_id === userId),
  );
  const blocked = useStore("social", (s) => isBlocked(s, userId));
  const [working, setWorking] = useState(false);

  // Only the person is a dependency; loading writes the profiles store.
  useEffect(() => {
    void core.profiles.loadCard(userId);
  }, [core, userId]);

  const act = async (work: () => Promise<unknown>, done?: string) => {
    setWorking(true);
    try {
      await work();
      if (done) Alert.alert(done);
      await core.profiles.loadCard(userId);
    } catch (error) {
      Alert.alert(
        "That didn't work",
        getErrorMessage(error, "Try again in a moment."),
      );
    } finally {
      setWorking(false);
    }
  };

  const message = async () => {
    setWorking(true);
    try {
      onMessage(await core.openConversationWith(userId));
    } catch (error) {
      Alert.alert(
        "Couldn't start a conversation",
        getErrorMessage(error, "Try again in a moment."),
      );
    } finally {
      setWorking(false);
    }
  };

  const confirmBlock = () => {
    if (blocked) {
      void act(() => core.social.unblock(userId));
      return;
    }
    Alert.alert(
      `Block ${name}?`,
      "They won't be able to message you or send friend requests.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => void act(() => core.social.block(userId)),
        },
      ],
    );
  };

  const confirmUnfriend = () =>
    Alert.alert(`Remove ${name} as a friend?`, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => void act(() => core.social.removeFriend(userId)),
      },
    ]);

  const isSelf = userId === me;
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-row items-center justify-between border-b border-border-panel px-4 py-3">
          <Text className="text-base font-semibold text-foreground">
            Profile
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close profile"
            hitSlop={12}
            onPress={onDismiss}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
          >
            <ThemedIonicons
              name="close"
              size={22}
              colorClassName="accent-muted-foreground"
            />
          </Pressable>
        </View>

        <View className="px-5 py-6">
          <View className="items-center gap-2">
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                className="h-24 w-24 rounded-full"
                accessibilityLabel={`${name} avatar`}
              />
            ) : (
              <View className="h-24 w-24 items-center justify-center rounded-full bg-muted">
                <Text className="text-3xl font-semibold text-foreground">
                  {initial}
                </Text>
              </View>
            )}
            <Text className="text-center text-xl font-semibold text-foreground">
              {name}
            </Text>
            {card && card.username && card.username !== name ? (
              <Text className="text-xs text-muted-foreground">
                @{card.username}
              </Text>
            ) : null}
            <View className="flex-row gap-2">
              {card?.is_staff ? <Tag label="Haven staff" /> : null}
              {card?.is_friend ? <Tag label="Friend" /> : null}
            </View>
          </View>

          {!card ? (
            <View className="items-center py-6">
              {cardError ? (
                <Text className="text-sm text-muted-foreground">
                  {getErrorMessage(cardError, "This profile isn't available.")}
                </Text>
              ) : (
                <ActivityIndicator />
              )}
            </View>
          ) : (
            <>
              <View className="mt-5 gap-3">
                {card.details_visible ? (
                  <>
                    {card.flair ? (
                      <UserFlairBadgePill flair={card.flair} align="center" />
                    ) : null}
                    <Text className="text-center text-sm leading-5 text-foreground">
                      {card.bio?.trim() || "No bio yet."}
                    </Text>
                  </>
                ) : (
                  <Text className="text-center text-sm leading-5 text-muted-foreground">
                    This profile's details are private.
                  </Text>
                )}
                {card.mutual_community_names.length > 0 ? (
                  <Text className="text-center text-xs text-muted-foreground">
                    Also in {card.mutual_community_names.join(", ")}
                  </Text>
                ) : null}
              </View>

              {!isSelf && !card.deleted ? (
                <View className="mt-6 flex-row flex-wrap justify-center gap-2">
                  {card.can_message ? (
                    <Action
                      label="Message"
                      primary
                      disabled={working}
                      onPress={() => void message()}
                    />
                  ) : null}
                  {card.can_friend_request && !asked && !card.is_friend ? (
                    <Action
                      label="Add friend"
                      disabled={working}
                      onPress={() =>
                        void act(
                          () => core.social.sendRequest(userId),
                          "Friend request sent",
                        )
                      }
                    />
                  ) : null}
                  {asked ? (
                    <Text className="self-center text-xs text-muted-foreground">
                      Friend request sent
                    </Text>
                  ) : null}
                  {card.is_friend ? (
                    <Action
                      label="Remove friend"
                      disabled={working}
                      onPress={confirmUnfriend}
                    />
                  ) : null}
                  <Action
                    label={blocked ? "Unblock" : "Block"}
                    disabled={working}
                    onPress={confirmBlock}
                  />
                  <Action
                    label="Report"
                    destructive
                    disabled={working}
                    onPress={() => onReport(name)}
                  />
                </View>
              ) : null}
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-muted px-2 py-0.5">
      <Text className="text-[11px] font-semibold text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}

function Action({
  label,
  onPress,
  disabled,
  primary,
  destructive,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-xl px-4 py-2.5 ${
        primary
          ? "bg-primary active:bg-primary-hover"
          : "bg-surface-panel active:bg-surface-hover"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={`text-sm font-semibold ${
          primary
            ? "text-primary-foreground"
            : destructive
              ? "text-destructive"
              : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
