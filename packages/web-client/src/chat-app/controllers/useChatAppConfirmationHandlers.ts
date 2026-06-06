import { useCallback } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { requireHavenCore } from "@shared/core";
import type { Channel } from "@shared/lib/backend/types";
import type { ServerSummary } from "@shared/lib/backend/types";
import { useUiStore } from "@shared/stores/uiStore";

type ChannelGroupStateGroups = ReadonlyArray<{ id: string; name: string }>;

type UseChatAppConfirmationHandlersInput = {
  servers: ServerSummary[];
  channels: Channel[];
  channelGroupStateGroups: ChannelGroupStateGroups;
};

export function useChatAppConfirmationHandlers({
  servers,
  channels,
  channelGroupStateGroups,
}: UseChatAppConfirmationHandlersInput) {
  const admin = requireHavenCore().admin;
  const handleLeaveServer = useCallback(
    (communityId: string) => {
      const server = servers.find((s) => s.id === communityId);
      useUiStore.getState().setPendingUiConfirmation({
        kind: "leave-server",
        communityId,
        serverName: server?.name ?? "this server",
      });
    },
    [servers],
  );

  const handleDeleteServer = useCallback(
    (communityId: string) => {
      const server = servers.find((s) => s.id === communityId);
      useUiStore.getState().setPendingUiConfirmation({
        kind: "delete-server",
        communityId,
        serverName: server?.name ?? "this server",
      });
    },
    [servers],
  );

  const handleRenameServer = useCallback(
    (communityId: string) => {
      const server = servers.find((s) => s.id === communityId);
      if (!server) return;
      useUiStore.getState().setRenameServerDraft({
        serverId: communityId,
        currentName: server.name,
      });
    },
    [servers],
  );

  const handleRenameChannel = useCallback(
    (channelId: string) => {
      const channel = channels.find((c) => c.id === channelId);
      if (!channel) return;
      useUiStore.getState().setRenameChannelDraft({
        channelId,
        currentName: channel.name,
      });
    },
    [channels],
  );

  const handleDeleteChannel = useCallback(
    (channelId: string) => {
      const channel = channels.find((c) => c.id === channelId);
      if (!channel) return;
      useUiStore.getState().setPendingUiConfirmation({
        kind: "delete-channel",
        channelId,
        channelName: channel.name,
      });
    },
    [channels],
  );

  const handleCreateChannelGroup = useCallback((channelId?: string) => {
    useUiStore.getState().setCreateGroupDraft({
      channelId: channelId ?? null,
    });
  }, []);

  const handleRenameChannelGroup = useCallback(
    (groupId: string) => {
      const group = channelGroupStateGroups.find((g) => g.id === groupId);
      if (!group) return;
      useUiStore.getState().setRenameGroupDraft({
        groupId,
        currentName: group.name,
      });
    },
    [channelGroupStateGroups],
  );

  const handleDeleteChannelGroup = useCallback(
    (groupId: string) => {
      const group = channelGroupStateGroups.find((g) => g.id === groupId);
      if (!group) return;
      useUiStore.getState().setPendingUiConfirmation({
        kind: "delete-channel-group",
        groupId,
        groupName: group.name,
      });
    },
    [channelGroupStateGroups],
  );

  const confirmPendingUiAction = useCallback(() => {
    const ui = useUiStore.getState();
    const action = ui.pendingUiConfirmation;
    if (!action) return;
    ui.setPendingUiConfirmation(null);
    const core = requireHavenCore();
    switch (action.kind) {
      case "leave-server":
        void admin.leaveServer(action.communityId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, "Failed to leave server."), {
            id: "leave-server-error",
          });
        });
        return;
      case "delete-server":
        void admin.deleteServer(action.communityId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, "Failed to delete server."), {
            id: "delete-server-error",
          });
        });
        return;
      case "delete-channel":
        void admin.deleteChannel(action.channelId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, "Failed to delete channel."), {
            id: "delete-channel-error",
          });
        });
        return;
      case "delete-channel-group": {
        const communityId = core.communities.getActiveId();
        if (!communityId) return;
        void core.channels
          .deleteChannelGroup(communityId, action.groupId)
          .catch((error: unknown) => {
            toast.error(
              getErrorMessage(error, "Failed to delete channel group."),
              {
                id: "delete-channel-group-error",
              },
            );
          });
        return;
      }
      default:
        return;
    }
  }, [admin]);

  return {
    handleLeaveServer,
    handleDeleteServer,
    handleRenameServer,
    handleRenameChannel,
    handleDeleteChannel,
    handleCreateChannelGroup,
    handleRenameChannelGroup,
    handleDeleteChannelGroup,
    confirmPendingUiAction,
  };
}
