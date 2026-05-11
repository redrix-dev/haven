import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { useUxLabStore } from "../UxLabStore";
import { UxLabIcon } from "./UxLabIcon";

export function UxLabComposer() {
  const { bottom } = useSafeAreaInsets();
  const draft = useUxLabStore((s) => s.composerDraft);
  const setDraft = useUxLabStore((s) => s.setComposerDraft);
  const sendDraft = useUxLabStore((s) => s.sendComposerDraft);

  return (
    <KeyboardStickyView
      offset={{ opened: 8 }}
      style={{
        position: "absolute",
        bottom: bottom + 8,
        left: 0,
        right: 0,
      }}
    >
      <Box className="px-3">
        <HStack
          space="sm"
          className="items-center rounded-2xl border border-border bg-surface-modal p-2"
        >
          <Pressable
            accessibilityRole="button"
            className="h-9 w-9 items-center justify-center rounded-full bg-muted"
          >
            <UxLabIcon
              name="add"
              size={20}
              colorClassName="accent-muted-foreground"
            />
          </Pressable>
          <Input className="min-h-10 flex-1 rounded-xl bg-card px-1 py-1">
            <InputField
              placeholder="Type a fake message..."
              value={draft}
              onChangeText={setDraft}
              returnKeyType="send"
              onSubmitEditing={sendDraft}
            />
          </Input>
          <Button size="icon" isDisabled={!draft.trim()} onPress={sendDraft}>
            <ButtonText>
              <UxLabIcon
                name="arrow-up"
                size={17}
                colorClassName="accent-primary-foreground"
              />
            </ButtonText>
          </Button>
        </HStack>
      </Box>
    </KeyboardStickyView>
  );
}
