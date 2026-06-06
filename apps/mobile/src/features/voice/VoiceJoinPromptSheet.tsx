import { Pressable, Switch, Text, View } from "react-native";
import { HavenListSheet } from "@/components/HavenListSheet";

export type MobileVoiceJoinPrompt = {
  channelId: string;
  channel: {
    id: string;
    name: string;
    community_id: string;
  };
  mode: "join" | "switch";
} | null;

type VoiceJoinPromptSheetProps = {
  prompt: MobileVoiceJoinPrompt;
  currentChannelName: string | null;
  skipSwitchPrompt: boolean;
  onSkipSwitchPromptChange: (skip: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function VoiceJoinPromptSheet({
  prompt,
  currentChannelName,
  skipSwitchPrompt,
  onSkipSwitchPromptChange,
  onCancel,
  onConfirm,
}: VoiceJoinPromptSheetProps) {
  const isSwitch = prompt?.mode === "switch";
  return (
    <HavenListSheet
      visible={Boolean(prompt)}
      onDismiss={onCancel}
      title={isSwitch ? "Switch voice channel?" : "Join voice channel?"}
    >
      <View className="gap-4">
        <Text className="text-sm leading-5 text-muted-foreground">
          {isSwitch
            ? `This will disconnect you from ${currentChannelName ?? "your current voice channel"} and connect you to ${prompt?.channel.name ?? "the new voice channel"}.`
            : `Join ${prompt?.channel.name ?? "this voice channel"} now? You can keep browsing while connected.`}
        </Text>

        {isSwitch ? (
          <View className="flex-row items-center justify-between rounded-lg bg-surface-panel px-3 py-3">
            <Text className="mr-3 flex-1 text-sm font-medium text-foreground">
              Do not warn me again
            </Text>
            <Switch value={skipSwitchPrompt} onValueChange={onSkipSwitchPromptChange} />
          </View>
        ) : null}

        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            className="flex-1 rounded-lg border border-border-control bg-surface-panel px-4 py-3 active:bg-surface-hover"
          >
            <Text className="text-center font-semibold text-foreground">No</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onConfirm}
            className="flex-1 rounded-lg bg-primary px-4 py-3 active:bg-primary-hover"
          >
            <Text className="text-center font-semibold text-primary-foreground">
              {isSwitch ? "Switch" : "Join"}
            </Text>
          </Pressable>
        </View>
      </View>
    </HavenListSheet>
  );
}
