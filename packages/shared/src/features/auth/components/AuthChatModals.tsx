import React from "react";
import { PasswordRecoveryDialog } from "@shared/features/auth/components/PasswordRecoveryDialog";
import type { ChatAppOrchestrationApi } from "@shared/app/hooks/useChatAppOrchestration";

type AuthChatModalsProps = {
  app: ChatAppOrchestrationApi;
};

export function AuthChatModals({ app }: AuthChatModalsProps) {
  return (
    <PasswordRecoveryDialog
      open={app.passwordRecoveryRequired}
      onCompletePasswordRecovery={app.completePasswordRecovery}
      onSignOut={app.signOut}
    />
  );
}
