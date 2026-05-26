import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type DimensionValue,
} from "react-native";
import type { VoiceSettings } from "@shared/types/settings";
import type { VoiceParticipant } from "@shared/features/voice/types";
import { HavenModalShell } from "@/components/HavenModalShell";
import { ThemedIonicons, type ThemedIoniconsProps } from "@/theme-rn";
import type {
  MobileVoiceControllerActions,
  MobileVoiceControllerState,
} from "@/features/voice/useMobileLiveKitVoiceSession";

type VoiceSessionSheetProps = {
  visible: boolean;
  communityName: string | null;
  currentUser: {
    id: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
  voiceSettings: VoiceSettings;
  state: MobileVoiceControllerState;
  actions: MobileVoiceControllerActions;
  onLeave: () => void;
  onDismiss: () => void;
};

type ParticipantTileProps = {
  participant: VoiceParticipant;
  self?: boolean;
};

type ControlButtonProps = {
  label: string;
  icon: ThemedIoniconsProps["name"];
  active?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

function participantInitial(displayName: string): string {
  return displayName.trim().charAt(0).toUpperCase() || "?";
}

function ParticipantAvatar({
  displayName,
  avatarUrl,
  speaking,
}: {
  displayName: string;
  avatarUrl?: string | null;
  speaking?: boolean;
}) {
  return (
    <View
      className={[
        "h-16 w-16 items-center justify-center rounded-full border-2 bg-surface-panel",
        speaking ? "border-primary" : "border-border-panel",
      ].join(" ")}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} className="h-full w-full rounded-full" />
      ) : (
        <Text className="text-xl font-bold text-foreground">
          {participantInitial(displayName)}
        </Text>
      )}
    </View>
  );
}

function ParticipantTile({ participant, self = false }: ParticipantTileProps) {
  return (
    <View className="w-[48%] items-center gap-2 rounded-lg bg-surface-panel px-3 py-4">
      <ParticipantAvatar
        displayName={participant.displayName}
        avatarUrl={participant.avatarUrl}
        speaking={participant.isSpeaking}
      />
      <Text className="w-full text-center text-sm font-semibold text-foreground" numberOfLines={1}>
        {participant.displayName}
      </Text>
      <View className="flex-row items-center gap-1.5">
        {participant.muted ? (
          <ThemedIonicons name="mic-off-outline" size={14} colorClassName="accent-text-dim" />
        ) : (
          <ThemedIonicons name="mic-outline" size={14} colorClassName="accent-foreground" />
        )}
        {participant.deafened ? (
          <ThemedIonicons
            name="volume-mute-outline"
            size={14}
            colorClassName="accent-text-dim"
          />
        ) : null}
        {self ? (
          <Text className="text-[11px] text-muted-foreground">You</Text>
        ) : null}
      </View>
    </View>
  );
}

function ControlButton({
  label,
  icon,
  active = false,
  destructive = false,
  onPress,
}: ControlButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={[
        "min-w-[76px] flex-1 items-center gap-1.5 rounded-lg px-3 py-3 active:opacity-80",
        destructive
          ? "bg-destructive"
          : active
            ? "bg-primary"
            : "bg-surface-panel",
      ].join(" ")}
    >
      <ThemedIonicons
        name={icon}
        size={22}
        colorClassName="accent-foreground"
      />
      <Text
        className={[
          "text-center text-xs font-semibold",
          destructive || active ? "text-primary-foreground" : "text-foreground",
        ].join(" ")}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TransmissionOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={[
        "flex-1 rounded-lg px-3 py-2.5 active:opacity-80",
        selected ? "bg-primary" : "bg-surface-panel",
      ].join(" ")}
    >
      <Text
        className={[
          "text-center text-sm font-semibold",
          selected ? "text-primary-foreground" : "text-foreground",
        ].join(" ")}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function VoiceSessionSheet({
  visible,
  communityName,
  currentUser,
  voiceSettings,
  state,
  actions,
  onLeave,
  onDismiss,
}: VoiceSessionSheetProps) {
  const channelName = state.activeChannel?.channelName ?? "Voice";
  const currentUserParticipant: VoiceParticipant = {
    userId: currentUser.id ?? "current-user",
    displayName: currentUser.displayName,
    avatarUrl: currentUser.avatarUrl,
    isSpeaking: state.voiceActivityGateOpen,
    muted: state.isMuted,
    deafened: state.isDeafened,
  };
  const participantCount = state.participants.length + (state.joined ? 1 : 0);
  const threshold = voiceSettings.voiceActivationThreshold;
  const levelPercent = `${Math.round(state.localInputLevel * 100)}%`;
  const levelWidth = levelPercent as DimensionValue;

  return (
    <HavenModalShell
      visible={visible}
      onDismiss={onDismiss}
      title="Voice"
      cardClassName="h-[92%]"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5">
          <View>
            <Text className="text-2xl font-bold text-foreground" numberOfLines={1}>
              {channelName}
            </Text>
            <Text className="mt-1 text-sm text-muted-foreground" numberOfLines={1}>
              {communityName ?? "Community"} - {participantCount} connected
            </Text>
            {state.error ? (
              <Text className="mt-2 text-sm font-medium text-destructive">{state.error}</Text>
            ) : state.notice ? (
              <Text className="mt-2 text-sm text-muted-foreground">{state.notice}</Text>
            ) : null}
          </View>

          <View className="flex-row flex-wrap justify-between gap-y-3">
            {state.joined ? <ParticipantTile participant={currentUserParticipant} self /> : null}
            {state.participants.map((participant) => (
              <ParticipantTile key={participant.userId} participant={participant} />
            ))}
            {!state.joined && state.participants.length === 0 ? (
              <View className="w-full items-center rounded-lg bg-surface-panel px-4 py-8">
                <Text className="text-center text-sm text-muted-foreground">
                  Joining voice will show everyone here.
                </Text>
              </View>
            ) : null}
          </View>

          <View className="flex-row gap-2">
            <ControlButton
              label={state.isMuted ? "Muted" : "Mute"}
              icon={state.isMuted ? "mic-off-outline" : "mic-outline"}
              active={state.isMuted}
              onPress={actions.toggleMute}
            />
            <ControlButton
              label={state.isDeafened ? "Deafened" : "Deafen"}
              icon={state.isDeafened ? "volume-mute-outline" : "volume-high-outline"}
              active={state.isDeafened}
              onPress={actions.toggleDeafen}
            />
            <ControlButton
              label="Leave"
              icon="call-outline"
              destructive
              onPress={onLeave}
            />
          </View>

          <View className="gap-3">
            <Text className="text-base font-semibold text-foreground">Transmission</Text>
            <View className="flex-row gap-2">
              <TransmissionOption
                label="Voice activity"
                selected={voiceSettings.transmissionMode === "voice_activity"}
                onPress={() =>
                  actions.updateVoiceSettingsPatch({ transmissionMode: "voice_activity" })
                }
              />
              <TransmissionOption
                label="Open mic"
                selected={voiceSettings.transmissionMode === "open_mic"}
                onPress={() =>
                  actions.updateVoiceSettingsPatch({ transmissionMode: "open_mic" })
                }
              />
            </View>
            <View className="rounded-lg bg-surface-panel p-3">
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-sm font-medium text-foreground">Input level</Text>
                <Text className="text-xs text-muted-foreground">{levelPercent}</Text>
              </View>
              <View className="h-2 overflow-hidden rounded-full bg-surface-embedded">
                <View className="h-full rounded-full bg-primary" style={{ width: levelWidth }} />
              </View>
              <View className="mt-3 flex-row items-center justify-between">
                <Pressable
                  accessibilityRole="button"
                  className="h-9 w-9 items-center justify-center rounded-lg bg-surface-embedded active:bg-surface-hover"
                  onPress={() =>
                    actions.updateVoiceSettingsPatch({
                      voiceActivationThreshold: Math.max(0, threshold - 5),
                    })
                  }
                >
                  <ThemedIonicons name="remove" size={18} colorClassName="accent-foreground" />
                </Pressable>
                <Text className="text-sm text-muted-foreground">
                  Threshold {threshold}%
                </Text>
                <Pressable
                  accessibilityRole="button"
                  className="h-9 w-9 items-center justify-center rounded-lg bg-surface-embedded active:bg-surface-hover"
                  onPress={() =>
                    actions.updateVoiceSettingsPatch({
                      voiceActivationThreshold: Math.min(100, threshold + 5),
                    })
                  }
                >
                  <ThemedIonicons name="add" size={18} colorClassName="accent-foreground" />
                </Pressable>
              </View>
            </View>
          </View>

          <View className="gap-3">
            <Text className="text-base font-semibold text-foreground">Audio output</Text>
            <View className="flex-row flex-wrap gap-2">
              {state.outputDevices.map((device) => {
                const selected = state.selectedOutputDeviceId === device.id;
                return (
                  <Pressable
                    key={device.id}
                    accessibilityRole="button"
                    onPress={() => actions.setOutputDevice(device.id)}
                    className={[
                      "rounded-lg px-3 py-2.5 active:opacity-80",
                      selected ? "bg-primary" : "bg-surface-panel",
                    ].join(" ")}
                  >
                    <Text
                      className={[
                        "text-sm font-semibold",
                        selected ? "text-primary-foreground" : "text-foreground",
                      ].join(" ")}
                    >
                      {device.label}
                    </Text>
                  </Pressable>
                );
              })}
              {Platform.OS === "ios" ? (
                <Pressable
                  accessibilityRole="button"
                  className="rounded-lg bg-surface-panel px-3 py-2.5 active:bg-surface-hover"
                  onPress={actions.showSystemRoutePicker}
                >
                  <Text className="text-sm font-semibold text-foreground">System picker</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {state.participants.length > 0 ? (
            <View className="gap-3">
              <Text className="text-base font-semibold text-foreground">Participant volume</Text>
              {state.participants.map((participant) => {
                const volume = state.remoteVolumes[participant.userId] ?? 100;
                return (
                  <View
                    key={participant.userId}
                    className="flex-row items-center gap-3 rounded-lg bg-surface-panel px-3 py-3"
                  >
                    <ParticipantAvatar
                      displayName={participant.displayName}
                      avatarUrl={participant.avatarUrl}
                      speaking={participant.isSpeaking}
                    />
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                        {participant.displayName}
                      </Text>
                      <Text className="text-xs text-muted-foreground">{volume}%</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      className="h-9 w-9 items-center justify-center rounded-lg bg-surface-embedded active:bg-surface-hover"
                      onPress={() => actions.setMemberVolume(participant.userId, volume - 10)}
                    >
                      <ThemedIonicons name="remove" size={18} colorClassName="accent-foreground" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      className="h-9 w-9 items-center justify-center rounded-lg bg-surface-embedded active:bg-surface-hover"
                      onPress={() => actions.setMemberVolume(participant.userId, volume + 10)}
                    >
                      <ThemedIonicons name="add" size={18} colorClassName="accent-foreground" />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </HavenModalShell>
  );
}
