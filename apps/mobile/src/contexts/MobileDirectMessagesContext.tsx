import { createContext, useContext, type ReactNode } from "react";
import { useDirectMessages } from "@shared/features/direct-messages/hooks/useDirectMessages";
import { useUiStore } from "@shared/stores/uiStore";

type DirectMessagesHookReturn = ReturnType<typeof useDirectMessages>;

const MobileDirectMessagesContext = createContext<DirectMessagesHookReturn | null>(null);

export function MobileDirectMessagesProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const workspaceMode = useUiStore((s) => s.workspaceMode);
  const isDmWorkspaceActive = workspaceMode === "dm";

  const directMessages = useDirectMessages({
    userId,
    enabled: true,
    isActive: isDmWorkspaceActive,
  });

  return (
    <MobileDirectMessagesContext.Provider value={directMessages}>
      {children}
    </MobileDirectMessagesContext.Provider>
  );
}

export function useMobileDirectMessages(): DirectMessagesHookReturn {
  const ctx = useContext(MobileDirectMessagesContext);
  if (!ctx) {
    throw new Error("useMobileDirectMessages requires MobileDirectMessagesProvider.");
  }
  return ctx;
}
