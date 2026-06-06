import React, { useCallback, useEffect, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Sidebar } from "@web-client/components/Sidebar";
import { ChatArea } from "@web-client/components/messaging/ChatArea";
import { VoiceDrawer } from "@web-client/components/voice/VoiceDrawer";
import { useChatAppSession } from "@web-client/chat-app/ChatAppSession";
import { useChatAppVoiceIntegration } from "@web-client/chat-app/useChatAppVoiceIntegration";
import { getErrorMessage } from "@platform/lib/errors";
import { useHavenCore, toChannel } from "@shared/core";
import { useUiStore } from "@shared/stores/uiStore";
import { useUserStatusStore } from "@shared/stores/userStatusStore";
import type { MessageReportKind, MessageReportTarget } from "@shared/lib/backend/types";

type CommunityWorkspaceShellProps = {
  user: User;
  voice: ReturnType<typeof useChatAppVoiceIntegration>;
};

export function CommunityWorkspaceShell({
  user,
  voice,
}: CommunityWorkspaceShellProps) {
  const app = useChatAppSession();
  const core = useHavenCore();
  const admin = core.admin;
  const currentServerId = core.communities.useActiveId();
  const currentChannelId = core.channels.useActiveChannelId();
  const havenChannels = core.channels.useChannels(currentServerId ?? "__none__");
  const channelsLoading = core.channels.useIsLoading(currentServerId ?? "__none__");
  const channels = useMemo(
    () => havenChannels.map(toChannel),
    [havenChannels],
  );
  const currentServer = useMemo(
    () => app.servers.find((server) => server.id === currentServerId) ?? null,
    [app.servers, currentServerId],
  );
  const setCurrentChannelId = React.useCallback(
    (id: string | null) => {
      core.channels.setActiveChannelId(id);
    },
    [core],
  );
  const serverPermissions = core.permissions.usePermissions(currentServerId ?? "");
  const canOpenServerSettings =
    serverPermissions.canManageServer ||
    serverPermissions.canManageRoles ||
    serverPermissions.canManageMembers ||
    serverPermissions.canManageBans ||
    serverPermissions.canManageInvites;
  const canManageChannelStructure =
    serverPermissions.canManageChannelStructure;
  const canManageChannelPermissions =
    serverPermissions.canManageChannelPermissions;
  const canOpenChannelSettings =
    canManageChannelStructure || canManageChannelPermissions;

  const currentChannel = useMemo(
    () => channels.find((channel) => channel.id === currentChannelId) ?? null,
    [channels, currentChannelId],
  );

  const currentChannelBelongsToCurrentServer = Boolean(
    currentChannel &&
      currentServerId &&
      currentChannel.community_id === currentServerId,
  );

  const currentRenderableChannel = useMemo(
    () =>
      currentChannel &&
      currentChannelBelongsToCurrentServer &&
      currentChannel.kind === "text"
        ? currentChannel
        : (channels.find(
            (channel) =>
              channel.kind === "text" &&
              (!currentServerId || channel.community_id === currentServerId),
          ) ?? (currentChannelBelongsToCurrentServer ? currentChannel : null)),
    [
      channels,
      currentChannel,
      currentChannelBelongsToCurrentServer,
      currentServerId,
    ],
  );

  const activeTextChannelId = currentRenderableChannel?.id ?? null;
  const messageCommunityId = currentServerId ?? "__none__";
  const messageNexus = core.messages.for(messageCommunityId);
  const channelMeta = messageNexus.useChannelMeta(activeTextChannelId ?? "__none__");
  const hasOlderMessages = channelMeta.hasMore;
  const isLoadingOlderMessages = messageNexus.useIsLoadingOlder(
    activeTextChannelId ?? "__none__",
  );
  const { setRainbowMode } = useUserStatusStore();

  useEffect(() => {
    if (!currentServerId || !activeTextChannelId) return;
    void core.prepareTextChannelMessages(currentServerId, activeTextChannelId);
  }, [core, currentServerId, activeTextChannelId]);

  const requestOlderMessages = useCallback(async () => {
    if (!activeTextChannelId || !hasOlderMessages || isLoadingOlderMessages) return;
    try {
      await messageNexus.loadOlder(activeTextChannelId);
    } catch (err) {
      console.error("Error loading older messages:", err);
    }
  }, [activeTextChannelId, hasOlderMessages, isLoadingOlderMessages, messageNexus]);

  const sendMessage = useCallback(
    async (
      content: string,
      options?: {
        replyToMessageId?: string;
        mediaFile?: Blob | File;
        mediaArrayBuffer?: ArrayBuffer;
        mediaContentType?: string;
        mediaFilename?: string;
        mediaExpiresInHours?: number;
      },
    ) => {
      if (content === "#RainbowRoad") {
        setRainbowMode(!useUserStatusStore.getState().rainbowMode);
        return;
      }
      if (!user.id || !activeTextChannelId || !currentServerId) return;
      await messageNexus.sendWithMedia(activeTextChannelId, content, {
        replyToMessageId: options?.replyToMessageId ?? null,
        mediaFile: options?.mediaFile,
        mediaArrayBuffer: options?.mediaArrayBuffer,
        mediaContentType: options?.mediaContentType,
        mediaFilename: options?.mediaFilename,
        mediaExpiresInHours: options?.mediaExpiresInHours,
        senderUserId: user.id,
        senderIsPlatformStaff: app.isPlatformStaff,
      });
    },
    [
      activeTextChannelId,
      app.isPlatformStaff,
      currentServerId,
      messageNexus,
      setRainbowMode,
      user.id,
    ],
  );

  const toggleMessageReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!activeTextChannelId) throw new Error("No channel selected.");
      await messageNexus.toggleReaction(activeTextChannelId, messageId, emoji);
    },
    [activeTextChannelId, messageNexus],
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) throw new Error("Message content is required.");
      await messageNexus.edit(messageId, trimmed);
    },
    [messageNexus],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      await messageNexus.deleteMessageRpc(messageId);
    },
    [messageNexus],
  );

  const reportMessage = useCallback(
    async (input: {
      messageId: string;
      target: MessageReportTarget;
      kind: MessageReportKind;
      comment: string;
    }) => {
      if (!activeTextChannelId) throw new Error("No channel selected.");
      await messageNexus.report({
        channelId: activeTextChannelId,
        messageId: input.messageId,
        reporterUserId: user.id,
        target: input.target,
        kind: input.kind,
        comment: input.comment,
      });
    },
    [activeTextChannelId, messageNexus, user.id],
  );

  const requestMessageLinkPreviewRefresh = useCallback(
    async (messageId: string) => {
      if (!activeTextChannelId) throw new Error("No channel selected.");
      await messageNexus.requestLinkPreviewBackfill(activeTextChannelId, [messageId]);
    },
    [activeTextChannelId, messageNexus],
  );

  if (!currentServer) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">
          {app.serversError ?? "No servers yet. Create one to get started!"}
        </p>
      </div>
    );
  }

  return (
    <>
      <Sidebar
        serverName={currentServer.name}
        userName={app.userDisplayName}
        channels={channels.map((channel) => ({
          id: channel.id,
          name: channel.name,
          kind: channel.kind,
        }))}
        userStatus={app.userStatus}
        rainbowMode={app.rainbowMode}
        onStatusChange={app.setUserStatus}
        channelGroups={app.sidebarChannelGroups}
        ungroupedChannelIds={app.channelGroupState.ungroupedChannelIds}
        onChannelClick={setCurrentChannelId}
        onVoiceChannelClick={app.requestVoiceChannelJoin}
        activeVoiceChannelId={app.activeVoiceChannelId}
        voiceChannelParticipants={voice.visibleVoiceChannelParticipants}
        voiceStatusPanel={
          app.activeVoiceChannel && !voice.voicePopoutWindowOpen ? (
            <VoiceDrawer
              surface="sidebar"
              serverName={
                voice.activeVoiceServer?.name ??
                currentServer?.name ??
                "Unknown server"
              }
              channelName={app.activeVoiceChannel.name}
              participantCount={
                voice.visibleActiveVoiceParticipants.length +
                (voice.voiceController.state.joined ? 1 : 0)
              }
              participantPreview={voice.visibleActiveVoiceParticipantPreview}
              memberControls={voice.visibleActiveVoiceParticipants.map(
                (participant) => ({
                  userId: participant.userId,
                  displayName: participant.displayName,
                  avatarUrl: participant.avatarUrl ?? null,
                  isSpeaking: participant.isSpeaking,
                  isMuted: participant.muted,
                  isDeafened: participant.deafened,
                  volume:
                    voice.voiceController.state.remoteVolumes[
                      participant.userId
                    ] ?? 100,
                }),
              )}
              voiceConnected={voice.voiceController.state.joined}
              voicePanelOpen={app.voicePanelOpen}
              joining={voice.voiceController.state.joining}
              voiceSessionState={{
                joined: voice.voiceController.state.joined,
                isMuted: voice.voiceController.state.isMuted,
                isDeafened: voice.voiceController.state.isDeafened,
              }}
              transmissionMode={app.appSettings.voice.transmissionMode}
              inputDevices={voice.voiceController.state.inputDevices}
              outputDevices={voice.voiceController.state.outputDevices}
              selectedInputDeviceId={
                voice.voiceController.state.selectedInputDeviceId
              }
              selectedOutputDeviceId={
                voice.voiceController.state.selectedOutputDeviceId
              }
              supportsOutputSelection={
                voice.voiceController.state.supportsOutputSelection
              }
              onOpenChange={app.setVoicePanelOpen}
              onJoin={() => {
                void voice.voiceController.actions.joinVoiceChannel();
              }}
              onToggleMute={voice.voiceController.actions.toggleMute}
              onToggleDeafen={voice.voiceController.actions.toggleDeafen}
              onDisconnect={() => {
                void app.disconnectVoiceSession();
              }}
              onSelectTransmissionMode={(mode) => {
                voice.voiceController.actions.updateVoiceSettingsPatch({
                  transmissionMode: mode,
                });
              }}
              onSelectInputDevice={(deviceId) => {
                void voice.voiceController.actions.switchInputDevice(deviceId);
              }}
              onSelectOutputDevice={voice.voiceController.actions.setOutputDevice}
              onSetMemberVolume={voice.voiceController.actions.setMemberVolume}
              onResetMemberVolume={
                voice.voiceController.actions.resetMemberVolume
              }
              onResetAllMemberVolumes={
                voice.voiceController.actions.resetAllMemberVolumes
              }
              onOpenAdvancedOptions={() =>
                useUiStore.getState().setShowVoiceSettingsModal(true)
              }
              onOpenVoiceHardwareTest={() =>
                useUiStore.getState().setUserVoiceHardwareTestOpen(true)
              }
              canOpenVoicePopout={voice.canOpenVoicePopout}
              onOpenVoicePopout={voice.handleOpenVoicePopout}
            />
          ) : null
        }
        footerStatusActions={null}
        onCreateChannel={
          serverPermissions.canCreateChannels
            ? () => useUiStore.getState().setShowCreateChannelModal(true)
            : undefined
        }
        canManageChannels={canOpenChannelSettings}
        canManageChannelStructure={canManageChannelStructure}
        onRenameChannel={
          canManageChannelStructure ? app.handleRenameChannel : undefined
        }
        onDeleteChannel={
          canManageChannelStructure ? app.handleDeleteChannel : undefined
        }
        onOpenChannelSettings={
          canOpenChannelSettings
            ? (channelId) => {
                void admin.openChannelSettingsModal(channelId);
              }
            : undefined
        }
        onAddChannelToGroup={
          canManageChannelStructure
            ? (channelId, groupId) => {
                void app
                  .assignChannelToGroup(channelId, groupId)
                  .catch((error: unknown) => {
                    toast.error(
                      getErrorMessage(
                        error,
                        "Failed to assign channel to group.",
                      ),
                      {
                        id: "assign-channel-group-error",
                      },
                    );
                  });
              }
            : undefined
        }
        onRemoveChannelFromGroup={
          canManageChannelStructure
            ? (channelId) => {
                void app
                  .removeChannelFromGroup(channelId)
                  .catch((error: unknown) => {
                    toast.error(
                      getErrorMessage(
                        error,
                        "Failed to remove channel from group.",
                      ),
                      { id: "remove-channel-group-error" },
                    );
                  });
              }
            : undefined
        }
        onCreateChannelGroup={
          canManageChannelStructure ? app.handleCreateChannelGroup : undefined
        }
        onToggleChannelGroup={(groupId, isCollapsed) => {
          void app
            .setChannelGroupCollapsed(groupId, isCollapsed)
            .catch((error: unknown) => {
              console.error(
                "Failed to persist channel group collapse state:",
                error,
              );
            });
        }}
        onRenameChannelGroup={
          canManageChannelStructure ? app.handleRenameChannelGroup : undefined
        }
        onDeleteChannelGroup={
          canManageChannelStructure ? app.handleDeleteChannelGroup : undefined
        }
        onOpenServerSettings={
          canOpenServerSettings
            ? () => void admin.openServerSettingsModal()
            : undefined
        }
      />

      {channelsLoading && !currentRenderableChannel ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading channels...</p>
        </div>
      ) : currentRenderableChannel ? (
        <ChatArea
          communityId={currentServer.id}
          channelId={currentRenderableChannel.id}
          channelName={currentRenderableChannel.name}
          channelKind={currentRenderableChannel.kind}
          currentUserId={user.id}
          canManageMessages={serverPermissions.canManageMessages}
          canCreateReports={serverPermissions.canCreateReports}
          canManageBans={serverPermissions.canManageBans}
          canManageMembers={serverPermissions.canManageMembers}
          canViewBanHidden={serverPermissions.canViewBanHidden}
          canRefreshLinkPreviews={serverPermissions.canRefreshLinkPreviews}
          showVoiceDiagnostics={app.isPlatformStaff}
          onOpenChannelSettings={
            canOpenChannelSettings
              ? () =>
                  void admin.openChannelSettingsModal(currentRenderableChannel.id)
              : undefined
          }
          onOpenVoiceControls={() =>
            useUiStore.getState().setShowVoiceSettingsModal(true)
          }
          onSendMessage={sendMessage}
          onEditMessage={editMessage}
          onDeleteMessage={deleteMessage}
          onToggleMessageReaction={toggleMessageReaction}
          onReportMessage={reportMessage}
          onRequestMessageLinkPreviewRefresh={requestMessageLinkPreviewRefresh}
          onRequestOlderMessages={requestOlderMessages}
          hasOlderMessages={hasOlderMessages}
          isLoadingOlderMessages={isLoadingOlderMessages}
          onSaveAttachment={app.saveAttachment}
          onReportUserProfile={({ targetUserId, reason }) =>
            app.reportUserProfile({
              targetUserId,
              reason,
              communityId: currentServer.id,
            })
          }
          onBanUserFromServer={app.banUserFromServer}
          onKickUserFromCurrentServer={async ({ targetUserId, username }) => {
            await app.kickUserFromServer({
              targetUserId,
              username,
              communityId: currentServer.id,
            });
          }}
          onResolveBanEligibleServers={app.resolveBanEligibleServers}
          onDirectMessageUser={app.directMessageUser}
          enableRichComposer={app.richComposerEnabled}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">
            {app.channelsError ??
              "No channels yet. Create one to get started!"}
          </p>
        </div>
      )}
    </>
  );
}
