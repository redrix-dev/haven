import { useCallback } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@platform/lib/errors";
import { getAppHost } from "@shared/infrastructure/platform/appHost";
import { requireHavenCore } from "@shared/core";
import { useUiStore } from "@shared/stores/uiStore";
import type {
  BanEligibleServer,
  MessageAttachment,
} from "@shared/lib/backend/types";
import type { User } from "@supabase/supabase-js";
import { normalizeInviteCode } from "@shared/features/community/utils/inviteCode";

type UseChatAppBusinessActionsInput = {
  user: User | null;
  currentServerId: string | null;
  applyChannelAccessRevokedContentVisibility: (payload: {
    communityId: string;
    channelId: string;
    revokedUserId: string;
  }) => void;
  profileUsername: string;
  profileAvatarUrl: string | null;
};

export function useChatAppBusinessActions({
  user,
  currentServerId,
  applyChannelAccessRevokedContentVisibility,
  profileUsername,
  profileAvatarUrl,
}: UseChatAppBusinessActionsInput) {
  const admin = requireHavenCore().admin;
  const showServerSettingsModal = useUiStore(
    (state) => state.showServerSettingsModal,
  );

  const joinServerByInvite = useCallback(
    async (
      inviteInput: string,
    ): Promise<{ communityName: string; joined: boolean }> => {
      const code = normalizeInviteCode(inviteInput);
      if (!code) throw new Error("Invite code is required.");
      return requireHavenCore().joinCommunityByInvite(code);
    },
    [],
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
      await requireHavenCore().admin.reportMember({
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
      await admin.banMember({
        communityId: input.communityId,
        targetUserId: input.targetUserId,
        reason: input.reason,
      });
      if (showServerSettingsModal && currentServerId === input.communityId) {
        try {
          await admin.loadCommunityBans(input.communityId);
        } catch (error) {
          console.error("Failed to refresh bans after ban:", error);
        }
      }
    },
    [admin, showServerSettingsModal, currentServerId],
  );

  const kickUserFromServer = useCallback(
    async (input: {
      targetUserId: string;
      communityId: string;
      username: string;
    }) => {
      try {
        await admin.kickMember({
          communityId: input.communityId,
          targetUserId: input.targetUserId,
        });
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
    [admin],
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
      const accessRevokedResult = await admin.saveMemberChannelPermissions(
        memberId,
        permissions,
      );
      if (!accessRevokedResult) return;
      applyChannelAccessRevokedContentVisibility(accessRevokedResult);
    },
    [admin, applyChannelAccessRevokedContentVisibility],
  );

  const resolveBanEligibleServers = useCallback(
    async (targetUserId: string): Promise<BanEligibleServer[]> => {
      if (!targetUserId) return [];
      return requireHavenCore().getBanEligibleServers(targetUserId);
    },
    [],
  );

  const saveAccountSettings = useCallback(
    async (values: {
      username: string;
      avatarUrl: string | null;
      avatarFile?: File | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      await requireHavenCore().updateUserProfile({
        userId: user.id,
        username: values.username,
        avatarUrl: values.avatarUrl,
        avatarFile: values.avatarFile ?? null,
      });
    },
    [user],
  );

  const saveThemePreference = useCallback(
    async (themeId: string) => {
      if (!user) throw new Error("Not authenticated");
      const trimmedUsername = profileUsername.trim();
      if (!trimmedUsername) {
        throw new Error("Username is required before changing theme.");
      }
      await requireHavenCore().updateUserProfile({
        userId: user.id,
        username: trimmedUsername,
        avatarUrl: profileAvatarUrl,
        theme: themeId,
      });
    },
    [user, profileUsername, profileAvatarUrl],
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
