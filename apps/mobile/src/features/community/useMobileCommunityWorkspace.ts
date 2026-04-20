import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ServerSummary } from "@shared/lib/backend/types";
import { listUserCommunitiesWithClient } from "@shared/lib/listUserCommunitiesWithClient";
import { getErrorMessage } from "@shared/platform/lib/errors";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { getMobileSupabase } from "../../supabase/getMobileSupabase";

type MobileCommunityPhase = "loading" | "ready" | "missing" | "error";

type UseMobileCommunityWorkspaceResult = {
    phase: MobileCommunityPhase;
    errorMessage: string | null;
    currentUserId: string | null;
    servers: ServerSummary[];
    community: ServerSummary | null;
    refresh: () => Promise<void>;
};

export function useMobileCommunityWorkspace(
    communityId: string,
): UseMobileCommunityWorkspaceResult {
    const [phase, setPhase] = useState<MobileCommunityPhase>("loading");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [servers, setServers] = useState<ServerSummary[]>([]);

    // cancellation/inflight guards
    const activeRequestIdRef = useRef(0);

    useEffect(() => {
        useNavigationStore.getState().setCurrentServerId(communityId);

        return () => {
            useNavigationStore.getState().setCurrentServerId(null);
        };
    }, [communityId]);

    const refresh = useCallback(async () => {
        const requestId = activeRequestIdRef.current += 1;

        setPhase("loading");
        setErrorMessage(null);

        try {
            const supabase = getMobileSupabase();
            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();
            
            if (requestId !== activeRequestIdRef.current) return;
            if (userError) throw userError;
            
            if (!user?.id) {
                setCurrentUserId(null);
                setServers([]);
                setPhase("error");
                setErrorMessage("Not signed in.");
                return;
            }

            setCurrentUserId(user.id);

            const nextServers = await listUserCommunitiesWithClient(supabase, user.id);

            if (requestId !== activeRequestIdRef.current) return;
            setServers(nextServers);

            const hasCommunity = nextServers.some((row) => row.id === communityId);
            setPhase(hasCommunity ? "ready" : "missing");
        } catch (error) {
            if (requestId !== activeRequestIdRef.current) return;
            setPhase("error");
            setErrorMessage(getErrorMessage(error, "Failed to load community."));
        }
    }, [communityId]);
    
    useEffect(() => {
        void refresh();

        return () => {
            //invalidate inflight request
            activeRequestIdRef.current += 1;
        };
    }, [refresh]);

    const community = useMemo(
        () => servers.find((row) => row.id === communityId) ?? null,
        [servers, communityId],
    );
    
    return {
        phase,
        errorMessage,
        currentUserId,
        servers,
        community,
        refresh,
    };
}