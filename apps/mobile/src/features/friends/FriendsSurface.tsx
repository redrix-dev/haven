import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import type { FriendLink } from "@shared/lib/backend/records";
import {
  friendIds,
  incomingRequests,
  outgoingRequests,
  usableLinks,
} from "@shared/collections/social/selectors";
import { buildHavenLink } from "@shared/features/links";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { resolveColorProp } from "@shared/themes";
import {
  useAvatarUrl,
  useHavenCore,
  useMe,
  useNameOf,
  useStore,
} from "@mobile-data";
import { usePeople } from "@/features/people/PeopleProvider";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";

export type FriendsTab = "friends" | "add" | "requests" | "blocked";

export type FriendsSurfaceProps = {
  initialTab: FriendsTab;
  highlightedRequestId: string | null;
  /** Shows the conversation `core.openConversationWith` opened. */
  onOpenConversation: (channelId: string) => void;
};

const TABS: { id: FriendsTab; label: string }[] = [
  { id: "friends", label: "Friends" },
  { id: "add", label: "Add" },
  { id: "requests", label: "Requests" },
  { id: "blocked", label: "Blocked" },
];

/**
 * Friends, requests both ways, blocks, and the ways to add someone: their
 * exact username, or a friend link. Every list is the social collection,
 * which realtime keeps current; each action is decided by the database.
 */
export function FriendsSurface({
  initialTab,
  highlightedRequestId,
  onOpenConversation,
}: FriendsSurfaceProps) {
  const core = useHavenCore();
  const people = usePeople();
  const me = useMe() ?? "";
  const [tab, setTab] = useState<FriendsTab>(initialTab);
  const friends = useStore("social", (s) => friendIds(s, me));
  const incoming = useStore("social", (s) => incomingRequests(s, me));
  const outgoing = useStore("social", (s) => outgoingRequests(s, me));
  const blocked = useStore("social", (s) => Object.keys(s.blocks));
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setTab(initialTab), [initialTab]);

  // Everyone listed needs a name and picture.
  useEffect(() => {
    void core.profiles.ensure([
      ...friends,
      ...incoming.map((r) => r.sender_id),
      ...outgoing.map((r) => r.recipient_id),
      ...blocked,
    ]);
  }, [blocked, core, friends, incoming, outgoing]);

  const act = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await work();
    } catch (error) {
      Alert.alert(
        "That didn't work",
        getErrorMessage(error, "Try again in a moment."),
      );
    } finally {
      setBusy(null);
    }
  };

  const message = (userId: string) =>
    act(`message:${userId}`, async () =>
      onOpenConversation(await core.openConversationWith(userId)),
    );

  const confirmRemove = (userId: string) =>
    Alert.alert(`Remove ${core.nameOf(userId)} as a friend?`, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          void act(`remove:${userId}`, () => core.social.removeFriend(userId)),
      },
    ]);

  return (
    <View className="min-h-0 flex-1">
      <View className="mb-4 flex-row gap-2">
        {TABS.map((t) => {
          const count = t.id === "requests" ? incoming.length : 0;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.id }}
              onPress={() => setTab(t.id)}
              className={`rounded-full px-3 py-1.5 ${
                tab === t.id ? "bg-primary" : "bg-surface-panel"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  tab === t.id ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                {t.label}
                {count > 0 ? ` (${count})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "friends" ? (
        <FlatList
          data={friends}
          keyExtractor={(id) => id}
          renderItem={({ item }) => (
            <PersonRow userId={item} onPress={() => people.openProfile(item)}>
              <SmallButton
                label="Message"
                disabled={busy !== null}
                onPress={() => void message(item)}
              />
              <SmallButton
                label="Remove"
                disabled={busy !== null}
                onPress={() => confirmRemove(item)}
              />
            </PersonRow>
          )}
          ListEmptyComponent={
            <Empty>
              No friends yet. Add someone by their username or send them a
              friend link.
            </Empty>
          }
        />
      ) : tab === "add" ? (
        <ScrollView keyboardShouldPersistTaps="handled">
          <AddByUsername />
          <FriendLinks />
        </ScrollView>
      ) : tab === "requests" ? (
        <ScrollView>
          <SectionTitle>Waiting for you</SectionTitle>
          {incoming.length === 0 ? <Empty>Nothing waiting.</Empty> : null}
          {incoming.map((request) => (
            <PersonRow
              key={request.id}
              userId={request.sender_id}
              highlighted={request.id === highlightedRequestId}
              onPress={() => people.openProfile(request.sender_id)}
            >
              <SmallButton
                label="Accept"
                primary
                disabled={busy !== null}
                onPress={() =>
                  void act(request.id, () =>
                    core.social.answerRequest(request.id, true),
                  )
                }
              />
              <SmallButton
                label="Decline"
                disabled={busy !== null}
                onPress={() =>
                  void act(request.id, () =>
                    core.social.answerRequest(request.id, false),
                  )
                }
              />
            </PersonRow>
          ))}
          <SectionTitle>Sent</SectionTitle>
          {outgoing.length === 0 ? <Empty>No requests sent.</Empty> : null}
          {outgoing.map((request) => (
            <PersonRow
              key={request.id}
              userId={request.recipient_id}
              onPress={() => people.openProfile(request.recipient_id)}
            >
              <SmallButton
                label="Cancel"
                disabled={busy !== null}
                onPress={() =>
                  void act(request.id, () =>
                    core.social.answerRequest(request.id, false),
                  )
                }
              />
            </PersonRow>
          ))}
        </ScrollView>
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={(id) => id}
          renderItem={({ item }) => (
            <PersonRow userId={item}>
              <SmallButton
                label="Unblock"
                disabled={busy !== null}
                onPress={() =>
                  void act(`unblock:${item}`, () => core.social.unblock(item))
                }
              />
            </PersonRow>
          )}
          ListEmptyComponent={<Empty>You haven't blocked anyone.</Empty>}
        />
      )}
    </View>
  );
}

/**
 * Finding someone by their exact username, never by a partial match: nobody
 * can be found by browsing. Their card says whether they take requests.
 */
function AddByUsername() {
  const core = useHavenCore();
  const people = usePeople();
  const tokens = useMobileThemeTokens();
  const placeholder = resolveColorProp(tokens, "muted-foreground") ?? "#8b9cbb";
  const [username, setUsername] = useState("");
  const [looking, setLooking] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const find = async () => {
    const wanted = username.trim().replace(/^@/, "");
    if (!wanted) return;
    setLooking(true);
    setNotFound(false);
    try {
      const found = await core.backend.people.findUser(wanted);
      if (found && !found.deleted) {
        core.profiles.applyProfile(found);
        people.openProfile(found.id);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLooking(false);
    }
  };

  return (
    <View className="mb-6">
      <SectionTitle>By username</SectionTitle>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={username}
          onChangeText={setUsername}
          onSubmitEditing={() => void find()}
          placeholder="Their exact username"
          placeholderTextColor={placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          className="min-w-0 flex-1 rounded-xl border border-border-control bg-surface-panel px-3 py-2.5 text-sm text-foreground"
        />
        <SmallButton
          label={looking ? "Looking…" : "Find"}
          primary
          disabled={looking}
          onPress={() => void find()}
        />
      </View>
      {notFound ? (
        <Text className="mt-2 text-sm text-muted-foreground">
          Nobody has that username.
        </Text>
      ) : null}
    </View>
  );
}

const LINK_USES: { label: string; value: number | null }[] = [
  { label: "1 person", value: 1 },
  { label: "5 people", value: 5 },
  { label: "Anyone with it", value: null },
];
const LINK_EXPIRY: { label: string; hours: number }[] = [
  { label: "1 day", hours: 24 },
  { label: "1 week", hours: 168 },
  { label: "30 days", hours: 720 },
];

/**
 * The person's own friend links. Whoever opens one sees who it is from and
 * decides; nobody becomes friends by tapping. The owner is told when someone
 * accepts, and when someone declines (not who).
 */
function FriendLinks() {
  const core = useHavenCore();
  const links = useStore("social", usableLinks);
  const [uses, setUses] = useState<number | null>(1);
  const [hours, setHours] = useState(168);
  const [creating, setCreating] = useState(false);

  // The list is not part of the sign-in load; it loads when looked at.
  useEffect(() => {
    void core.social.loadLinks();
  }, [core]);

  const share = (link: FriendLink) =>
    void Share.share({
      message: buildHavenLink({ kind: "friend_link", code: link.code }),
    }).catch(() => {});

  const create = async () => {
    setCreating(true);
    try {
      share(
        await core.social.createLink({
          max_uses: uses,
          expires_in_hours: hours,
        }),
      );
    } catch (error) {
      Alert.alert(
        "Couldn't make a link",
        getErrorMessage(error, "Try again in a moment."),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <View>
      <SectionTitle>Friend links</SectionTitle>
      <Text className="mb-3 text-sm text-muted-foreground">
        Hand a link to someone you know. Opening it asks them whether to accept;
        nobody becomes your friend just by tapping it.
      </Text>
      <Text className="mb-1.5 text-xs font-semibold text-muted-foreground">
        Works for
      </Text>
      <Choices
        options={LINK_USES.map((o) => ({ label: o.label, value: o.value }))}
        value={uses}
        onChange={setUses}
      />
      <Text className="mb-1.5 mt-3 text-xs font-semibold text-muted-foreground">
        For
      </Text>
      <Choices
        options={LINK_EXPIRY.map((o) => ({ label: o.label, value: o.hours }))}
        value={hours}
        onChange={setHours}
      />
      <Pressable
        accessibilityRole="button"
        disabled={creating}
        onPress={() => void create()}
        className={`mt-4 rounded-xl bg-primary py-3 ${creating ? "opacity-60" : ""}`}
      >
        <Text className="text-center font-semibold text-primary-foreground">
          {creating ? "Making…" : "Make and share a link"}
        </Text>
      </Pressable>

      <View className="mt-4">
        {links.length === 0 ? <Empty>No links that still work.</Empty> : null}
        {links.map((link) => (
          <View
            key={link.id}
            className="flex-row items-center gap-3 border-b border-border-panel py-2.5"
          >
            <View className="min-w-0 flex-1">
              <Text className="font-mono text-sm text-foreground">
                {link.code}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {link.max_uses === null
                  ? `${link.uses} used`
                  : `${link.uses} / ${link.max_uses} used`}
                {" · until "}
                {new Date(link.expires_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </View>
            <SmallButton label="Share" onPress={() => share(link)} />
            <SmallButton
              label="Revoke"
              onPress={() =>
                void core.social
                  .revokeLink(link.id)
                  .catch((error: unknown) =>
                    Alert.alert(
                      "Couldn't revoke it",
                      getErrorMessage(error, "Try again in a moment."),
                    ),
                  )
              }
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function Choices<T>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => (
        <Pressable
          key={option.label}
          accessibilityRole="radio"
          accessibilityState={{ selected: option.value === value }}
          onPress={() => onChange(option.value)}
          className={`rounded-full border px-3 py-1.5 ${
            option.value === value
              ? "border-primary bg-surface-panel"
              : "border-border-control"
          }`}
        >
          <Text className="text-sm text-foreground">{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PersonRow({
  userId,
  highlighted = false,
  onPress,
  children,
}: {
  userId: string;
  highlighted?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  const name = useNameOf(userId);
  const avatarUrl = useAvatarUrl(userId);
  return (
    <View
      className={`flex-row items-center gap-3 border-b border-border-panel py-2.5 ${
        highlighted ? "bg-surface-panel" : ""
      }`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}'s profile`}
        disabled={!onPress}
        onPress={onPress}
        className="min-w-0 flex-1 flex-row items-center gap-3"
      >
        <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-surface-panel">
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: 40, height: 40 }}
            />
          ) : (
            <Text className="text-base font-semibold text-foreground">
              {name.charAt(0).toUpperCase() || "?"}
            </Text>
          )}
        </View>
        <Text
          className="min-w-0 flex-1 text-sm font-semibold text-foreground"
          numberOfLines={1}
        >
          {name}
        </Text>
      </Pressable>
      <View className="flex-row gap-2">{children}</View>
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-lg px-3 py-2 ${
        primary ? "bg-primary" : "bg-surface-panel active:bg-surface-hover"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={`text-xs font-semibold ${
          primary ? "text-primary-foreground" : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </Text>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Text className="py-4 text-center text-sm text-muted-foreground">
      {children}
    </Text>
  );
}
