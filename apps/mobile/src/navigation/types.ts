import type { NavigatorScreenParams } from "@react-navigation/native";

export type MainTabParamList = {
  Home: undefined;
  Community: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  PasswordRecovery: { flow?: "requestReset" | "setNewPassword" } | undefined;
  SignUp: undefined;
};
