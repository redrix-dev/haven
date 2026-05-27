// apps/mobile/src/features/user-profile/UserAccountCard.tsx
import { ThemedIonicons } from "@/theme-rn";
import { Image, Pressable, Text, TextInput, View } from "react-native";

type UserAccountCardProps = {
  email: string | null;
  displayUsername: string;
  inputUsername: string;
  avatarUrl: string | null;
  isEditingName: boolean;
  isSaving?: boolean;
  usernameMaxLength?: number;
  onPressEditName: () => void;
  onPressCancelEditName: () => void;
  onChangeUsername: (next: string) => void;
  onPressAvatar: () => void | Promise<void>;
  onPressSave: () => void | Promise<void>;
};

export default function UserAccountCard({
  email,
  displayUsername,
  inputUsername,
  avatarUrl,
  isEditingName,
  isSaving = false,
  usernameMaxLength = 32,
  onPressEditName,
  onPressCancelEditName,
  onChangeUsername,
  onPressAvatar,
  onPressSave,
}: UserAccountCardProps) {
  const trimmedDisplayUsername = displayUsername.trim();
  const trimmedInputUsername = inputUsername.trim();
  const isChanged = trimmedInputUsername !== trimmedDisplayUsername;
  const showSave = isEditingName && trimmedInputUsername.length > 0 && isChanged;
  const canSave = !isSaving && showSave;
  const avatarInitial = trimmedDisplayUsername.charAt(0).toUpperCase() || "U";
  const subtitle = email ?? "No email";

  return (
    <View className="rounded-2xl bg-[#1C1C1E] px-4 py-3 gap-3">
      {/* Top row */}
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => void onPressAvatar()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          className="rounded-full"
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} className="h-15 w-15 rounded-full" />
          ) : (
            <View className="h-15 w-15 rounded-full bg-[#2C2C2E] items-center justify-center">
              <Text className="text-foreground text-[22px] font-semibold">{avatarInitial}</Text>
            </View>
          )}

          <View className="absolute -bottom-0.5 -right-0.5 h-5.5 w-5.5 rounded-full bg-[#0A84FF] border-2 border-[#1C1C1E] items-center justify-center">
            <ThemedIonicons name="camera" size={12} colorClassName="accent-primary-foreground" />
          </View>
        </Pressable>

        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text numberOfLines={1} className="flex-1 text-foreground text-[17px] font-semibold">
              {trimmedDisplayUsername || "User"}
            </Text>
            <Pressable
              onPress={isEditingName ? onPressCancelEditName : onPressEditName}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={isEditingName ? "Cancel editing username" : "Edit username"}
            >
              <ThemedIonicons
                name={isEditingName ? "close-outline" : "pencil-outline"}
                size={16}
                colorClassName="accent-muted-foreground"
              />
            </Pressable>
          </View>
          <Text numberOfLines={1} className="mt-0.5 text-[#8E8E93] text-[13px]">
            {subtitle}
          </Text>
        </View>
      </View>

      {isEditingName ? (
        <View className="gap-1.5">
          <Text className="text-[#8E8E93] text-xs font-semibold">Username</Text>
          <TextInput
            value={inputUsername}
            onChangeText={onChangeUsername}
            maxLength={usernameMaxLength}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Username"
            // uniwind-theme-allow mobile-theme/no-raw-color-prop - iOS muted placeholder; no semantic token for iOS system gray
            placeholderTextColor="#8E8E93"
            editable={!isSaving}
            className="rounded-xl border border-[#3A3A3C] bg-[#2C2C2E] px-3 py-2.5 text-foreground text-base"
          />
          <Text className="text-right text-[#8E8E93] text-[11px]">
            {inputUsername.length}/{usernameMaxLength}
          </Text>
        </View>
      ) : null}

      {showSave ? (
        <Pressable
          onPress={() => void onPressSave()}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel="Save account settings"
          className={`rounded-xl py-2.5 items-center justify-center ${
            canSave ? "bg-[#0A84FF]" : "bg-[#3A3A3C] opacity-70"
          }`}
        >
          <Text className="text-foreground text-[15px] font-semibold">
            {isSaving ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}