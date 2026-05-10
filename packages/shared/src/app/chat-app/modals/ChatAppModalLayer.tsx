import React from "react";
import type { User } from "@supabase/supabase-js";
import { AuthChatModals } from "@shared/features/auth/components/AuthChatModals";
import { NotificationModalsHost } from "@shared/features/notifications/components/NotificationModalsHost";
import { SocialChatModals } from "@shared/features/social/components/SocialChatModals";
import { ModerationChatModals } from "@shared/features/moderation/components/ModerationChatModals";
import { ProfileChatModals } from "@shared/features/profile/components/ProfileChatModals";
import { VoiceChatModals } from "@shared/features/voice/components/VoiceChatModals";
import { CommunityChatModals } from "@shared/features/community/components/CommunityChatModals";
import { ChatAppShellDialogs } from "@shared/app/chat-app/modals/ChatAppShellDialogs";
import { useChatAppModalUiState } from "@shared/app/chat-app/modals/useChatAppModalUiState";
import type { ChatAppOrchestrationApi } from "@shared/app/hooks/useChatAppOrchestration";
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
