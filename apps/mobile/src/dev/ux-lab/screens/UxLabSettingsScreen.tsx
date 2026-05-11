import { ScrollView } from "@/components/ui/scroll-view";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { UxLabTopBar } from "../components/UxLabTopBar";
import { useUxLabStore } from "../UxLabStore";

const rows = [
  "Account",
  "Theme behavior",
  "Notification routing",
  "Privacy controls",
  "Voice and calls",
];

export function UxLabSettingsScreen() {
  const setOpenSheet = useUxLabStore((s) => s.setOpenSheet);

  return (
    <VStack className="flex-1 bg-background">
      <UxLabTopBar
        title="Settings"
        subtitle="Global versus contextual settings"
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Box className="rounded-2xl border border-border bg-card p-4">
          <Text bold className="text-foreground">
            Settings shell experiment
          </Text>
          <Text size="sm" className="mt-2 text-muted-foreground">
            Use this to test whether settings should be a modal, screen, sheet,
            or a persistent global surface.
          </Text>
        </Box>
        {rows.map((row) => (
          <HStack
            key={row}
            className="items-center justify-between rounded-2xl border border-border bg-card p-4"
          >
            <Text className="text-foreground">{row}</Text>
            <Text size="sm" className="text-muted-foreground">
              Configure
            </Text>
          </HStack>
        ))}
        <Button variant="outline" onPress={() => setOpenSheet("quick-actions")}>
          <ButtonText>Open quick actions sheet</ButtonText>
        </Button>
      </ScrollView>
    </VStack>
  );
}
