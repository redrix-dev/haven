import React from "react";
import { PasswordRecoveryDialog } from "@web-client/components/auth/PasswordRecoveryDialog";
import { useChatAppSession } from "@web-client/chat-app/ChatAppSession";

export function AuthChatModals() {
  const app = useChatAppSession();
  return (
    <PasswordRecoveryDialog
      open={app.passwordRecoveryRequired}
      onCompletePasswordRecovery={app.completePasswordRecovery}
      onSignOut={app.signOut}
    />
  );
}
