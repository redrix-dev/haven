import { ScrollView } from "@/components/ui/scroll-view";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { uxLabNotifications } from "../UxLabData";
import { UxLabTopBar } from "../components/UxLabTopBar";
import { useUxLabNavigationActions } from "../UxLabNavigationActions";
import { useUxLabStore } from "../UxLabStore";

export function UxLabNotificationsScreen() {
  const readIds = useUxLabStore((s) => s.readNotificationIds);
  const markRead = useUxLabStore((s) => s.markNotificationRead);
  const markAllRead = useUxLabStore((s) => s.markAllNotificationsRead);
  const { goToSurface } = useUxLabNavigationActions();

  return (
    <VStack className="flex-1 bg-background">
      <UxLabTopBar
        title="Notifications"
        subtitle="Routing from alerts into surfaces"
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Button variant="outline" onPress={markAllRead}>
          <ButtonText>Mark all read</ButtonText>
        </Button>
        {uxLabNotifications.map((notification) => {
          const unread = !readIds.includes(notification.id);
          return (
            <Pressable
              key={notification.id}
              onPress={() => {
                markRead(notification.id);
                goToSurface(notification.surface);
              }}
            >
              <Box className="rounded-2xl border border-border bg-card p-4">
                <HStack className="items-start justify-between">
                  <VStack className="min-w-0 flex-1">
                    <Text bold className="text-foreground">
                      {notification.title}
                    </Text>
                    <Text size="sm" className="text-muted-foreground">
                      {notification.body}
                    </Text>
                  </VStack>
                  {unread ? (
                    <Badge>
                      <BadgeText>new</BadgeText>
                    </Badge>
                  ) : null}
                </HStack>
              </Box>
            </Pressable>
          );
        })}
      </ScrollView>
    </VStack>
  );
}
