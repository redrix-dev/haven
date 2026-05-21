import { useCallback, useEffect, type MutableRefObject } from "react";
import { toast } from "sonner";
import { registerCommunityAccessHandlers } from "@shared/core/communityAccessHandlers";
import { requireHavenCore } from "@shared/core";
import { hydrateCommunityPermissions } from "@shared/features/community/communityPermissionsHydration";
import type {
  Channel,
  MemberBannedBroadcastPayload,
  MemberChannelAccessRevokedBroadcastPayload,
  ServerSummary,
} from "@shared/lib/backend/types";
import type { ForceDisconnectVoiceReason } from "@shared/features/voice/types";
import { useUiStore } from "@shared/stores/uiStore";

type VoiceChannelLike = { id: string; community_id: string } | null;

type UseChatAppAccessAndBroadcastOrchestrationInput = {
  servers: ServerSummary[];
  currentServer: ServerSummary | null;
  currentServerId: string | null;
  channels: Channel[];
  userId: string | undefined;
  setWorkspaceMode: (mode: "community" | "dm") => void;
  setCurrentChannelId: (id: string | null) => void;
  resetMessageState: () => void;
  resetChannelGroups: () => void;
  resetChannelsWorkspace: () => void;
  purgeMessageBundleCacheForServer: (serverId: string) => void;
  purgeMessageBundleCacheForChannel: (
    communityId: string,
    channelId: string,
  ) => void;
  applyChannelAccessRevokedContentVisibility: (
    payload: MemberChannelAccessRevokedBroadcastPayload & {
      communityId: string;
      channelId: string;
      revokedUserId: string;
    },
  ) => void;
  activeVoiceChannel: VoiceChannelLike;
  forceDisconnectVoice: (reason: ForceDisconnectVoiceReason) => Promise<void>;
  serverNameByIdRef: MutableRefObject<Record<string, string>>;
};

export function useChatAppAccessAndBroadcastOrchestration({
  servers,
  currentServer,
  currentServerId,
  channels,
  userId,
  setWorkspaceMode,
  setCurrentChannelId,
  resetMessageState,
  resetChannelGroups,
  resetChannelsWorkspace,
  purgeMessageBundleCacheForServer,
  purgeMessageBundleCacheForChannel,
  applyChannelAccessRevokedContentVisibility,
  activeVoiceChannel,
  forceDisconnectVoice,
  serverNameByIdRef,
}: UseChatAppAccessAndBroadcastOrchestrationInput) {
  const handleServerAccessLossReset = useCallback(
    (serverId: string) => {
      if (!serverId) return;
      const core = requireHavenCore();
      core.communities.setActiveId(null);
      core.channels.setActiveChannelId(null);
      useUiStore.getState().setWorkspaceMode("community");
      resetMessageState();
      resetChannelGroups();
      resetChannelsWorkspace();
      core.permissions.invalidate(serverId);
      purgeMessageBundleCacheForServer(serverId);
      setWorkspaceMode("community");
    },
    [
      purgeMessageBundleCacheForServer,
      resetChannelGroups,
      resetChannelsWorkspace,
      resetMessageState,
      setWorkspaceMode,
    ],
  );

  const disconnectVoiceForAccessLoss = useCallback(
    async (input: { serverId?: string; channelId?: string }) => {
      const activeChannel = activeVoiceChannel;
      if (!activeChannel) return;

      const losesServerAccess =
        Boolean(input.serverId) &&
        activeChannel.community_id === input.serverId;
      const losesChannelAccess =
        Boolean(input.channelId) && activeChannel.id === input.channelId;
      if (!losesServerAccess && !losesChannelAccess) return false;
      await forceDisconnectVoice("access_lost");
      return true;
    },
    [activeVoiceChannel, forceDisconnectVoice],
  );

  const showVoiceDisconnectToast = useCallback(
    (input: {
      reason: ForceDisconnectVoiceReason;
      accessScope?: "server" | "channel";
    }) => {
      let message = "You have been disconnected from voice.";
      switch (input.reason) {
        case "access_lost":
          message =
            input.accessScope === "channel"
              ? "You have been disconnected from voice. You no longer have access to this channel."
              : "You have been disconnected from voice. You no longer have access to this server.";
          break;
        case "kicked":
          message = "You have been removed from this voice channel.";
          break;
        case "ban":
          message = "You have been disconnected from voice.";
          break;
        default:
          break;
      }

      const toastId = `voice-disconnect:${input.reason}:${input.accessScope ?? "generic"}`;
      toast(message, {
        id: toastId,
        action: {
          label: "Dismiss",
          onClick: () => {
            toast.dismiss(toastId);
          },
        },
      });
    },
    [],
  );

  useEffect(() => {
    const nextServerNameById = { ...serverNameByIdRef.current };
    for (const server of servers) {
      nextServerNameById[server.id] = server.name;
    }
    if (currentServer) {
      nextServerNameById[currentServer.id] = currentServer.name;
    }
    serverNameByIdRef.current = nextServerNameById;
  }, [currentServer, serverNameByIdRef, servers]);

  const handleServerAccessLostCascade = useCallback(
    async (serverId: string) => {
      if (!serverId) return;

      const lostServerName =
        (currentServerId === serverId ? currentServer?.name : null) ??
        serverNameByIdRef.current[serverId] ??
        "Unknown server";

      const disconnectedFromVoice = await disconnectVoiceForAccessLoss({
        serverId,
      });
      if (disconnectedFromVoice) {
        showVoiceDisconnectToast({
          reason: "access_lost",
          accessScope: "server",
        });
      }
      handleServerAccessLossReset(serverId);

      const toastId = `server-access-lost:${serverId}`;
      toast(`You have been removed from ${lostServerName}.`, {
        id: toastId,
        action: {
          label: "Dismiss",
          onClick: () => {
            toast.dismiss(toastId);
          },
        },
      });
    },
    [
      currentServer,
      currentServerId,
      disconnectVoiceForAccessLoss,
      handleServerAccessLossReset,
      showVoiceDisconnectToast,
      serverNameByIdRef,
    ],
  );

  const handleChannelAccessLostCascade = useCallback(
    async (channelId: string, channelName: string) => {
      if (!channelId || !currentServerId) return;

      const nextChannelId =
        channels.find(
          (channel) =>
            channel.community_id === currentServerId &&
            channel.kind === "text" &&
            channel.id !== channelId,
        )?.id ?? null;

      const disconnectedFromVoice = await disconnectVoiceForAccessLoss({
        channelId,
      });
      if (disconnectedFromVoice) {
        showVoiceDisconnectToast({
          reason: "access_lost",
          accessScope: "channel",
        });
      }
      if (userId) {
        applyChannelAccessRevokedContentVisibility({
          communityId: currentServerId,
          channelId,
          revokedUserId: userId,
        });
        try {
          await requireHavenCore().broadcastChannelAccessRevoked({
            communityId: currentServerId,
            channelId,
            revokedUserId: userId,
          });
        } catch (error) {
          console.error(
            "Failed to broadcast channel access revocation:",
            error,
          );
        }
      }
      purgeMessageBundleCacheForChannel(currentServerId, channelId);
      resetMessageState();
      setCurrentChannelId(nextChannelId);

      const toastId = `channel-access-lost:${currentServerId}:${channelId}`;
      toast(`Your access to #${channelName} has been revoked.`, {
        id: toastId,
        action: {
          label: "Dismiss",
          onClick: () => {
            toast.dismiss(toastId);
          },
        },
      });
    },
    [
      channels,
      currentServerId,
      disconnectVoiceForAccessLoss,
      applyChannelAccessRevokedContentVisibility,
      purgeMessageBundleCacheForChannel,
      resetMessageState,
      setCurrentChannelId,
      showVoiceDisconnectToast,
      userId,
    ],
  );

  const handleMemberBannedBroadcast = useCallback(
    (payload: MemberBannedBroadcastPayload) => {
      if (!payload.communityId || !payload.bannedUserId) return;
      void hydrateCommunityPermissions(payload.communityId);
      if (payload.bannedUserId === userId) return;
    },
    [userId],
  );

  const handleMemberChannelAccessRevokedBroadcast = useCallback(
    (payload: MemberChannelAccessRevokedBroadcastPayload) => {
      if (!payload.communityId || !payload.channelId || !payload.revokedUserId)
        return;
      void hydrateCommunityPermissions(payload.communityId);
      if (payload.revokedUserId === userId) return;
      applyChannelAccessRevokedContentVisibility(payload);
    },
    [applyChannelAccessRevokedContentVisibility, userId],
  );

  useEffect(() => {
    registerCommunityAccessHandlers({
      onActiveServerAccessLost: handleServerAccessLostCascade,
      onActiveChannelAccessLost: handleChannelAccessLostCascade,
      onMemberBanned: handleMemberBannedBroadcast,
      onMemberChannelAccessRevoked: handleMemberChannelAccessRevokedBroadcast,
    });
  }, [
    handleChannelAccessLostCascade,
    handleMemberBannedBroadcast,
    handleMemberChannelAccessRevokedBroadcast,
    handleServerAccessLostCascade,
  ]);

  return {
    showVoiceDisconnectToast,
    handleServerAccessLostCascade,
    handleChannelAccessLostCascade,
    handleMemberBannedBroadcast,
    handleMemberChannelAccessRevokedBroadcast,
  };
}
