import type { NavigatorScreenParams } from "@react-navigation/native";
import type { FriendsPanelTab } from "@shared/app/types/types";

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

export type Rev2FriendsStackParamList = {
  Rev2FriendsHome:
    | {
        initialTab?: FriendsPanelTab;
        highlightedRequestId?: string | null;
      }
    | undefined;
};

export type Rev2DrawerParamList = {
  /** Community stack (list → host → thread); drawer label “Home”. */
  Rev2Home: NavigatorScreenParams<Rev2CommunityStackParamList> | undefined;
  Rev2Friends: NavigatorScreenParams<Rev2FriendsStackParamList> | undefined;
  Rev2Notifications: NavigatorScreenParams<Rev2NotificationsStackParamList> | undefined;
  Rev2Settings: NavigatorScreenParams<Rev2SettingsStackParamList> | undefined;
};
