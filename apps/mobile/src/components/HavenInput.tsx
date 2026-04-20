import { useState } from "react";
import { TextInput, type TextInputProps } from "react-native";

interface HavenInputProps extends TextInputProps {
  // add any Haven-specific props here later
}

export function HavenInput({ className, ...props }: HavenInputProps) {
  const [focused, setFocused] = useState(false);
  /* placeholderTextColor: shared globals --muted-foreground (#a9b8cf); RN needs a string. */
  return (
    <TextInput
      className={`rounded-xl px-4 py-3 text-foreground bg-input ${
        focused ? "border-2 border-primary" : "border border-border"
      } ${className ?? ""}`}
      placeholderTextColor="#a9b8cf"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...props}
    />
  );
}