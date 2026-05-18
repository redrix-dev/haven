import type { NavigatorScreenParams } from "@react-navigation/native";

export type MainStackParamList = {
  Home: undefined;
  Community: { serverId: string; openDrawer?: boolean };
};

/** @deprecated Use MainStackParamList — kept for gradual migration. */
export type MainTabParamList = {
  Home: undefined;
  Community: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<MainStackParamList> | undefined;
  PasswordRecovery: { flow?: "requestReset" | "setNewPassword" } | undefined;
  SignUp: undefined;
};
