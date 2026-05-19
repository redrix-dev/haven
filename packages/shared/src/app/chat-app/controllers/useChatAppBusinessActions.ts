import { useCallback } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@platform/lib/errors";
import { getAppHost } from "@shared/infrastructure/platform/appHost";
import {
  getCommunityDataBackend,
  getControlPlaneBackend,
} from "@shared/lib/backend";
import type {
  BanEligibleServer,
  MessageAttachment,
} from "@shared/lib/backend/types";
import type { User } from "@supabase/supabase-js";
import { normalizeInviteCode } from "@shared/app/chat-app/inviteCode";

type UseChatAppBusinessActionsInput = {
  user: User | null;
  currentServerId: string | null;
  showServerSettingsModal: boolean;
  controlPlaneBackend: ReturnType<typeof getControlPlaneBackend>;
  refreshServers: () => Promise<void>;
  setCurrentServerId: (id: string) => void;
  refreshMembersModalMembersIfOpen: (communityId: string) => Promise<void>;
  loadCommunityBans: (communityId: string) => Promise<void>;
  saveMemberChannelPermissionsRaw: (
    memberId: string,
    permissions: {
      canView: boolean | null;
      canSend: boolean | null;
      canManage: boolean | null;
    },
  ) => Promise<{
    communityId: string;
    channelId: string;
    revokedUserId: string;
  } | null>;
  applyChannelAccessRevokedContentVisibility: (payload: {
    communityId: string;
    channelId: string;
    revokedUserId: string;
  }) => void;
  applyLocalProfileUpdate: (profile: {
    username: string;
    avatarUrl: string | null;
    theme?: string;
  }) => void;
  profileUsername: string;
  profileAvatarUrl: string | null;
  upsertLiveProfile: (input: {
    userId: string;
    username: string;
    avatarUrl: string | null;
    updatedAt: string;
  }) => void;
};

export function useChatAppBusinessActions({
  user,
  currentServerId,
  showServerSettingsModal,
  controlPlaneBackend,
  refreshServers,
  setCurrentServerId,
  refreshMembersModalMembersIfOpen,
  loadCommunityBans,
  saveMemberChannelPermissionsRaw,
  applyChannelAccessRevokedContentVisibility,
  applyLocalProfileUpdate,
  upsertLiveProfile,
  profileUsername,
  profileAvatarUrl,
}: UseChatAppBusinessActionsInput) {
  const joinServerByInvite = useCallback(
    async (
      inviteInput: string,
    ): Promise<{ communityName: string; joined: boolean }> => {
      const code = normalizeInviteCode(inviteInput);
      if (!code) throw new Error("Invite code is required.");
      const redeemedInvite =
        await controlPlaneBackend.redeemCommunityInvite(code);
      await refreshServers();
      setCurrentServerId(redeemedInvite.communityId);
      return {
        communityName: redeemedInvite.communityName,
        joined: redeemedInvite.joined,
      };
    },
    [controlPlaneBackend, refreshServers, setCurrentServerId],
  );

  const saveAttachment = useCallback(async (attachment: MessageAttachment) => {
    if (!attachment.signedUrl) throw new Error("Media link is not available.");
    const suggestedName =
      attachment.originalFilename ??
      attachment.objectPath.split("/").pop() ??
      "media";
    await getAppHost().saveFileFromUrl({
      url: attachment.signedUrl,
      suggestedName,
    });
  }, []);

  const reportUserProfile = useCallback(
    async (input: {
      targetUserId: string;
      reason: string;
      communityId?: string;
    }) => {
      if (!user) throw new Error("Not authenticated.");
      const targetCommunityId = input.communityId ?? currentServerId;
      if (!targetCommunityId) throw new Error("No server selected.");
      const communityBackend = getCommunityDataBackend(targetCommunityId);
      await communityBackend.reportUserProfile({
        communityId: targetCommunityId,
        targetUserId: input.targetUserId,
        reporterUserId: user.id,
        reason: input.reason,
      });
    },
    [user, currentServerId],
  );

  const banUserFromServer = useCallback(
    async (input: {
      targetUserId: string;
      communityId: string;
      reason: string;
    }) => {
      const communityBackend = getCommunityDataBackend(input.communityId);
      const banResult = await communityBackend.banCommunityMember({
        communityId: input.communityId,
        targetUserId: input.targetUserId,
        reason: input.reason,
      });
      try {
        await communityBackend.broadcastMemberBanned(banResult);
      } catch (error) {
        console.error("Failed to broadcast member ban:", error);
      }
      try {
        await refreshMembersModalMembersIfOpen(input.communityId);
      } catch (error) {
        console.error("Failed to refresh members after ban:", error);
      }
      if (showServerSettingsModal && currentServerId === input.communityId) {
        try {
          await loadCommunityBans(input.communityId);
        } catch (error) {
          console.error("Failed to refresh bans after ban:", error);
        }
      }
    },
    [
      refreshMembersModalMembersIfOpen,
      loadCommunityBans,
      showServerSettingsModal,
      currentServerId,
    ],
  );

  const kickUserFromServer = useCallback(
    async (input: {
      targetUserId: string;
      communityId: string;
      username: string;
    }) => {
      try {
        const communityBackend = getCommunityDataBackend(input.communityId);
        await communityBackend.kickCommunityMember({
          communityId: input.communityId,
          targetUserId: input.targetUserId,
        });
        try {
          await refreshMembersModalMembersIfOpen(input.communityId);
        } catch (error) {
          console.error("Failed to refresh members after kick:", error);
        }
        toast(`${input.username} has been removed from the server.`, {
          id: `server-kick:${input.communityId}:${input.targetUserId}`,
          action: {
            label: "Dismiss",
            onClick: () => {
              toast.dismiss(
                `server-kick:${input.communityId}:${input.targetUserId}`,
              );
            },
          },
        });
      } catch (error: unknown) {
        toast.error(
          getErrorMessage(error, "Failed to remove user from the server."),
          {
            id: `server-kick-error:${input.communityId}:${input.targetUserId}`,
          },
        );
        throw error;
      }
    },
    [refreshMembersModalMembersIfOpen],
  );

  const saveMemberChannelPermissions = useCallback(
    async (
      memberId: string,
      permissions: {
        canView: boolean | null;
        canSend: boolean | null;
        canManage: boolean | null;
      },
    ) => {
      const accessRevokedResult = await saveMemberChannelPermissionsRaw(
        memberId,
        permissions,
      );
      if (!accessRevokedResult) return;
      applyChannelAccessRevokedContentVisibility(accessRevokedResult);
    },
    [
      applyChannelAccessRevokedContentVisibility,
      saveMemberChannelPermissionsRaw,
    ],
  );

  const resolveBanEligibleServers = useCallback(
    async (targetUserId: string): Promise<BanEligibleServer[]> => {
      if (!targetUserId) return [];
      return controlPlaneBackend.listBanEligibleServersForUser(targetUserId);
    },
    [controlPlaneBackend],
  );

  const saveAccountSettings = useCallback(
    async (values: {
      username: string;
      avatarUrl: string | null;
      avatarFile?: File | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const updatedProfile = await controlPlaneBackend.updateUserProfile({
        userId: user.id,
        username: values.username,
        avatarUrl: values.avatarUrl,
        avatarFile: values.avatarFile ?? null,
      });
      applyLocalProfileUpdate({
        username: updatedProfile.username,
        avatarUrl: updatedProfile.avatarUrl,
        theme: updatedProfile.theme,
      });
      upsertLiveProfile({
        userId: user.id,
        username: updatedProfile.username,
        avatarUrl: updatedProfile.avatarUrl,
        updatedAt: new Date().toISOString(),
      });
    },
    [user, controlPlaneBackend, applyLocalProfileUpdate, upsertLiveProfile],
  );

  const saveThemePreference = useCallback(
    async (themeId: string) => {
      if (!user) throw new Error("Not authenticated");
      const trimmedUsername = profileUsername.trim();
      if (!trimmedUsername) {
        throw new Error("Username is required before changing theme.");
      }
      const updatedProfile = await controlPlaneBackend.updateUserProfile({
        userId: user.id,
        username: trimmedUsername,
        avatarUrl: profileAvatarUrl,
        theme: themeId,
      });
      applyLocalProfileUpdate({
        username: updatedProfile.username,
        avatarUrl: updatedProfile.avatarUrl,
        theme: updatedProfile.theme,
      });
      upsertLiveProfile({
        userId: user.id,
        username: updatedProfile.username,
        avatarUrl: updatedProfile.avatarUrl,
        updatedAt: new Date().toISOString(),
      });
    },
    [
      user,
      controlPlaneBackend,
      profileUsername,
      profileAvatarUrl,
      applyLocalProfileUpdate,
      upsertLiveProfile,
    ],
  );

  return {
    joinServerByInvite,
    saveAttachment,
    reportUserProfile,
    banUserFromServer,
    kickUserFromServer,
    saveMemberChannelPermissions,
    resolveBanEligibleServers,
    saveAccountSettings,
    saveThemePreference,
  };
}
