import type { NavigatorScreenParams } from "@react-navigation/native";
import type { FriendsTab } from "@/features/friends/FriendsSurface";

export type MainStackParamList = {
  CommunityEntry: undefined;
  Community: {
    serverId?: string | null;
    openDrawer?: boolean;
    pendingDmConversationId?: string;
    /** From an invite link: open the join sheet pre-filled with this code. */
    pendingInviteCode?: string;
  };
  Friends:
    | { initialTab?: FriendsTab; highlightedRequestId?: string | null }
    | undefined;
  /** Someone's friend link, opened: shows who it is from and asks. */
  FriendLink: { code: string };
  Notifications: undefined;
  Profile: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<MainStackParamList> | undefined;
  PasswordRecovery: { flow?: "requestReset" | "setNewPassword" } | undefined;
  SignUp: undefined;
};
