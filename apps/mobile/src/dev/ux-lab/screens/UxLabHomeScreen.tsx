import { ScrollView } from "@/components/ui/scroll-view";
import { Box } from "@/components/ui/box";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { uxLabCommunities } from "../UxLabData";
import { useUxLabNavigationActions } from "../UxLabNavigationActions";
import { useUxLabStore } from "../UxLabStore";
import { UxLabTopBar } from "../components/UxLabTopBar";

export function UxLabHomeScreen() {
  const selectCommunity = useUxLabStore((s) => s.selectCommunity);
  const { goToSurface } = useUxLabNavigationActions();

  return (
    <VStack className="flex-1 bg-background">
      <UxLabTopBar title="UX Lab" subtitle="Fake app, real navigation feel" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <VStack space="md">
          <Text size="2xl" bold className="text-foreground">
            Choose a route to feel
          </Text>
          <Text size="sm" className="text-muted-foreground">
            This surface uses pseudo data only. Use it to test shell, hierarchy,
            sheet, modal, and back behavior without touching production state.
          </Text>
        </VStack>

        <HStack space="sm" className="flex-wrap">
          <Button variant="outline" onPress={() => goToSurface("dms")}>
            <ButtonText>DMs</ButtonText>
          </Button>
          <Button variant="outline" onPress={() => goToSurface("friends")}>
            <ButtonText>Friends</ButtonText>
          </Button>
          <Button
            variant="outline"
            onPress={() => goToSurface("notifications")}
          >
            <ButtonText>Notifications</ButtonText>
          </Button>
          <Button
            variant="outline"
            onPress={() => goToSurface("themeSpecimen")}
          >
            <ButtonText>Theme specimen</ButtonText>
          </Button>
        </HStack>

        <VStack space="sm">
          {uxLabCommunities.map((community) => (
            <Pressable
              key={community.id}
              onPress={() => {
                selectCommunity(community.id);
                goToSurface("community");
              }}
            >
              <Box className="rounded-2xl border border-border bg-card p-4">
                <HStack space="md" className="items-center">
                  <Box className="h-12 w-12 items-center justify-center rounded-2xl bg-primary">
                    <Text bold className="text-primary-foreground">
                      {community.accent}
                    </Text>
                  </Box>
                  <VStack className="min-w-0 flex-1">
                    <Text bold className="text-foreground" numberOfLines={1}>
                      {community.name}
                    </Text>
                    <Text
                      size="sm"
                      className="text-muted-foreground"
                      numberOfLines={2}
                    >
                      {community.description}
                    </Text>
                  </VStack>
                  {community.unreadCount > 0 ? (
                    <Badge>
                      <BadgeText>{community.unreadCount}</BadgeText>
                    </Badge>
                  ) : null}
                </HStack>
              </Box>
            </Pressable>
          ))}
        </VStack>
      </ScrollView>
    </VStack>
  );
}
