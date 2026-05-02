import { createContext, useContext, type ReactNode } from "react";
import { useSocialWorkspace } from "@shared/features/social/hooks/useSocialWorkspace";
import { getSocialBackend } from "@shared/lib/backend";

type SocialHookReturn = ReturnType<typeof useSocialWorkspace>;

const MobileSocialWorkspaceContext = createContext<SocialHookReturn | null>(null);

export function MobileSocialWorkspaceProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const socialBackend = getSocialBackend();
  const social = useSocialWorkspace({
    socialBackend,
    userId,
    enabled: true,
  });

  return (
    <MobileSocialWorkspaceContext.Provider value={social}>
      {children}
    </MobileSocialWorkspaceContext.Provider>
  );
}

export function useMobileSocialWorkspace(): SocialHookReturn {
  const ctx = useContext(MobileSocialWorkspaceContext);
  if (!ctx) {
    throw new Error("useMobileSocialWorkspace requires MobileSocialWorkspaceProvider.");
  }
  return ctx;
}
