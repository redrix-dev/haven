import React from "react";
import type { User } from "@supabase/supabase-js";
import { AuthChatModals } from "@web-client/components/auth/AuthChatModals";
import { NotificationModalsHost } from "@web-client/components/notifications/NotificationModalsHost";
import { SocialChatModals } from "@web-client/components/social/SocialChatModals";
import { ModerationChatModals } from "@web-client/components/moderation/ModerationChatModals";
import { ProfileChatModals } from "@web-client/components/profile/ProfileChatModals";
import { VoiceChatModals } from "@web-client/components/voice/VoiceChatModals";
import { CommunityChatModals } from "@web-client/components/community/CommunityChatModals";
import { ChatAppShellDialogs } from "@web-client/chat-app/modals/ChatAppShellDialogs";
import { useChatAppModalUiState } from "@web-client/chat-app/modals/useChatAppModalUiState";
import type { ChatAppOrchestrationApi } from "@web-client/hooks/useChatAppOrchestration";
import { useVoiceSessionController } from "@shared/features/voice/hooks/useVoiceSessionController";

type ChatAppController = ChatAppOrchestrationApi;
type VoiceSessionApi = ReturnType<typeof useVoiceSessionController>;

export type ChatAppModalLayerProps = {
  app: ChatAppController;
  user: User;
  managedReportServers: Array<{ id: string; name: string }>;
  voiceSession: VoiceSessionApi;
  visibleActiveVoiceParticipants: VoiceSessionApi["state"]["participants"];
  canOpenVoicePopout: boolean;
  canKickVoiceParticipants: boolean;
  handleOpenVoicePopout: () => void;
  handleKickVoiceParticipant: (
    targetUserId: string,
    displayName: string,
  ) => Promise<void>;
};

export function ChatAppModalLayer({
  app,
  user,
  managedReportServers,
  voiceSession,
  visibleActiveVoiceParticipants,
  canOpenVoicePopout,
  canKickVoiceParticipants,
  handleOpenVoicePopout,
  handleKickVoiceParticipant,
}: ChatAppModalLayerProps) {
  const ui = useChatAppModalUiState();

  return (
    <>
      <AuthChatModals app={app} />
      <NotificationModalsHost app={app} ui={ui} />
      <SocialChatModals app={app} user={user} />
      <ModerationChatModals
        app={app}
        user={user}
        managedReportServers={managedReportServers}
        ui={ui}
      />
      <VoiceChatModals
        app={app}
        ui={ui}
        voiceSession={voiceSession}
        visibleActiveVoiceParticipants={visibleActiveVoiceParticipants}
        canOpenVoicePopout={canOpenVoicePopout}
        canKickVoiceParticipants={canKickVoiceParticipants}
        handleOpenVoicePopout={handleOpenVoicePopout}
        handleKickVoiceParticipant={handleKickVoiceParticipant}
      />
      <ProfileChatModals app={app} user={user} ui={ui} />
      <CommunityChatModals app={app} user={user} ui={ui} />
      <ChatAppShellDialogs app={app} ui={ui} />
    </>
  );
}
