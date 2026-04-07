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
import type { ChatAppOrchestrationApi } from "@shared/app/hooks/useChatAppOrchestration";
import type { ChatAppModalUiState } from "@shared/app/chat-app/modals/useChatAppModalUiState";

type ChatAppShellDialogsProps = {
  app: ChatAppOrchestrationApi;
  ui: Pick<
    ChatAppModalUiState,
    | "pendingUiConfirmation"
    | "setPendingUiConfirmation"
    | "pendingUiConfirmationCopy"
  >;
};

export function ChatAppShellDialogs({ app, ui }: ChatAppShellDialogsProps) {
  const {
    pendingUiConfirmation,
    setPendingUiConfirmation,
    pendingUiConfirmationCopy,
  } = ui;

  return (
    <>
      <AlertDialog
        open={Boolean(app.voiceJoinPrompt)}
        onOpenChange={(open) => !open && app.cancelVoiceChannelJoinPrompt()}
      >
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {app.voiceJoinPrompt?.mode === "switch"
                ? "Switch voice channel?"
                : "Join voice channel?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {app.voiceJoinPrompt?.mode === "switch"
                ? "You are already connected to voice. Switching will move your session to the new channel."
                : "Join this voice channel now? You can keep browsing text channels while connected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={app.confirmVoiceChannelJoin}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
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
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingUiConfirmationCopy.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {pendingUiConfirmationCopy.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]">
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
                  : "bg-[#3f79d8] hover:bg-[#325fae] text-white"
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
