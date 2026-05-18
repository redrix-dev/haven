import React from "react";
import { PasswordRecoveryDialog } from "@web-client/components/auth/PasswordRecoveryDialog";
import type { ChatAppOrchestrationApi } from "@web-client/hooks/useChatAppOrchestration";

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
