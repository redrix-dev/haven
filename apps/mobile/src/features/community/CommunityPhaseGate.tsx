import { Text, Pressable, View } from "react-native";

type CommunityPhaseGateProps = {
  phase: "loading" | "ready" | "missing" | "error";
  error?: string | null;
  onRetry: () => void;
};

export function CommunityPhaseGate({ phase, error, onRetry }: CommunityPhaseGateProps) {
  // ─── Render ───────────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <View>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (phase === "error") {
    return (
      <View>
        <Text>{error ?? "Error"}</Text>
        <Pressable onPress={onRetry}>
          <Text>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === "missing") {
    return (
      <View>
        <Text>{error ?? "Community not available."}</Text>
        <Pressable onPress={onRetry}>
          <Text>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return null;
}