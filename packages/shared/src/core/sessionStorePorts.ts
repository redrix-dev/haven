import type { PendingUiConfirmation } from "@shared/types/types";
import type { Session, User } from "@supabase/supabase-js";

export type AuthStoreState = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setIsLoading: (isLoading: boolean) => void;
};

export type RenameServerDraft = {
  serverId: string;
  currentName: string;
};

export type RenameChannelDraft = {
  channelId: string;
  currentName: string;
};

export type RenameGroupDraft = {
  groupId: string;
  currentName: string;
};

export type CreateGroupDraft = {
  channelId: string | null;
};

export type WorkspaceMode = "community" | "dm";

export type UiStoreState = {
  showServerSettingsModal: boolean;
  showChannelSettingsModal: boolean;
  channelSettingsTargetId: string | null;
  showCreateModal: boolean;
  showCreateChannelModal: boolean;
  showJoinServerModal: boolean;
  showAccountModal: boolean;
  showVoiceSettingsModal: boolean;
  userVoiceHardwareTestOpen: boolean;
  serverModmailOpen: boolean;
  renameServerDraft: RenameServerDraft | null;
  renameChannelDraft: RenameChannelDraft | null;
  renameGroupDraft: RenameGroupDraft | null;
  createGroupDraft: CreateGroupDraft | null;
  pendingUiConfirmation: PendingUiConfirmation | null;
  workspaceMode: WorkspaceMode;
  showHiddenMessages: boolean;
  friendsPanelOpen: boolean;
  friendsPanelRequestedTab:
    | import("@shared/types/types").FriendsPanelTab
    | null;
  friendsPanelHighlightedRequestId: string | null;
  notificationsPanelOpen: boolean;
  setShowServerSettingsModal: (open: boolean) => void;
  setShowChannelSettingsModal: (open: boolean) => void;
  setChannelSettingsTargetId: (id: string | null) => void;
  setShowCreateModal: (open: boolean) => void;
  setShowCreateChannelModal: (open: boolean) => void;
  setShowJoinServerModal: (open: boolean) => void;
  setShowAccountModal: (open: boolean) => void;
  setShowVoiceSettingsModal: (open: boolean) => void;
  setUserVoiceHardwareTestOpen: (open: boolean) => void;
  setServerModmailOpen: (open: boolean) => void;
  setRenameServerDraft: (draft: RenameServerDraft | null) => void;
  setRenameChannelDraft: (draft: RenameChannelDraft | null) => void;
  setRenameGroupDraft: (draft: RenameGroupDraft | null) => void;
  setCreateGroupDraft: (draft: CreateGroupDraft | null) => void;
  setPendingUiConfirmation: (value: PendingUiConfirmation | null) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setShowHiddenMessages: (show: boolean) => void;
  setFriendsPanelOpen: (open: boolean) => void;
  setFriendsPanelRequestedTab: (
    tab: import("@shared/types/types").FriendsPanelTab | null,
  ) => void;
  setFriendsPanelHighlightedRequestId: (id: string | null) => void;
  setNotificationsPanelOpen: (open: boolean) => void;
  reset: () => void;
};

export type UserStatus = "online" | "away" | "dnd";

export type UserStatusStoreState = {
  status: UserStatus;
  setStatus: (status: UserStatus) => void;
  rainbowMode: boolean;
  setRainbowMode: (rainbowMode: boolean) => void;
};

export type SessionStorePort<S> = {
  getState: () => S;
  subscribe: (listener: (state: S, prevState: S) => void) => () => void;
};

export type AuthStorePort = SessionStorePort<AuthStoreState>;
export type UiStorePort = SessionStorePort<UiStoreState>;
export type UserStatusStorePort = SessionStorePort<UserStatusStoreState>;
