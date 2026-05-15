import { useCallback, useState } from "react";
import { useFocusEffect, useIsFocused, useNavigation } from "@react-navigation/native";
import { Box } from "@/components/ui/box";
import NotificationsContainer, {
  type NotificationsFriendsPanelOpenInput,
} from "@/features/notifications/NotificationsContainer";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useNotificationsStore } from "@shared/stores/notificationsStore";

type SubScreen = "list" | "preferences" | "modmail";

/**
 * haven-rev2: notifications + preferences + modmail — same `NotificationsContainer` as legacy shell.
 */
export function Rev2NotificationsScreen() {
  const [subScreen, setSubScreen] = useState<SubScreen>("list");
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const setWorkspaceMode = useNavigationStore((s) => s.setWorkspaceMode);

  useFocusEffect(
    useCallback(() => {
      useNotificationsStore.getState().setIsPanelOpen(true);
      return () => {
        useNotificationsStore.getState().setIsPanelOpen(false);
      };
    }, []),
  );

  const handleOpenDirectMessages = useCallback(() => {
    setWorkspaceMode("dm");
  }, [setWorkspaceMode]);

  const handleOpenFriendsPanel = useCallback(
    (input: NotificationsFriendsPanelOpenInput) => {
      const parent = navigation.getParent();
      if (!parent || typeof (parent as { navigate?: unknown }).navigate !== "function") return;
      (parent as { navigate: (name: string, params?: object) => void }).navigate("Rev2Friends", {
        screen: "Rev2FriendsHome",
        params: {
          initialTab: input.tab === "requests" ? "requests" : "friends",
          highlightedRequestId: input.highlightedRequestId,
        },
      });
    },
    [navigation],
  );

  return (
    <Box className="min-h-0 flex-1 bg-background px-4 pb-2 pt-2">
      <NotificationsContainer
        subScreen={subScreen}
        onSubScreenChange={setSubScreen}
        modalVisible={isFocused}
        onCloseModal={() => setSubScreen("list")}
        onOpenFriendsPanel={handleOpenFriendsPanel}
        onOpenDirectMessages={handleOpenDirectMessages}
      />
    </Box>
  );
}
