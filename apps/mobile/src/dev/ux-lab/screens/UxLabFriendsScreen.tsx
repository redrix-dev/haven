import { ScrollView } from "@/components/ui/scroll-view";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { uxLabFriends } from "../UxLabData";
import { UxLabTopBar } from "../components/UxLabTopBar";
import { useUxLabNavigationActions } from "../UxLabNavigationActions";

const presenceClassName = {
  online: "bg-status-online",
  away: "bg-status-away",
  offline: "bg-muted",
};

export function UxLabFriendsScreen() {
  const { goToSurface } = useUxLabNavigationActions();

  return (
    <VStack className="flex-1 bg-background">
      <UxLabTopBar
        title="Friends"
        subtitle="Requests, presence, and DM entry"
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {uxLabFriends.map((friend) => (
          <Box
            key={friend.id}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <HStack space="md" className="items-center">
              <Box className="relative h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Text bold className="text-foreground">
                  {friend.name.charAt(0)}
                </Text>
                <Box
                  className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border border-card ${
                    presenceClassName[friend.presence]
                  }`}
                />
              </Box>
              <VStack className="min-w-0 flex-1">
                <Text bold className="text-foreground">
                  {friend.name}
                </Text>
                <Text size="sm" className="text-muted-foreground">
                  {friend.status}
                </Text>
              </VStack>
              <Button
                size="sm"
                variant="outline"
                onPress={() => goToSurface("dms")}
              >
                <ButtonText>DM</ButtonText>
              </Button>
            </HStack>
          </Box>
        ))}
      </ScrollView>
    </VStack>
  );
}
