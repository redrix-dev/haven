import React from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Sidebar } from "@shared/app/components/Sidebar";
import { ChatArea } from "@shared/features/messaging/components/ChatArea";
import { VoiceDrawer } from "@shared/features/voice/components/VoiceDrawer";
import type { ChatAppOrchestrationApi } from "@shared/app/hooks/useChatAppOrchestration";
import { useChatAppVoiceIntegration } from "@shared/app/chat-app/useChatAppVoiceIntegration";
import { getErrorMessage } from "@platform/lib/errors";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { usePermissionsStore } from "@shared/stores/permissionsStore";
import { useUiStore } from "@shared/stores/uiStore";

type CommunityWorkspaceShellProps = {
  app: ChatAppOrchestrationApi;
  user: User;
  voice: ReturnType<typeof useChatAppVoiceIntegration>;
};

export function CommunityWorkspaceShell({
  app,
  user,
  voice,
}: CommunityWorkspaceShellProps) {
  const currentServer = useNavigationStore((state) => state.currentServer);
  const currentServerId = useNavigationStore((state) => state.currentServerId);
  const setCurrentChannelId = useNavigationStore(
    (state) => state.setCurrentChannelId,
  );
  const serverPermissions = usePermissionsStore((state) =>
    state.getPermissions(currentServerId ?? ""),
  );
  const canManageChannelStructure =
    serverPermissions.canManageChannelStructure;
  const canManageChannelPermissions =
    serverPermissions.canManageChannelPermissions;
  const canOpenChannelSettings =
    canManageChannelStructure || canManageChannelPermissions;

  if (!currentServer) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[#a9b8cf]">
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
        channels={app.channels.map((channel) => ({
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
                void app.openChannelSettingsModal(channelId);
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
          app.canOpenServerSettings
            ? () => void app.openServerSettingsModal()
            : undefined
        }
      />

      {app.channelsLoading && !app.currentRenderableChannel ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[#a9b8cf]">Loading channels...</p>
        </div>
      ) : app.currentRenderableChannel ? (
        <ChatArea
          channelId={app.currentRenderableChannel.id}
          channelName={app.currentRenderableChannel.name}
          channelKind={app.currentRenderableChannel.kind}
          currentUserId={user.id}
          isElevatedViewer={app.isCurrentUserElevatedInCurrentServer}
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
                  void app.openChannelSettingsModal(
                    app.currentRenderableChannel!.id,
                  )
              : undefined
          }
          onOpenVoiceControls={() =>
            useUiStore.getState().setShowVoiceSettingsModal(true)
          }
          onSendMessage={app.sendMessage}
          onEditMessage={app.editMessage}
          onDeleteMessage={app.deleteMessage}
          onToggleMessageReaction={app.toggleMessageReaction}
          onReportMessage={app.reportMessage}
          onRequestMessageLinkPreviewRefresh={
            app.requestMessageLinkPreviewRefresh
          }
          onRequestOlderMessages={app.requestOlderMessages}
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
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[#a9b8cf]">
            {app.channelsError ??
              "No channels yet. Create one to get started!"}
          </p>
        </div>
      )}
    </>
  );
}
