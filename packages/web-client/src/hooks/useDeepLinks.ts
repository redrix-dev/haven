import React, { useEffect, useRef } from "react";
import { asRecord, getRecordString } from "@platform/lib/records";
import {
  WEB_DEEP_LINK_DEDUPE_WINDOW_MS,
  parseWebAppDeepLinkUrl,
  getMergedUrlParams,
  normalizeDeepLinkPathname,
  WebAppDeepLinkTarget,
} from "@shared/infrastructure/platform/deepLinks";
import { getAppHost } from "@shared/infrastructure/platform/appHost";
import { getErrorMessage } from "@platform/lib/errors";
import type { FriendsPanelTab } from "@shared/types/types";
import { requireHavenCore, syncFocusFromRoute } from "@shared/core";
import { useUiStore } from "@shared/stores/uiStore";

type DeepLinkNotifier = (
  level: "success" | "error",
  message: string,
  options?: { id?: string },
) => void;
interface UseDeepLinksOptions {
  user: { id: string } | null;
  joinServerByInvite: (
    code: string,
  ) => Promise<{ joined: boolean; communityName: string }>;
  openDirectMessageConversation: (conversationId: string) => Promise<void>;
  setNotificationsPanelOpen: (open: boolean) => void;
  setFriendsPanelOpen: (open: boolean) => void;
  setFriendsPanelRequestedTab: (tab: FriendsPanelTab | null) => void;
  setFriendsPanelHighlightedRequestId: (id: string | null) => void;
  notify?: DeepLinkNotifier;
}

export function useDeepLinks({
  user,
  joinServerByInvite,
  openDirectMessageConversation,
  setNotificationsPanelOpen,
  setFriendsPanelOpen,
  setFriendsPanelRequestedTab,
  setFriendsPanelHighlightedRequestId,
  notify,
}: UseDeepLinksOptions) {
  const setWorkspaceMode = useUiStore((state) => state.setWorkspaceMode);
  const processedWebDeepLinkKeysRef = useRef<Map<string, number>>(new Map());
  const pendingWebDeepLinkRef = useRef<{
    target: WebAppDeepLinkTarget;
    clearBrowserUrlAfterOpen: boolean;
    dedupeKey: string | null;
  } | null>(null);

  const clearBrowserDeepLinkUrl = React.useCallback(() => {
    const browserRuntime = getAppHost().browserRuntime;
    if (!browserRuntime) return;
    try {
      const currentUrl = browserRuntime.getLocationHref();
      if (!currentUrl) return;
      const parsed = new URL(currentUrl);
      if (normalizeDeepLinkPathname(parsed.pathname) === "/") {
        const params = getMergedUrlParams(parsed);
        const hasDeepLinkParams =
          params.has("target") ||
          params.has("open") ||
          params.has("kind") ||
          params.has("notificationKind") ||
          params.has("conversationId") ||
          params.has("friendRequestId") ||
          params.has("communityId") ||
          params.has("channelId") ||
          params.has("invite") ||
          params.has("code");
        if (!hasDeepLinkParams) return;
      }
      browserRuntime.replaceHistoryUrl("/");
    } catch (historyError) {
      console.warn("Failed to clear web deep-link URL:", historyError);
    }
  }, []);

  const openWebDeepLinkTarget = React.useCallback(
    async (
      target: WebAppDeepLinkTarget,
      options?: {
        clearBrowserUrlAfterOpen?: boolean;
        dedupeKey?: string | null;
      },
    ): Promise<boolean> => {
      const now = Date.now();
      for (const [
        key,
        timestamp,
      ] of processedWebDeepLinkKeysRef.current.entries()) {
        if (now - timestamp > WEB_DEEP_LINK_DEDUPE_WINDOW_MS) {
          processedWebDeepLinkKeysRef.current.delete(key);
        }
      }

      const dedupeKey = options?.dedupeKey ?? null;
      if (dedupeKey) {
        const lastProcessedAt =
          processedWebDeepLinkKeysRef.current.get(dedupeKey);
        if (
          typeof lastProcessedAt === "number" &&
          now - lastProcessedAt <= WEB_DEEP_LINK_DEDUPE_WINDOW_MS
        ) {
          return false;
        }
      }

      if (!user) {
        pendingWebDeepLinkRef.current = {
          target,
          clearBrowserUrlAfterOpen: Boolean(options?.clearBrowserUrlAfterOpen),
          dedupeKey,
        };
        return false;
      }

      try {
        switch (target.kind) {
          case "invite": {
            const result = await joinServerByInvite(target.inviteCode);
            notify?.(
              "success",
              result.joined
                ? `Joined ${result.communityName}`
                : `Opened ${result.communityName}`,
            );
            break;
          }
          case "dm_message": {
            setWorkspaceMode("dm");
            await openDirectMessageConversation(target.conversationId);
            setNotificationsPanelOpen(false);
            break;
          }
          case "friend_request_received": {
            setFriendsPanelRequestedTab("requests");
            setFriendsPanelHighlightedRequestId(target.friendRequestId);
            setFriendsPanelOpen(true);
            setNotificationsPanelOpen(false);
            break;
          }
          case "friend_request_accepted": {
            setFriendsPanelRequestedTab("friends");
            setFriendsPanelHighlightedRequestId(null);
            setFriendsPanelOpen(true);
            setNotificationsPanelOpen(false);
            break;
          }
          case "channel_mention": {
            setWorkspaceMode("community");
            syncFocusFromRoute(requireHavenCore(), {
              communityId: target.communityId,
              channelId: target.channelId,
            });
            setNotificationsPanelOpen(false);
            break;
          }
          default:
            return false;
        }

        if (dedupeKey) {
          processedWebDeepLinkKeysRef.current.set(dedupeKey, now);
        }
        if (options?.clearBrowserUrlAfterOpen) {
          clearBrowserDeepLinkUrl();
        }
        return true;
      } catch (error) {
        notify?.("error", getErrorMessage(error, "Failed to open link."), {
          id: "web-deep-link-open-error",
        });
        return false;
      }
    },
    [
      clearBrowserDeepLinkUrl,
      joinServerByInvite,
      openDirectMessageConversation,
      setFriendsPanelHighlightedRequestId,
      setFriendsPanelOpen,
      setFriendsPanelRequestedTab,
      setNotificationsPanelOpen,
      setWorkspaceMode,
      user,
      notify,
    ],
  );

  // Handle deep link in the initial page URL for the browser client.
  useEffect(() => {
    if (getAppHost().isDesktopApp()) return;
    const currentUrl = getAppHost().browserRuntime?.getLocationHref();
    if (!currentUrl) return;

    const target = parseWebAppDeepLinkUrl(currentUrl);
    if (!target) return;

    void openWebDeepLinkTarget(target, {
      clearBrowserUrlAfterOpen: true,
      dedupeKey: `url:${currentUrl}`,
    });
  }, [openWebDeepLinkTarget]);

  // Flush any deep link that was queued before auth.
  useEffect(() => {
    if (!user) return;
    const pending = pendingWebDeepLinkRef.current;
    if (!pending) return;

    pendingWebDeepLinkRef.current = null;
    void openWebDeepLinkTarget(pending.target, {
      clearBrowserUrlAfterOpen: pending.clearBrowserUrlAfterOpen,
      dedupeKey: pending.dedupeKey,
    });
  }, [openWebDeepLinkTarget, user]);

  return { openWebDeepLinkTarget, clearBrowserDeepLinkUrl };
}
