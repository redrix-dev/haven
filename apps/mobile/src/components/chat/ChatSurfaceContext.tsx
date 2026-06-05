import { createContext, useContext } from "react";
import type { useChatComposerChrome } from "@/components/chat/useChatComposerChrome";

export type ChatSurfaceChrome = Pick<
  ReturnType<typeof useChatComposerChrome>,
  "composerBackdropAnimatedStyle" | "composerChromeAnimatedStyle"
>;

const ChatSurfaceContext = createContext<ChatSurfaceChrome | null>(null);

export function ChatSurfaceProvider({
  value,
  children,
}: {
  value: ChatSurfaceChrome;
  children: React.ReactNode;
}) {
  return <ChatSurfaceContext.Provider value={value}>{children}</ChatSurfaceContext.Provider>;
}

export function useChatSurfaceChrome(): ChatSurfaceChrome {
  const ctx = useContext(ChatSurfaceContext);
  if (!ctx) {
    throw new Error("useChatSurfaceChrome must be used within ChatInterface");
  }
  return ctx;
}
