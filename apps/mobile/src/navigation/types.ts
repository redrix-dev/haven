export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Main: undefined;
  Community: undefined;
  SettingsPlaceholder: undefined;
  CreatePlaceholder: undefined;
  JoinPlaceholder: undefined;
  PasswordRecovery: { flow?: "requestReset" | "setNewPassword" } | undefined;
  SignUp: undefined;
};
