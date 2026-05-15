import type { NavigatorScreenParams } from "@react-navigation/native";

export type Rev2CommunityStackParamList = {
  Rev2CommunityList: undefined;
  Rev2CommunityHost: undefined;
  Rev2ChannelThread: undefined;
};

export type Rev2SettingsStackParamList = {
  Rev2SettingsHome: undefined;
};

export type Rev2NotificationsStackParamList = {
  Rev2NotificationsHome: undefined;
};

export type Rev2DrawerParamList = {
  Rev2Home: undefined;
  Rev2Community: NavigatorScreenParams<Rev2CommunityStackParamList> | undefined;
  Rev2Notifications: NavigatorScreenParams<Rev2NotificationsStackParamList> | undefined;
  Rev2Settings: NavigatorScreenParams<Rev2SettingsStackParamList> | undefined;
  Rev2ThemeSpecimen: undefined;
};
