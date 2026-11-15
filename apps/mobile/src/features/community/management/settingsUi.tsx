import type { ReactNode } from "react";
import { Modal, Pressable, Switch, Text, TextInput, View } from "react-native";
import { resolveColorProp } from "@shared/themes";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";

/** The small pieces the community settings sections share. */

export function SettingsButton({
  label,
  onPress,
  disabled,
  tone = "default",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "default" | "destructive";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-xl px-4 py-2.5 ${
        tone === "primary"
          ? "bg-primary"
          : tone === "destructive"
            ? "bg-destructive/15"
            : "bg-surface-panel active:bg-surface-hover"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={`text-center text-sm font-semibold ${
          tone === "primary"
            ? "text-primary-foreground"
            : tone === "destructive"
              ? "text-destructive"
              : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SettingsField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  editable?: boolean;
}) {
  const tokens = useMobileThemeTokens();
  const placeholderColor =
    resolveColorProp(tokens, "muted-foreground") ?? "#8b9cbb";
  return (
    <View className="mb-3">
      <Text className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        multiline={multiline}
        editable={editable}
        className={`rounded-xl border border-border-control bg-surface-panel px-3 py-2.5 text-sm text-foreground ${
          multiline ? "min-h-22" : ""
        }`}
      />
    </View>
  );
}

export function SettingsToggle({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View className="mb-2 flex-row items-center gap-3 rounded-xl bg-surface-panel px-3 py-3">
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {description ? (
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
      />
    </View>
  );
}

export function Choices<T>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View className="mb-3 flex-row flex-wrap gap-2">
      {options.map((option) => (
        <Pressable
          key={option.label}
          accessibilityRole="radio"
          accessibilityState={{ selected: option.value === value }}
          disabled={disabled}
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

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </Text>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </Text>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text className="py-3 text-sm text-muted-foreground">{children}</Text>;
}

/** A centred sheet over the settings, for an editor or a list. */
export function EditorSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - modal scrim overlay, invariant across themes */}
      <Pressable
        className="flex-1 justify-center bg-black/60 px-4"
        onPress={onClose}
      >
        <Pressable
          className="max-h-[88%] rounded-2xl border border-border-panel bg-card p-4"
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="mb-3 text-lg font-semibold text-foreground">
            {title}
          </Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
