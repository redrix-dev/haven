// apps/mobile/src/features/user-profile/UserAccountCard.tsx
import { ThemedIonicons } from "@/theme-rn";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { resolveColorProp } from "@shared/themes";
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
  const themeTokens = useMobileThemeTokens();
  const placeholderColor =
    resolveColorProp(themeTokens, "muted-foreground") ?? "#8b9cbb";
  const trimmedDisplayUsername = displayUsername.trim();
  const trimmedInputUsername = inputUsername.trim();
  const isChanged = trimmedInputUsername !== trimmedDisplayUsername;
  const showSave = isEditingName && trimmedInputUsername.length > 0 && isChanged;
  const canSave = !isSaving && showSave;
  const avatarInitial = trimmedDisplayUsername.charAt(0).toUpperCase() || "U";
  const subtitle = email ?? "No email";

  return (
    <View className="rounded-2xl bg-surface-panel px-4 py-3 gap-3">
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
            <View className="h-15 w-15 rounded-full bg-surface-embedded items-center justify-center">
              <Text className="text-foreground text-[22px] font-semibold">{avatarInitial}</Text>
            </View>
          )}

          <View className="absolute -bottom-0.5 -right-0.5 h-5.5 w-5.5 rounded-full bg-primary border-2 border-surface-panel items-center justify-center">
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
          <Text numberOfLines={1} className="mt-0.5 text-muted-foreground text-[13px]">
            {subtitle}
          </Text>
        </View>
      </View>

      {isEditingName ? (
        <View className="gap-1.5">
          <Text className="text-muted-foreground text-xs font-semibold">Username</Text>
          <TextInput
            value={inputUsername}
            onChangeText={onChangeUsername}
            maxLength={usernameMaxLength}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Username"
            placeholderTextColor={placeholderColor}
            editable={!isSaving}
            className="rounded-xl border border-border-control bg-surface-embedded px-3 py-2.5 text-foreground text-base"
          />
          <Text className="text-right text-muted-foreground text-[11px]">
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
            canSave ? "bg-primary active:bg-primary-hover" : "bg-surface-embedded opacity-70"
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
