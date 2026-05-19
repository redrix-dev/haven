import { useEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { dataCacheDebug } from "@shared/debug";
import { havenEventBus } from "@shared/infrastructure/realtime";
import { getControlPlaneBackend } from "@shared/lib/backend";

/**
 * Subscribes to the user's private Realtime broadcast channel and routes
 * events into HavenEventBus (message nexus, notifications, DMs, etc.).
 * Web does this in shared AuthContext; mobile uses useAuthSession instead.
 */
export function usePrivateUserChannelBootstrap(
  session: Session | null | undefined,
): void {
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;

    const userId = session?.user?.id;
    if (!userId) {
      havenEventBus.clearAll();
      return;
    }

    dataCacheDebug.realtime(
      "usePrivateUserChannelBootstrap",
      "subscribe private user channel",
      { userId },
    );

    unsubscribeRef.current = getControlPlaneBackend().subscribeToPrivateUserChannel(
      userId,
      (evt) => {
        dataCacheDebug.realtime(
          "usePrivateUserChannelBootstrap",
          evt.type,
          evt.payload,
        );
        havenEventBus.handle(evt);
      },
    );

    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [session?.user?.id]);
}
