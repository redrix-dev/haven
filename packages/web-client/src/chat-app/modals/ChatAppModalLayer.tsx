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
import { useVoiceSessionController } from "@shared/features/voice/hooks/useVoiceSessionController";

type VoiceSessionApi = ReturnType<typeof useVoiceSessionController>;

export type ChatAppModalLayerProps = {
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
  user,
  managedReportServers,
  voiceSession,
  visibleActiveVoiceParticipants,
  canOpenVoicePopout,
  canKickVoiceParticipants,
  handleOpenVoicePopout,
  handleKickVoiceParticipant,
}: ChatAppModalLayerProps) {
  return (
    <>
      <AuthChatModals />
      <NotificationModalsHost />
      <SocialChatModals user={user} />
      <ModerationChatModals
        user={user}
        managedReportServers={managedReportServers}
      />
      <VoiceChatModals
        voiceSession={voiceSession}
        visibleActiveVoiceParticipants={visibleActiveVoiceParticipants}
        canOpenVoicePopout={canOpenVoicePopout}
        canKickVoiceParticipants={canKickVoiceParticipants}
        handleOpenVoicePopout={handleOpenVoicePopout}
        handleKickVoiceParticipant={handleKickVoiceParticipant}
      />
      <ProfileChatModals user={user} />
      <CommunityChatModals user={user} />
      <ChatAppShellDialogs />
    </>
  );
}
