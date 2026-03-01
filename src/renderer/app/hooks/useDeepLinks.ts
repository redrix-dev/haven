import React, { useEffect, useRef } from 'react';
import { asRecord, getRecordString } from '@/shared/lib/records';
import {
  WEB_DEEP_LINK_DEDUPE_WINDOW_MS,
  safeStableStringify,
  parseWebAppDeepLinkUrl,
  parseWebPushClickPayloadTarget,
  getMergedUrlParams,
  normalizeDeepLinkPathname,
  WebAppDeepLinkTarget,
} from '@/lib/deepLinks';
import { recordLocalNotificationDeliveryTrace } from '@/lib/notifications/devTrace';
import { desktopClient } from '@/shared/desktop/client';
import { getErrorMessage } from '@/shared/lib/errors';
import { toast } from 'sonner';
import type { FriendsPanelTab } from '@/renderer/app/types';

interface UseDeepLinksOptions {
  user: { id: string } | null;
  friendsSocialPanelEnabled: boolean;
  joinServerByInvite: (code: string) => Promise<{ joined: boolean; communityName: string }>;
  openDirectMessageConversation: (conversationId: string) => Promise<void>;
  setWorkspaceMode: (mode: 'community' | 'dm') => void;
  setNotificationsPanelOpen: (open: boolean) => void;
  setFriendsPanelOpen: (open: boolean) => void;
  setFriendsPanelRequestedTab: (tab: FriendsPanelTab | null) => void;
  setFriendsPanelHighlightedRequestId: (id: string | null) => void;
  setCurrentServerId: (id: string) => void;
  setCurrentChannelId: (id: string) => void;
}

export function useDeepLinks({
  user,
  friendsSocialPanelEnabled,
  joinServerByInvite,
  openDirectMessageConversation,
  setWorkspaceMode,
  setNotificationsPanelOpen,
  setFriendsPanelOpen,
  setFriendsPanelRequestedTab,
  setFriendsPanelHighlightedRequestId,
  setCurrentServerId,
  setCurrentChannelId,
}: UseDeepLinksOptions) {
  const processedWebDeepLinkKeysRef = useRef<Map<string, number>>(new Map());
  const pendingWebDeepLinkRef = useRef<{
    target: WebAppDeepLinkTarget;
    clearBrowserUrlAfterOpen: boolean;
    dedupeKey: string | null;
  } | null>(null);

  const clearBrowserDeepLinkUrl = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const parsed = new URL(window.location.href);
      if (normalizeDeepLinkPathname(parsed.pathname) === '/') {
        const params = getMergedUrlParams(parsed);
        const hasDeepLinkParams =
          params.has('target') ||
          params.has('open') ||
          params.has('kind') ||
          params.has('notificationKind') ||
          params.has('conversationId') ||
          params.has('friendRequestId') ||
          params.has('communityId') ||
          params.has('channelId') ||
          params.has('invite') ||
          params.has('code');
        if (!hasDeepLinkParams) return;
      }
      window.history.replaceState({}, document.title, '/');
    } catch (historyError) {
      console.warn('Failed to clear web deep-link URL:', historyError);
    }
  }, []);

  const openWebDeepLinkTarget = React.useCallback(
    async (
      target: WebAppDeepLinkTarget,
      options?: {
        clearBrowserUrlAfterOpen?: boolean;
        dedupeKey?: string | null;
      }
    ): Promise<boolean> => {
      const now = Date.now();
      for (const [key, timestamp] of processedWebDeepLinkKeysRef.current.entries()) {
        if (now - timestamp > WEB_DEEP_LINK_DEDUPE_WINDOW_MS) {
          processedWebDeepLinkKeysRef.current.delete(key);
        }
      }

      const dedupeKey = options?.dedupeKey ?? null;
      if (dedupeKey) {
        const lastProcessedAt = processedWebDeepLinkKeysRef.current.get(dedupeKey);
        if (typeof lastProcessedAt === 'number' && now - lastProcessedAt <= WEB_DEEP_LINK_DEDUPE_WINDOW_MS) {
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
          case 'invite': {
            const result = await joinServerByInvite(target.inviteCode);
            toast.success(
              result.joined
                ? `Joined ${result.communityName}`
                : `Opened ${result.communityName}`,
              { id: 'web-deep-link-invite' }
            );
            break;
          }
          case 'dm_message': {
            setWorkspaceMode('dm');
            await openDirectMessageConversation(target.conversationId);
            setNotificationsPanelOpen(false);
            break;
          }
          case 'friend_request_received': {
            if (!friendsSocialPanelEnabled) {
              throw new Error('Friends are not enabled for your account.');
            }
            setFriendsPanelRequestedTab('requests');
            setFriendsPanelHighlightedRequestId(target.friendRequestId);
            setFriendsPanelOpen(true);
            setNotificationsPanelOpen(false);
            break;
          }
          case 'friend_request_accepted': {
            if (!friendsSocialPanelEnabled) {
              throw new Error('Friends are not enabled for your account.');
            }
            setFriendsPanelRequestedTab('friends');
            setFriendsPanelHighlightedRequestId(null);
            setFriendsPanelOpen(true);
            setNotificationsPanelOpen(false);
            break;
          }
          case 'channel_mention': {
            setWorkspaceMode('community');
            setCurrentServerId(target.communityId);
            setCurrentChannelId(target.channelId);
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
        toast.error(getErrorMessage(error, 'Failed to open link.'), {
          id: 'web-deep-link-open-error',
        });
        return false;
      }
    },
    [
      clearBrowserDeepLinkUrl,
      friendsSocialPanelEnabled,
      joinServerByInvite,
      openDirectMessageConversation,
      setCurrentChannelId,
      setCurrentServerId,
      setFriendsPanelHighlightedRequestId,
      setFriendsPanelOpen,
      setFriendsPanelRequestedTab,
      setNotificationsPanelOpen,
      setWorkspaceMode,
      user,
    ]
  );

  // Listen for push notification clicks from the service worker
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const data = asRecord(event.data);
      if (!data) return;

      if (data.type === 'HAVEN_PUSH_DELIVERY_TRACE') {
        recordLocalNotificationDeliveryTrace({
          notificationRecipientId: getRecordString(asRecord(data.payload), 'recipientId'),
          eventId: getRecordString(asRecord(data.payload), 'eventId'),
          transport: 'web_push',
          stage: 'client_route',
          decision:
            data.decision === 'send' || data.decision === 'skip' || data.decision === 'defer'
              ? data.decision
              : 'defer',
          reasonCode:
            typeof data.reasonCode === 'string' ? (data.reasonCode as never) : 'sent',
          details: {
            source: 'service_worker',
            ...((asRecord(data.details) ?? {}) as Record<string, unknown>),
          },
        });
        return;
      }

      if (data.type !== 'HAVEN_PUSH_NOTIFICATION_CLICK') return;

      const targetUrl = getRecordString(data, 'targetUrl');
      const target =
        (targetUrl ? parseWebAppDeepLinkUrl(targetUrl) : null) ??
        parseWebPushClickPayloadTarget(data.payload);
      if (!target) return;
      const dedupeKey = `sw:${targetUrl ?? ''}:${safeStableStringify(data.payload)}`;

      void openWebDeepLinkTarget(target, {
        clearBrowserUrlAfterOpen: Boolean(targetUrl),
        dedupeKey,
      });
    };

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [openWebDeepLinkTarget]);

  // Handle deep link in the initial page URL (web PWA only)
  useEffect(() => {
    if (desktopClient.isAvailable()) return;
    if (typeof window === 'undefined') return;

    const currentUrl = window.location.href;
    const target = parseWebAppDeepLinkUrl(currentUrl);
    if (!target) return;

    void openWebDeepLinkTarget(target, {
      clearBrowserUrlAfterOpen: true,
      dedupeKey: `url:${currentUrl}`,
    });
  }, [openWebDeepLinkTarget]);

  // Flush any deep link that was queued before the user was authenticated
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
