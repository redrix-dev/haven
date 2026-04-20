export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Community: { communityId: string };
  SettingsPlaceholder: undefined;
  CreatePlaceholder: undefined;
  JoinPlaceholder: undefined;
  PasswordRecovery: { flow?: "requestReset" | "setNewPassword" } | undefined;
  SignUp: undefined;
};
