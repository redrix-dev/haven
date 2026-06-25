import { Show } from "solid-js";
import * as KTextField from "@kobalte/core/text-field";
import { cn } from "./cn";

export type TextFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string | null;
  type?: "text" | "email" | "password";
  placeholder?: string;
  autocomplete?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  class?: string;
};

export function TextField(props: TextFieldProps) {
  return (
    <KTextField.Root
      value={props.value}
      onChange={props.onChange}
      name={props.name}
      validationState={props.error ? "invalid" : "valid"}
      required={props.required}
      disabled={props.disabled}
      class={cn("flex flex-col gap-1", props.class)}
    >
      <Show when={props.label}>
        <KTextField.Label class="text-sm font-medium text-form-label">
          {props.label}
        </KTextField.Label>
      </Show>
      <KTextField.Input
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        autocomplete={props.autocomplete}
        class={cn(
          "rounded-lg border border-input bg-surface-input px-3 py-2 text-sm text-foreground",
          "placeholder:text-muted-foreground",
          "focus:border-primary focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      <KTextField.ErrorMessage class="text-sm text-destructive">
        {props.error}
      </KTextField.ErrorMessage>
    </KTextField.Root>
  );
}
