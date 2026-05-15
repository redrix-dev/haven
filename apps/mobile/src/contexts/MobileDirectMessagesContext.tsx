import { createContext, useContext, type ReactNode } from "react";
import { useDirectMessages } from "@shared/features/direct-messages/hooks/useDirectMessages";
import { getDirectMessageBackend } from "@shared/lib/backend";
import { useNavigationStore } from "@shared/stores/navigationStore";

type DirectMessagesHookReturn = ReturnType<typeof useDirectMessages>;

const MobileDirectMessagesContext = createContext<DirectMessagesHookReturn | null>(null);

export function MobileDirectMessagesProvider({
  userId,
  children,
  /** When true, DM realtime + loads stay active regardless of `workspaceMode` (e.g. haven-rev2 bubble shell). */
  isDmWorkspaceAlwaysActive = false,
}: {
  userId: string;
  children: ReactNode;
  isDmWorkspaceAlwaysActive?: boolean;
}) {
  const workspaceMode = useNavigationStore((s) => s.workspaceMode);
  const isDmWorkspaceActive =
    isDmWorkspaceAlwaysActive || workspaceMode === "dm";

  const directMessageBackend = getDirectMessageBackend();
  const directMessages = useDirectMessages({
    directMessageBackend,
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
