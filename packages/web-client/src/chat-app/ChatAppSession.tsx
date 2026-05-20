import React, { createContext, useContext } from "react";
import {
  useChatAppSessionState,
  type ChatAppSessionState,
} from "@web-client/chat-app/useChatAppSessionState";

const ChatAppSessionContext = createContext<ChatAppSessionState | null>(null);

export function ChatAppSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = useChatAppSessionState();
  return (
    <ChatAppSessionContext.Provider value={session}>
      {children}
    </ChatAppSessionContext.Provider>
  );
}

export function useChatAppSession(): ChatAppSessionState {
  const session = useContext(ChatAppSessionContext);
  if (!session) {
    throw new Error(
      "useChatAppSession must be used within ChatAppSessionProvider",
    );
  }
  return session;
}

/** @deprecated Use useChatAppSession() — removed prop-drilled ChatAppOrchestrationApi. */
export type ChatAppOrchestrationApi = ChatAppSessionState;
