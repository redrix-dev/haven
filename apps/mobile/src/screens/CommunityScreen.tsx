import { Ionicons } from "@expo/vector-icons";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getControlPlaneBackend } from "@shared/lib/backend";
import { getErrorMessage } from "@shared/platform/lib/errors";
import { useNavigationStore } from "@shared/stores/navigationStore";
import type { RootStackParamList } from "../navigation/types";
import { getMobileSupabase } from "../supabase/getMobileSupabase";

type CommunityNav = NativeStackNavigationProp<
  RootStackParamList,
  "Community"
>;

/**
 * Mobile community workspace entry: keeps navigationStore in sync with the
 * shared “current server” id, loads membership via Supabase auth + control
 * plane backend (Haven runtime), and renders a minimal shell for UI iteration.
 */
export function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<CommunityNav>();
  const route = useRoute<RouteProp<RootStackParamList, "Community">>();
  const { communityId } = route.params;

  const [communityName, setCommunityName] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "missing" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      useNavigationStore.getState().setCurrentServerId(communityId);

      let cancelled = false;

      const load = async () => {
        setPhase("loading");
        setErrorMessage(null);
        setCommunityName(null);

        try {
          const supabase = getMobileSupabase();
          const {
            data: { user },
            error: authError,
          } = await supabase.auth.getUser();
          if (authError) throw authError;
          if (!user?.id) {
            throw new Error("Not signed in.");
          }

          const servers = await getControlPlaneBackend().listUserCommunities(
            user.id,
          );
          if (cancelled) return;

          const match = servers.find((row) => row.id === communityId);
          if (!match) {
            setPhase("missing");
            return;
          }

          setCommunityName(match.name);
          setPhase("ready");
        } catch (e) {
          if (cancelled) return;
          setErrorMessage(getErrorMessage(e, "Failed to load community."));
          setPhase("error");
        }
      };

      void load();

      return () => {
        cancelled = true;
        useNavigationStore.getState().setCurrentServerId(null);
      };
    }, [communityId]),
  );

  const title =
    phase === "ready" && communityName
      ? communityName
      : phase === "loading"
        ? "Community"
        : phase === "missing"
          ? "Community"
          : "Community";

  return (
    <View className="flex-1 bg-surface-app" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center border-b border-border-panel bg-surface-modal px-3 py-3">
        <Pressable
          accessibilityRole="button"
          className="mr-2 h-10 w-10 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={22} color="#e6edf7" />
        </Pressable>
        <Text
          className="flex-1 text-lg font-semibold text-foreground"
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>

      <View className="flex-1 items-center justify-center px-6">
        {phase === "loading" ? (
          <ActivityIndicator color="#e6edf7" size="large" />
        ) : null}

        {phase === "ready" && communityName ? (
          <Text className="text-center text-base text-muted-foreground">
            Placeholder —{" "}
            <Text className="font-semibold text-foreground">{communityName}</Text>
          </Text>
        ) : null}

        {phase === "missing" ? (
          <Text className="text-center text-sm text-muted-foreground">
            This community is not in your list or you no longer have access.
          </Text>
        ) : null}

        {phase === "error" && errorMessage ? (
          <Text className="text-center text-sm text-destructive">{errorMessage}</Text>
        ) : null}

        <Text
          className="mt-6 text-center text-xs text-muted-foreground opacity-80"
          selectable
        >
          id: {communityId}
        </Text>
      </View>
    </View>
  );
}
