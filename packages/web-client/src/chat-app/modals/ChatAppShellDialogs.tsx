import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/app/ui/alert-dialog";
import { useChatAppSession } from "@web-client/chat-app/ChatAppSession";
import { useChatAppModalUiState } from "@web-client/chat-app/modals/chatAppModalUiState";

export function ChatAppShellDialogs() {
  const app = useChatAppSession();
  const {
    pendingUiConfirmation,
    setPendingUiConfirmation,
    pendingUiConfirmationCopy,
  } = useChatAppModalUiState();

  return (
    <>
      <AlertDialog
        open={Boolean(app.voiceJoinPrompt)}
        onOpenChange={(open) => !open && app.cancelVoiceChannelJoinPrompt()}
      >
        <AlertDialogContent className="bg-surface-legal border-border text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {app.voiceJoinPrompt?.mode === "switch"
                ? "Switch voice channel?"
                : "Join voice channel?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {app.voiceJoinPrompt?.mode === "switch"
                ? "You are already connected to voice. Switching will move your session to the new channel."
                : "Join this voice channel now? You can keep browsing text channels while connected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-white hover:bg-secondary">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={app.confirmVoiceChannelJoin}
              className="bg-primary hover:bg-primary-hover text-white"
            >
              {app.voiceJoinPrompt?.mode === "switch" ? "Switch" : "Join"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingUiConfirmation)}
        onOpenChange={(open) => {
          if (!open) setPendingUiConfirmation(null);
        }}
      >
        <AlertDialogContent className="bg-surface-legal border-border text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingUiConfirmationCopy.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {pendingUiConfirmationCopy.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-white hover:bg-secondary">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                app.confirmPendingUiAction();
              }}
              className={
                pendingUiConfirmationCopy.isDestructive
                  ? "bg-red-600 text-white hover:bg-red-500"
                  : "bg-primary hover:bg-primary-hover text-white"
              }
            >
              {pendingUiConfirmationCopy.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
