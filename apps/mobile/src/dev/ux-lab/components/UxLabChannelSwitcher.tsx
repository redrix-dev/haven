import {
  ActionsheetItem,
  ActionsheetItemText,
  ActionsheetScrollView,
} from "@/components/ui/actionsheet";
import { Badge, BadgeText } from "@/components/ui/badge";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { uxLabChannels } from "../UxLabData";
import { useUxLabStore } from "../UxLabStore";
import { UxLabSheet } from "./UxLabSheet";

export function UxLabChannelSwitcher() {
  const activeCommunityId = useUxLabStore((s) => s.activeCommunityId);
  const activeChannelId = useUxLabStore((s) => s.activeChannelId);
  const selectChannel = useUxLabStore((s) => s.selectChannel);
  const channels = uxLabChannels.filter(
    (channel) => channel.communityId === activeCommunityId,
  );

  return (
    <UxLabSheet
      sheet="channel-switcher"
      title="Switch channel"
      subtitle="Try channel selection as a bottom sheet."
    >
      <ActionsheetScrollView>
        {channels.map((channel) => (
          <ActionsheetItem
            key={channel.id}
            onPress={() => selectChannel(channel.id)}
          >
            <HStack space="md" className="min-w-0 flex-1 items-center">
              <VStack className="min-w-0 flex-1">
                <ActionsheetItemText bold={channel.id === activeChannelId}>
                  # {channel.name}
                </ActionsheetItemText>
                <Text
                  size="xs"
                  className="text-muted-foreground"
                  numberOfLines={1}
                >
                  {channel.topic}
                </Text>
              </VStack>
              {channel.unreadCount > 0 ? (
                <Badge variant="secondary">
                  <BadgeText>{channel.unreadCount}</BadgeText>
                </Badge>
              ) : null}
            </HStack>
          </ActionsheetItem>
        ))}
      </ActionsheetScrollView>
    </UxLabSheet>
  );
}
