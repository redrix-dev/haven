import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
} from "@/components/ui/actionsheet";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useUxLabStore } from "../UxLabStore";

type UxLabSheetProps = {
  sheet: "community-switcher" | "channel-switcher" | "quick-actions";
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function UxLabSheet({
  sheet,
  title,
  subtitle,
  children,
}: UxLabSheetProps) {
  const openSheet = useUxLabStore((s) => s.openSheet);
  const setOpenSheet = useUxLabStore((s) => s.setOpenSheet);

  return (
    <Actionsheet
      isOpen={openSheet === sheet}
      onClose={() => setOpenSheet(null)}
    >
      <ActionsheetBackdrop />
      <ActionsheetContent>
        <ActionsheetDragIndicatorWrapper>
          <ActionsheetDragIndicator />
        </ActionsheetDragIndicatorWrapper>
        <VStack space="xs" className="w-full px-3 pb-3">
          <Text size="lg" bold className="text-foreground">
            {title}
          </Text>
          {subtitle ? (
            <Text size="sm" className="text-muted-foreground">
              {subtitle}
            </Text>
          ) : null}
        </VStack>
        {children}
      </ActionsheetContent>
    </Actionsheet>
  );
}
