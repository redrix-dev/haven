import type { NavigatorScreenParams } from "@react-navigation/native";

export type MainStackParamList = {
  CommunityEntry: undefined;
  Community: { serverId: string | null; openDrawer?: boolean };
  DirectMessages: { openConversationId?: string } | undefined;
  Notifications: undefined;
  Profile: undefined;
  Settings: undefined;
};

/** @deprecated Use MainStackParamList — kept for gradual migration. */
export type MainTabParamList = {
  CommunityEntry: undefined;
  Community: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<MainStackParamList> | undefined;
  PasswordRecovery: { flow?: "requestReset" | "setNewPassword" } | undefined;
  SignUp: undefined;
};
