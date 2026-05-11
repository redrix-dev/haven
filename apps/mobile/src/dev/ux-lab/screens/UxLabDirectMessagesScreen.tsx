import { ScrollView } from "@/components/ui/scroll-view";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { uxLabDmThreads } from "../UxLabData";
import { UxLabTopBar } from "../components/UxLabTopBar";
import { useUxLabNavigationActions } from "../UxLabNavigationActions";
import { useUxLabStore } from "../UxLabStore";

export function UxLabDirectMessagesScreen() {
  const activeDmThreadId = useUxLabStore((s) => s.activeDmThreadId);
  const selectDmThread = useUxLabStore((s) => s.selectDmThread);
  const { goToSurface } = useUxLabNavigationActions();
  const activeThread = uxLabDmThreads.find(
    (thread) => thread.id === activeDmThreadId,
  );

  return (
    <VStack className="flex-1 bg-background">
      <UxLabTopBar
        title="Direct messages"
        subtitle="Inbox versus full surface"
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {uxLabDmThreads.map((thread) => (
          <Pressable key={thread.id} onPress={() => selectDmThread(thread.id)}>
            <Box
              className={`rounded-2xl border p-4 ${
                thread.id === activeDmThreadId
                  ? "border-primary bg-card"
                  : "border-border bg-card"
              }`}
            >
              <HStack space="md" className="items-center">
                <Box className="h-11 w-11 items-center justify-center rounded-full bg-muted">
                  <Text bold className="text-foreground">
                    {thread.name.charAt(0)}
                  </Text>
                </Box>
                <VStack className="min-w-0 flex-1">
                  <Text bold className="text-foreground">
                    {thread.name}
                  </Text>
                  <Text
                    size="sm"
                    className="text-muted-foreground"
                    numberOfLines={1}
                  >
                    {thread.preview}
                  </Text>
                </VStack>
                {thread.unreadCount > 0 ? (
                  <Badge>
                    <BadgeText>{thread.unreadCount}</BadgeText>
                  </Badge>
                ) : null}
              </HStack>
            </Box>
          </Pressable>
        ))}

        <Box className="rounded-2xl border border-border bg-surface-modal p-4">
          <Text bold className="text-foreground">
            {activeThread
              ? `Thread: ${activeThread.name}`
              : "No thread selected"}
          </Text>
          <Text size="sm" className="mt-2 text-muted-foreground">
            This area is intentionally local state only, so modal DMs,
            full-screen DMs, or split inbox/thread layouts can be swapped fast.
          </Text>
          <Button className="mt-4" onPress={() => goToSurface("community")}>
            <ButtonText>Back to community</ButtonText>
          </Button>
        </Box>
      </ScrollView>
    </VStack>
  );
}
