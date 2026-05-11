import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { uxLabChannels, uxLabCommunities } from "../UxLabData";
import { UxLabComposer } from "../components/UxLabComposer";
import { UxLabIcon } from "../components/UxLabIcon";
import { UxLabMessageList } from "../components/UxLabMessageList";
import { UxLabTopBar } from "../components/UxLabTopBar";
import { useUxLabNavigationActions } from "../UxLabNavigationActions";
import { useUxLabStore } from "../UxLabStore";

export function UxLabCommunityScreen() {
  const activeCommunityId = useUxLabStore((s) => s.activeCommunityId);
  const activeChannelId = useUxLabStore((s) => s.activeChannelId);
  const setOpenSheet = useUxLabStore((s) => s.setOpenSheet);
  const { goToSurface } = useUxLabNavigationActions();
  const community = uxLabCommunities.find(
    (item) => item.id === activeCommunityId,
  );
  const channel = uxLabChannels.find((item) => item.id === activeChannelId);

  return (
    <VStack className="flex-1 bg-background">
      <UxLabTopBar
        title={community?.name ?? "Community"}
        subtitle="Custom shell experiment"
      />
      <HStack className="items-center border-b border-border bg-card px-3 py-2">
        <Pressable
          className="max-w-[48%] rounded-xl px-2 py-2"
          onPress={() => setOpenSheet("community-switcher")}
        >
          <Text size="sm" bold className="text-foreground" numberOfLines={1}>
            {community?.name ?? "Community"}
          </Text>
        </Pressable>
        <Pressable
          className="min-w-0 flex-1 flex-row items-center justify-center rounded-xl px-2 py-2"
          onPress={() => setOpenSheet("channel-switcher")}
        >
          <Text size="sm" bold className="text-foreground" numberOfLines={1}>
            # {channel?.name ?? "channel"}
          </Text>
          <UxLabIcon
            name="chevron-down"
            size={16}
            colorClassName="accent-muted-foreground"
          />
        </Pressable>
      </HStack>

      <Box className="border-b border-border-row bg-surface-panel px-4 py-3">
        <Text size="xs" bold className="text-form-label">
          Channel topic
        </Text>
        <Text size="sm" className="mt-1 text-body-soft">
          {channel?.topic ?? "Use this surface to test realistic chat density."}
        </Text>
      </Box>

      <Box className="flex-1 bg-background">
        <UxLabMessageList />
        <UxLabComposer />
      </Box>

      <HStack
        space="sm"
        className="border-t border-border bg-surface-modal px-3 py-2"
      >
        <Button variant="outline" size="sm" onPress={() => goToSurface("dms")}>
          <ButtonText>Open DMs</ButtonText>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => setOpenSheet("quick-actions")}
        >
          <ButtonText>Actions</ButtonText>
        </Button>
      </HStack>
    </VStack>
  );
}
