import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { getControlPlaneBackend } from "@shared/lib/backend";
import { useServersStore } from "@shared/stores/serversStore";

/**
 * Owns the community-members realtime subscription for mobile.
 * Mount this once after auth so screen-level hooks don't create duplicate listeners.
 */
export function useServersRealtimeBootstrap(
  session: Session | null | undefined,
): void {
  useEffect(() => {
    if (!session?.user?.id) {
      useServersStore.getState().reset();
      return;
    }

    let disposed = false;
    const controlPlaneBackend = getControlPlaneBackend();
    const userId = session.user.id;

    const refreshServers = async () => {
      useServersStore.getState().setIsLoading(true);
      try {
        const serverList = await controlPlaneBackend.listUserCommunities(userId);
        if (disposed) return;
        useServersStore.getState().setServers(serverList);
      } catch (error) {
        if (disposed) return;
        console.error("Error loading servers in realtime bootstrap:", error);
      } finally {
        if (!disposed) {
          useServersStore.getState().setIsLoading(false);
        }
      }
    };

    void refreshServers();

    const subscription = controlPlaneBackend.subscribeToUserCommunities(
      userId,
      () => {
        void refreshServers();
      },
    );

    return () => {
      disposed = true;
      void subscription.unsubscribe();
    };
  }, [session?.user?.id]);

}
