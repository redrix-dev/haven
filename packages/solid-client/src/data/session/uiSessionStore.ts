import { createStore } from "solid-js/store";
import type { UiStoreState } from "@shared/core/sessionStorePorts";

type UiData = Omit<
  UiStoreState,
  | "setShowServerSettingsModal"
  | "setShowChannelSettingsModal"
  | "setChannelSettingsTargetId"
  | "setShowCreateModal"
  | "setShowCreateChannelModal"
  | "setShowJoinServerModal"
  | "setShowAccountModal"
  | "setShowVoiceSettingsModal"
  | "setUserVoiceHardwareTestOpen"
  | "setServerModmailOpen"
  | "setRenameServerDraft"
  | "setRenameChannelDraft"
  | "setRenameGroupDraft"
  | "setCreateGroupDraft"
  | "setPendingUiConfirmation"
  | "setWorkspaceMode"
  | "setShowHiddenMessages"
  | "setFriendsPanelOpen"
  | "setFriendsPanelRequestedTab"
  | "setFriendsPanelHighlightedRequestId"
  | "setNotificationsPanelOpen"
  | "setServerSettingsTab"
  | "reset"
>;

const defaultUiState = (): UiData => ({
  showServerSettingsModal: false,
  showChannelSettingsModal: false,
  channelSettingsTargetId: null,
  showCreateModal: false,
  showCreateChannelModal: false,
  showJoinServerModal: false,
  showAccountModal: false,
  showVoiceSettingsModal: false,
  userVoiceHardwareTestOpen: false,
  serverModmailOpen: false,
  serverSettingsTab: null,
  renameServerDraft: null,
  renameChannelDraft: null,
  renameGroupDraft: null,
  createGroupDraft: null,
  pendingUiConfirmation: null,
  workspaceMode: "community",
  showHiddenMessages: false,
  friendsPanelOpen: false,
  friendsPanelRequestedTab: null,
  friendsPanelHighlightedRequestId: null,
  notificationsPanelOpen: false,
});

/**
 * Solid-native UI session store.
 *
 * The `createStore` proxy IS the reactive source: `getState()` returns the live
 * proxy, so reading a field inside a tracking scope (component / createMemo /
 * createEffect) subscribes to exactly that field, and a setter's `setState`
 * wakes only those readers. No `subscribe`, no `notify()`, no snapshot spread —
 * that adapter machinery was a React/Zustand imitation; Solid does this itself.
 */
export function createSolidUiSessionStore() {
  const [state, setState] = createStore<UiStoreState>({
    ...defaultUiState(),
    setShowServerSettingsModal: (open) => {
      setState("showServerSettingsModal", open);
      if (!open) setState("serverSettingsTab", null);
    },
    setShowChannelSettingsModal: (open) =>
      setState("showChannelSettingsModal", open),
    setChannelSettingsTargetId: (id) => setState("channelSettingsTargetId", id),
    setShowCreateModal: (open) => setState("showCreateModal", open),
    setShowCreateChannelModal: (open) => setState("showCreateChannelModal", open),
    setShowJoinServerModal: (open) => setState("showJoinServerModal", open),
    setShowAccountModal: (open) => setState("showAccountModal", open),
    setShowVoiceSettingsModal: (open) => setState("showVoiceSettingsModal", open),
    setUserVoiceHardwareTestOpen: (open) =>
      setState("userVoiceHardwareTestOpen", open),
    setServerModmailOpen: (open) => setState("serverModmailOpen", open),
    setServerSettingsTab: (tab) => setState("serverSettingsTab", tab),
    setRenameServerDraft: (draft) => setState("renameServerDraft", draft),
    setRenameChannelDraft: (draft) => setState("renameChannelDraft", draft),
    setRenameGroupDraft: (draft) => setState("renameGroupDraft", draft),
    setCreateGroupDraft: (draft) => setState("createGroupDraft", draft),
    setPendingUiConfirmation: (value) =>
      setState("pendingUiConfirmation", value),
    setWorkspaceMode: (mode) => setState("workspaceMode", mode),
    setShowHiddenMessages: (show) => setState("showHiddenMessages", show),
    setFriendsPanelOpen: (open) => setState("friendsPanelOpen", open),
    setFriendsPanelRequestedTab: (tab) =>
      setState("friendsPanelRequestedTab", tab),
    setFriendsPanelHighlightedRequestId: (id) =>
      setState("friendsPanelHighlightedRequestId", id),
    setNotificationsPanelOpen: (open) =>
      setState("notificationsPanelOpen", open),
    reset: () => setState(defaultUiState()),
  });

  return { getState: () => state };
}
