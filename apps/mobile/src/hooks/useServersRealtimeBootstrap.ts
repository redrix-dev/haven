import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { dataCacheDebug } from "@shared/debug";
import { getControlPlaneBackend } from "@shared/lib/backend";
import { communityNexus } from "@shared/nexus/community/CommunityNexus";
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
      dataCacheDebug.fetch("useServersRealtimeBootstrap", "refreshServers start", {
        userId,
      });
      useServersStore.getState().setIsLoading(true);
      try {
        const serverList = await controlPlaneBackend.listUserCommunities(userId);
        if (disposed) return;
        useServersStore.getState().setServers(serverList);
        communityNexus.setCommunities(
          serverList.map((s) => ({
            id: s.id,
            name: s.name,
            createdAt: s.created_at,
          })),
        );
        dataCacheDebug.fetch("useServersRealtimeBootstrap", "refreshServers success", {
          count: serverList.length,
        });
      } catch (error) {
        if (disposed) return;
        dataCacheDebug.fetch(
          "useServersRealtimeBootstrap",
          "refreshServers error",
          { error: String(error) },
          "error",
        );
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
        dataCacheDebug.realtime("useServersRealtimeBootstrap", "communities subscription");
        void refreshServers();
      },
    );

    return () => {
      disposed = true;
      void subscription.unsubscribe();
    };
  }, [session?.user?.id]);

}
