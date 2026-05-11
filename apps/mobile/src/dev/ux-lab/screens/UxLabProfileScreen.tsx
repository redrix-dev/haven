import { ScrollView } from "@/components/ui/scroll-view";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { UxLabTopBar } from "../components/UxLabTopBar";
import { useUxLabNavigationActions } from "../UxLabNavigationActions";

export function UxLabProfileScreen() {
  const { goToSurface } = useUxLabNavigationActions();

  return (
    <VStack className="flex-1 bg-background">
      <UxLabTopBar title="Profile" subtitle="Account card and identity flows" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Box className="items-center rounded-3xl border border-border bg-card p-6">
          <Box className="h-20 w-20 items-center justify-center rounded-full bg-primary">
            <Text size="3xl" bold className="text-primary-foreground">
              C
            </Text>
          </Box>
          <Text size="xl" bold className="mt-4 text-foreground">
            Cody
          </Text>
          <Text size="sm" className="text-center text-muted-foreground">
            Premium-feeling fake profile surface for layout iteration.
          </Text>
        </Box>
        <HStack space="sm">
          <Button className="flex-1" onPress={() => goToSurface("settings")}>
            <ButtonText>Settings</ButtonText>
          </Button>
          <Button
            className="flex-1"
            variant="outline"
            onPress={() => goToSurface("friends")}
          >
            <ButtonText>Friends</ButtonText>
          </Button>
        </HStack>
      </ScrollView>
    </VStack>
  );
}
