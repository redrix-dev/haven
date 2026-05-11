import {
  ActionsheetItem,
  ActionsheetItemText,
  ActionsheetScrollView,
} from "@/components/ui/actionsheet";
import { Badge, BadgeText } from "@/components/ui/badge";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { uxLabCommunities } from "../UxLabData";
import { useUxLabStore } from "../UxLabStore";
import { UxLabSheet } from "./UxLabSheet";

export function UxLabCommunitySwitcher() {
  const activeCommunityId = useUxLabStore((s) => s.activeCommunityId);
  const selectCommunity = useUxLabStore((s) => s.selectCommunity);

  return (
    <UxLabSheet
      sheet="community-switcher"
      title="Switch community"
      subtitle="Hardcoded communities for navigation feel."
    >
      <ActionsheetScrollView>
        {uxLabCommunities.map((community) => (
          <ActionsheetItem
            key={community.id}
            onPress={() => selectCommunity(community.id)}
          >
            <HStack space="md" className="min-w-0 flex-1 items-center">
              <VStack className="min-w-0 flex-1">
                <ActionsheetItemText bold={community.id === activeCommunityId}>
                  {community.name}
                </ActionsheetItemText>
                <Text
                  size="xs"
                  className="text-muted-foreground"
                  numberOfLines={1}
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
          </ActionsheetItem>
        ))}
      </ActionsheetScrollView>
    </UxLabSheet>
  );
}
