import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useHavenCore, useStore } from "@mobile-data";
import type { MainStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "FriendLink">;

/**
 * Someone's friend link, opened. Opening it only shows who it is from;
 * nobody becomes friends until the person accepts, and declining tells the
 * owner only that someone declined. Leaving the screen answers nothing.
 */
export function FriendLinkScreen({ navigation, route }: Props) {
  const core = useHavenCore();
  const insets = useSafeAreaInsets();
  const code = route.params.code;
  const opened = useStore("social", (s) => s.openedLink);
  const status = useStore("social", (s) => s.requests.opened_link ?? null);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the code is a dependency; opening writes the social store.
  useEffect(() => {
    void core.social.openLink(code);
    return () => core.social.closeOpenedLink();
  }, [code, core]);

  const from = opened?.from ?? null;
  const avatarUrl = from
    ? core.backend.media.avatarUrl({
        id: from.owner_id,
        avatar_media_id: from.avatar_media_id,
      })
    : null;

  const toFriends = () =>
    navigation.replace("Friends", { initialTab: "friends" });

  const answer = async (accept: boolean) => {
    setAnswering(true);
    setError(null);
    try {
      await core.social.answerOpenedLink(accept);
      toFriends();
    } catch (cause) {
      setError(getErrorMessage(cause, "That didn't work. Try again."));
    } finally {
      setAnswering(false);
    }
  };

  return (
    <View
      className="flex-1 items-center justify-center bg-surface-app px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="w-full rounded-2xl border border-border-panel bg-card p-6">
        {status?.error && !opened ? (
          <>
            <Text className="text-center text-lg font-semibold text-foreground">
              This friend link doesn't work any more
            </Text>
            <Text className="mt-2 text-center text-sm text-muted-foreground">
              It may have expired, been used up, or been taken back. Ask for a
              new one.
            </Text>
            <Button label="Go to friends" primary onPress={toFriends} />
          </>
        ) : from ? (
          <>
            <View className="items-center">
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  className="h-16 w-16 rounded-full"
                />
              ) : (
                <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Text className="text-xl font-semibold text-foreground">
                    {from.username.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            {from.already_friends ? (
              <>
                <Text className="mt-4 text-center text-lg font-semibold text-foreground">
                  You're already friends with {from.username}
                </Text>
                <Button label="Go to friends" primary onPress={toFriends} />
              </>
            ) : (
              <>
                <Text className="mt-4 text-center text-lg font-semibold text-foreground">
                  {from.username} sent you a friend request
                </Text>
                <Text className="mt-3 text-center text-sm leading-6 text-muted-foreground">
                  Only accept if you trust the person who sent you this invite.
                  Tap accept to become friends, or decline to safely decline the
                  request.
                </Text>
                {error ? (
                  <Text className="mt-3 text-center text-sm text-destructive">
                    {error}
                  </Text>
                ) : null}
                <View className="mt-6 flex-row gap-2">
                  <View className="flex-1">
                    <Button
                      label="Decline"
                      disabled={answering}
                      onPress={() => void answer(false)}
                    />
                  </View>
                  <View className="flex-1">
                    <Button
                      label="Accept"
                      primary
                      disabled={answering}
                      onPress={() => void answer(true)}
                    />
                  </View>
                </View>
              </>
            )}
          </>
        ) : (
          <View className="items-center py-4">
            <ActivityIndicator />
            <Text className="mt-3 text-sm text-muted-foreground">
              Opening the link…
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Button({
  label,
  onPress,
  primary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`mt-6 rounded-xl py-3 ${
        primary ? "bg-primary" : "bg-surface-panel"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={`text-center font-semibold ${
          primary ? "text-primary-foreground" : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
