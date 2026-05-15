import { useRoute, type RouteProp } from "@react-navigation/native";
import { useAuthStore } from "@shared/stores/authStore";
import { FriendsModalContainer } from "@/features/friends/FriendsModalContainer";
import { useMobileDirectMessages } from "@/contexts/MobileDirectMessagesContext";
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import type { Rev2FriendsStackParamList } from "@/haven-rev2/navigation/types";
import { useDmBubbleShellStore } from "@/haven-rev2/stores/dmBubbleShellStore";

type FriendsRoute = RouteProp<Rev2FriendsStackParamList, "Rev2FriendsHome">;

export function Rev2FriendsScreen() {
  const route = useRoute<FriendsRoute>();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const {
    actions: { openDirectMessageDraftWithUser },
  } = useMobileDirectMessages();

  const initialTab = route.params?.initialTab ?? "friends";
  const highlightedRequestId = route.params?.highlightedRequestId ?? null;

  if (!userId) {
    return (
      <Box className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-center text-muted-foreground">Sign in to use Friends.</Text>
      </Box>
    );
  }

  return (
    <Box className="min-h-0 flex-1 bg-background">
      <FriendsModalContainer
        visible
        userId={userId}
        initialTab={initialTab}
        highlightedRequestId={highlightedRequestId}
        onStartDirectMessage={(friendUserId, displayLabel) => {
          useDmBubbleShellStore.getState().requestExpandDmBubble();
          openDirectMessageDraftWithUser(friendUserId, displayLabel);
        }}
      />
    </Box>
  );
}
