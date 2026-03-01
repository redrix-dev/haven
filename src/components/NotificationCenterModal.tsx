import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type {
  NotificationCounts,
  NotificationDeliveryTraceRecord,
  NotificationItem,
  NotificationPreferences,
  NotificationPreferenceUpdate,
  WebPushDispatchQueueHealthDiagnostics,
  WebPushDispatchWakeupDiagnostics,
} from '@/lib/backend/types';
import type { NotificationAudioSettings } from '@/shared/desktop/types';
import { Bell, BellDot, RefreshCcw, Volume2, VolumeX } from 'lucide-react';

type WebPushControlsStatus = {
  supported: boolean;
  secureContext: boolean;
  supportsServiceWorker: boolean;
  supportsNotifications: boolean;
  supportsPushManager: boolean;
  serviceWorkerRegistrationEnabled: boolean;
  webPushSyncEnabled: boolean;
  vapidPublicKeyConfigured: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  serviceWorkerReady: boolean;
  browserSubscriptionActive: boolean;
  backendSubscriptionCount: number | null;
  installationId?: string | null;
};

type WebPushControls = {
  status: WebPushControlsStatus | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onRefreshStatus: () => void;
  onToggleOnThisDevice: () => void;
  testTools?: {
    busy: boolean;
    error: string | null;
    lastResult: string | null;
    onShowServiceWorkerTestNotification: () => void;
    onSimulateNotificationClick: () => void;
    onRunWorkerOnce: () => void;
    onRunWorkerShadowOnce?: () => void;
    onRunWorkerWakeupOnce?: () => void;
    diagnostics?: {
      loading: boolean;
      error: string | null;
      devMode: 'real' | 'simulated_push' | 'hybrid';
      routeMode: string;
      routeReasons: string[];
      queueHealthState: WebPushDispatchQueueHealthDiagnostics | null;
      queueHealthAlerts: Array<{
        level: 'warn' | 'critical';
        code: string;
        message: string;
      }>;
      wakeupState: WebPushDispatchWakeupDiagnostics | null;
      backendWakeSourceCounts: Record<string, number>;
      backendParitySummary: {
        bySource: Record<string, { total: number; send: number; skip: number; defer: number }>;
        topReasonComparisons: Array<{
          reasonCode: string;
          shadow: number;
          cron: number;
          wakeup: number;
          manual: number;
        }>;
      };
      backendParityDrift: Array<{
        reasonCode: string;
        shadowMinusCron: number;
        shadowMinusWakeup: number;
      }>;
      cutoverReadiness: {
        status: 'ready' | 'caution' | 'blocked' | 'active';
        summary: string;
        details: string[];
        recommendedAction:
          | 'fix_alerts_first'
          | 'collect_shadow_parity'
          | 'enable_shadow_wakeups'
          | 'start_cutover_rehearsal'
          | 'monitor_live_wakeup'
          | 'rollback_to_shadow';
      };
      onRefresh: () => void;
      onSetWakeupConfig?: (input: {
        enabled?: boolean | null;
        shadowMode?: boolean | null;
        minIntervalSeconds?: number | null;
      }) => void;
      onSetDevMode: (mode: 'real' | 'simulated_push' | 'hybrid') => void;
      onSimulateFocused: () => void;
      onSimulateBackground: () => void;
      onClearSimulation: () => void;
      onRecordSimulationTrace: () => void;
      onClearLocalTraces: () => void;
      localTraces: NotificationDeliveryTraceRecord[];
      backendTraces: NotificationDeliveryTraceRecord[];
    };
  };
};

type NotificationCenterModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: NotificationItem[];
  counts: NotificationCounts;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onMarkAllSeen: () => void;
  onMarkNotificationRead: (recipientId: string) => void;
  onDismissNotification: (recipientId: string) => void;
  onOpenNotificationItem?: (notification: NotificationItem) => void;
  onAcceptFriendRequestNotification?: (input: {
    recipientId: string;
    friendRequestId: string;
  }) => void;
  onDeclineFriendRequestNotification?: (input: {
    recipientId: string;
    friendRequestId: string;
  }) => void;
  preferences: NotificationPreferences | null;
  preferencesLoading: boolean;
  preferencesSaving: boolean;
  preferencesError?: string | null;
  onUpdatePreferences: (next: NotificationPreferenceUpdate) => void;
  localAudioSettings: NotificationAudioSettings;
  localAudioSaving: boolean;
  localAudioError?: string | null;
  onUpdateLocalAudioSettings: (next: NotificationAudioSettings) => void;
  webPushControls?: WebPushControls;
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString();
};

const formatAgeSeconds = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'n/a';
  if (value < 60) return `${Math.trunc(value)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.trunc(value % 60);
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
};

const getNotificationTitle = (notification: NotificationItem) => {
  switch (notification.kind) {
    case 'friend_request_received':
      return 'Friend request received';
    case 'friend_request_accepted':
      return 'Friend request accepted';
    case 'dm_message':
      return 'Direct message';
    case 'channel_mention':
      return 'Mention';
    case 'system':
    default:
      return 'Notification';
  }
};

const getNotificationSummary = (notification: NotificationItem) => {
  const titleFromPayload =
    typeof notification.payload.title === 'string' ? notification.payload.title.trim() : '';
  const messageFromPayload =
    typeof notification.payload.message === 'string' ? notification.payload.message.trim() : '';

  if (messageFromPayload) return messageFromPayload;
  if (titleFromPayload) return titleFromPayload;

  switch (notification.kind) {
    case 'friend_request_received':
      return 'A user sent you a friend request.';
    case 'friend_request_accepted':
      return 'A user accepted your friend request.';
    case 'dm_message':
      return 'You received a new direct message.';
    case 'channel_mention':
      return 'You were mentioned in a channel.';
    case 'system':
    default:
      return 'A new notification was added to your inbox.';
  }
};

const rowIsUnread = (notification: NotificationItem) => !notification.readAt;

const getFriendRequestIdFromNotification = (notification: NotificationItem): string | null => {
  if (notification.kind !== 'friend_request_received') return null;
  const raw = notification.payload.friendRequestId;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
};

export function NotificationCenterModal({
  open,
  onOpenChange,
  notifications,
  counts,
  loading,
  error,
  refreshing,
  onRefresh,
  onMarkAllSeen,
  onMarkNotificationRead,
  onDismissNotification,
  onOpenNotificationItem,
  onAcceptFriendRequestNotification,
  onDeclineFriendRequestNotification,
  preferences,
  preferencesLoading,
  preferencesSaving,
  preferencesError,
  onUpdatePreferences,
  localAudioSettings,
  localAudioSaving,
  localAudioError,
  onUpdateLocalAudioSettings,
  webPushControls,
}: NotificationCenterModalProps) {
  const webPushEnabled = Boolean(webPushControls?.status?.webPushSyncEnabled);

  const updatePrefs = (patch: Partial<NotificationPreferenceUpdate>) => {
    if (!preferences) return;
    onUpdatePreferences({
      friendRequestInAppEnabled: preferences.friendRequestInAppEnabled,
      friendRequestSoundEnabled: preferences.friendRequestSoundEnabled,
      friendRequestPushEnabled: preferences.friendRequestPushEnabled,
      dmInAppEnabled: preferences.dmInAppEnabled,
      dmSoundEnabled: preferences.dmSoundEnabled,
      dmPushEnabled: preferences.dmPushEnabled,
      mentionInAppEnabled: preferences.mentionInAppEnabled,
      mentionSoundEnabled: preferences.mentionSoundEnabled,
      mentionPushEnabled: preferences.mentionPushEnabled,
      ...patch,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="app"
        className="border-[#304867] bg-[#111a2b] text-white p-0 overflow-hidden"
      >
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="px-5 py-4 border-b border-[#263a58] bg-[linear-gradient(135deg,#16233a_0%,#101a2b_70%,#111a2b_100%)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <Bell className="size-5 text-[#9ac0ff]" />
                  Notification Center
                </DialogTitle>
                <DialogDescription className="text-[#a9b8cf]">
                  Centralized in-app notifications with unread state and sound preferences.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-[#355077] text-[#d5e4ff]">
                  Unseen: {counts.unseenCount}
                </Badge>
                <Badge variant="outline" className="border-[#355077] text-[#d5e4ff]">
                  Unread: {counts.unreadCount}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="border-[#304867] text-white"
                >
                  <RefreshCcw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[1.35fr_1fr]">
            <div className="min-h-0 border-b xl:border-b-0 xl:border-r border-[#263a58]">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#263a58]">
                <div className="flex items-center gap-2">
                  {counts.unseenCount > 0 ? (
                    <BellDot className="size-4 text-[#9ac0ff]" />
                  ) : (
                    <Bell className="size-4 text-[#9ac0ff]" />
                  )}
                  <span className="text-sm font-semibold">Inbox</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onMarkAllSeen}
                  disabled={counts.unseenCount === 0}
                  className="border-[#304867] text-white"
                >
                  Mark all seen
                </Button>
              </div>

              <ScrollArea className="h-full max-h-[52dvh] xl:max-h-none">
                <div className="p-3 space-y-2">
                  {loading ? (
                    Array.from({ length: 4 }, (_, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-[#304867] bg-[#142033] px-3 py-3"
                      >
                        <div className="flex items-start gap-3">
                          <Skeleton className="size-9 rounded-xl bg-[#22334f]" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-4 w-36 bg-[#22334f]" />
                              <Skeleton className="h-4 w-12 rounded-full bg-[#22334f]" />
                            </div>
                            <Skeleton className="h-3 w-44 bg-[#1b2a42]" />
                            <Skeleton className="h-3 w-full bg-[#1b2a42]" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : error ? (
                    <p className="text-sm text-red-300">{error}</p>
                  ) : notifications.length === 0 ? (
                    <div className="rounded-md border border-dashed border-[#304867] bg-[#142033]/50 p-4">
                      <p className="text-sm text-[#a9b8cf]">No notifications yet.</p>
                      <p className="mt-1 text-xs text-[#90a5c4]">
                        Friend requests will appear here once the social graph phase ships.
                      </p>
                    </div>
                  ) : (
                    notifications.map((notification) => {
                      const actorLabel =
                        notification.actorUsername?.trim() || notification.actorUserId || 'System';
                      const actorInitial = actorLabel.trim().charAt(0).toUpperCase() || 'N';
                      const unread = rowIsUnread(notification);
                      const friendRequestId = getFriendRequestIdFromNotification(notification);
                      const canOpenNotification = Boolean(onOpenNotificationItem);
                      const handleOpenNotification = () => {
                        onOpenNotificationItem?.(notification);
                      };
                      const handleNotificationKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
                        if (!canOpenNotification) return;
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        handleOpenNotification();
                      };
                      const stopRowOpenPropagation = (event: React.SyntheticEvent) => {
                        event.stopPropagation();
                      };

                      return (
                        <div
                          key={notification.recipientId}
                          className={`rounded-md border px-3 py-3 ${
                            unread
                              ? 'border-[#4a78bd] bg-[#13233c]'
                              : 'border-[#304867] bg-[#142033]'
                          } ${canOpenNotification ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b92e8]' : ''}`}
                          role={canOpenNotification ? 'button' : undefined}
                          tabIndex={canOpenNotification ? 0 : undefined}
                          onClick={canOpenNotification ? handleOpenNotification : undefined}
                          onKeyDown={canOpenNotification ? handleNotificationKeyDown : undefined}
                          aria-label={
                            canOpenNotification
                              ? `Open notification: ${getNotificationTitle(notification)}`
                              : undefined
                          }
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="size-9 rounded-xl border border-[#304867] bg-[#1b2a42]">
                              {notification.actorAvatarUrl && (
                                <AvatarImage src={notification.actorAvatarUrl} alt={actorLabel} />
                              )}
                              <AvatarFallback className="rounded-xl bg-[#1b2a42] text-white text-xs">
                                {actorInitial}
                              </AvatarFallback>
                            </Avatar>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-white">
                                  {getNotificationTitle(notification)}
                                </p>
                                {unread && (
                                  <Badge variant="default" className="bg-[#3f79d8] text-white">
                                    Unread
                                  </Badge>
                                )}
                                {!notification.seenAt && (
                                  <Badge variant="outline" className="border-[#3b5f91] text-[#b7d1ff]">
                                    New
                                  </Badge>
                                )}
                              </div>

                              <p className="mt-1 text-xs text-[#c8d7ee]">
                                {actorLabel}
                                <span className="text-[#8ea4c7]"> · {formatTimestamp(notification.createdAt)}</span>
                              </p>

                              <p className="mt-1 text-sm text-[#a9b8cf] break-words">
                                {getNotificationSummary(notification)}
                              </p>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {friendRequestId &&
                                  notification.kind === 'friend_request_received' &&
                                  onAcceptFriendRequestNotification &&
                                  onDeclineFriendRequestNotification && (
                                    <>
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={(event) => {
                                          stopRowOpenPropagation(event);
                                          onAcceptFriendRequestNotification({
                                            recipientId: notification.recipientId,
                                            friendRequestId,
                                          });
                                        }}
                                      >
                                        Accept
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={(event) => {
                                          stopRowOpenPropagation(event);
                                          onDeclineFriendRequestNotification({
                                            recipientId: notification.recipientId,
                                            friendRequestId,
                                          });
                                        }}
                                      >
                                        Decline
                                      </Button>
                                    </>
                                  )}
                                {unread && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={(event) => {
                                      stopRowOpenPropagation(event);
                                      onMarkNotificationRead(notification.recipientId);
                                    }}
                                  >
                                    Mark read
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-[#a9b8cf] hover:text-white hover:bg-[#22334f]"
                                  onClick={(event) => {
                                    stopRowOpenPropagation(event);
                                    onDismissNotification(notification.recipientId);
                                  }}
                                >
                                  Dismiss
                                </Button>
                                {!notification.deliverSound && (
                                  <Badge variant="outline" className="border-[#304867] text-[#9eb4d3]">
                                    Sound off
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="min-h-0">
              <ScrollArea className="h-full max-h-[52dvh] xl:max-h-none">
                <div className="p-4 space-y-4">
                  <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Global Notification Preferences</p>
                      <p className="text-xs text-[#9fb2cf]">
                        Server-synced notification behavior defaults for your account.
                      </p>
                    </div>

                    {preferencesLoading || !preferences ? (
                      <div className="space-y-3">
                        {Array.from({ length: 3 }, (_, index) => (
                          <div
                            key={index}
                            className="rounded-md border border-[#304867] bg-[#111a2b] p-3 space-y-2"
                          >
                            <Skeleton className="h-3 w-28 bg-[#22334f]" />
                            {Array.from({ length: 3 }, (_, rowIndex) => (
                              <div key={rowIndex} className="flex items-center justify-between gap-3">
                                <Skeleton className="h-4 w-36 bg-[#22334f]" />
                                <Skeleton className="h-5 w-8 rounded-full bg-[#22334f]" />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-md border border-[#304867] bg-[#111a2b] p-3 space-y-2">
                          <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Friend Requests</p>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">In-app notifications</span>
                            <Switch
                              checked={preferences.friendRequestInAppEnabled}
                              onCheckedChange={(checked) =>
                                updatePrefs({ friendRequestInAppEnabled: checked })
                              }
                              disabled={preferencesSaving}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">Sound notifications</span>
                            <Switch
                              checked={preferences.friendRequestSoundEnabled}
                              onCheckedChange={(checked) =>
                                updatePrefs({ friendRequestSoundEnabled: checked })
                              }
                              disabled={preferencesSaving}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">Web push notifications</span>
                            <Switch
                              checked={preferences.friendRequestPushEnabled}
                              onCheckedChange={(checked) =>
                                updatePrefs({ friendRequestPushEnabled: checked })
                              }
                              disabled={preferencesSaving}
                            />
                          </div>
                        </div>

                        <div className="rounded-md border border-[#304867] bg-[#111a2b] p-3 space-y-2">
                          <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Direct Messages</p>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">In-app notifications</span>
                            <Switch
                              checked={preferences.dmInAppEnabled}
                              onCheckedChange={(checked) => updatePrefs({ dmInAppEnabled: checked })}
                              disabled={preferencesSaving}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">Sound notifications</span>
                            <Switch
                              checked={preferences.dmSoundEnabled}
                              onCheckedChange={(checked) => updatePrefs({ dmSoundEnabled: checked })}
                              disabled={preferencesSaving}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">Web push notifications</span>
                            <Switch
                              checked={preferences.dmPushEnabled}
                              onCheckedChange={(checked) => updatePrefs({ dmPushEnabled: checked })}
                              disabled={preferencesSaving}
                            />
                          </div>
                        </div>

                        <div className="rounded-md border border-[#304867] bg-[#111a2b] p-3 space-y-2">
                          <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Mentions</p>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">In-app notifications</span>
                            <Switch
                              checked={preferences.mentionInAppEnabled}
                              onCheckedChange={(checked) =>
                                updatePrefs({ mentionInAppEnabled: checked })
                              }
                              disabled={preferencesSaving}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">Sound notifications</span>
                            <Switch
                              checked={preferences.mentionSoundEnabled}
                              onCheckedChange={(checked) =>
                                updatePrefs({ mentionSoundEnabled: checked })
                              }
                              disabled={preferencesSaving}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">Web push notifications</span>
                            <Switch
                              checked={preferences.mentionPushEnabled}
                              onCheckedChange={(checked) =>
                                updatePrefs({ mentionPushEnabled: checked })
                              }
                              disabled={preferencesSaving}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {preferencesError && <p className="text-sm text-red-300">{preferencesError}</p>}
                  </div>

                  <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Local Sound Playback</p>
                      <p className="text-xs text-[#9fb2cf]">
                        Device-local audio behavior stored locally for this device.
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2">
                        {localAudioSettings.masterSoundEnabled ? (
                          <Volume2 className="size-4 text-[#a9b8cf]" />
                        ) : (
                          <VolumeX className="size-4 text-[#a9b8cf]" />
                        )}
                        <span className="text-sm">Master notification sounds</span>
                      </div>
                      <Switch
                        checked={localAudioSettings.masterSoundEnabled}
                        onCheckedChange={(checked) =>
                          onUpdateLocalAudioSettings({
                            ...localAudioSettings,
                            masterSoundEnabled: checked,
                          })
                        }
                        disabled={localAudioSaving}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">Play sounds when app is focused</span>
                      <Switch
                        checked={localAudioSettings.playSoundsWhenFocused}
                        onCheckedChange={(checked) =>
                          onUpdateLocalAudioSettings({
                            ...localAudioSettings,
                            playSoundsWhenFocused: checked,
                          })
                        }
                        disabled={localAudioSaving}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#a9b8cf]">
                        <span>Notification sound volume</span>
                        <span>{localAudioSettings.notificationSoundVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={localAudioSettings.notificationSoundVolume}
                        onChange={(event) =>
                          onUpdateLocalAudioSettings({
                            ...localAudioSettings,
                            notificationSoundVolume: Number(event.target.value),
                          })
                        }
                        disabled={localAudioSaving}
                        className="w-full accent-[#4f8df5]"
                        aria-label="Notification sound volume"
                      />
                    </div>
                    {localAudioError && <p className="text-sm text-red-300">{localAudioError}</p>}
                  </div>

                  {webPushControls && (
                    <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">Web Push Notifications</p>
                          <p className="text-xs text-[#9fb2cf]">
                            Browser/PWA background and lock-screen notifications for this device.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={webPushControls.onRefreshStatus}
                          disabled={webPushControls.loading || webPushControls.busy}
                          className="border-[#304867] text-white"
                        >
                          <RefreshCcw
                            className={`size-4 ${
                              webPushControls.loading ? 'animate-spin' : ''
                            }`}
                          />
                          Refresh
                        </Button>
                      </div>

                      {webPushControls.status ? (
                        <div className="space-y-2 text-xs text-[#b8cae6]">
                          <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1">
                            <span className="text-[#8fa6c8]">Support</span>
                            <span>{webPushControls.status.supported ? 'Supported' : 'Unavailable'}</span>
                            <span className="text-[#8fa6c8]">Permission</span>
                            <span className="uppercase">{webPushControls.status.notificationPermission}</span>
                            <span className="text-[#8fa6c8]">Service worker</span>
                            <span>
                              {webPushControls.status.serviceWorkerReady
                                ? 'Registered'
                                : webPushControls.status.serviceWorkerRegistrationEnabled
                                  ? 'Enabled (not registered yet)'
                                  : 'Disabled'}
                            </span>
                            <span className="text-[#8fa6c8]">Push sync</span>
                            <span>{webPushControls.status.webPushSyncEnabled ? 'Enabled' : 'Disabled'}</span>
                            <span className="text-[#8fa6c8]">Device subscription</span>
                            <span>
                              {webPushControls.status.browserSubscriptionActive ? 'Active' : 'Not subscribed'}
                            </span>
                            <span className="text-[#8fa6c8]">Backend registry</span>
                            <span>
                              {webPushControls.status.backendSubscriptionCount === null
                                ? 'Unknown'
                                : webPushControls.status.backendSubscriptionCount > 0
                                  ? 'Registered'
                                  : 'Not registered'}
                            </span>
                            {typeof webPushControls.status.installationId !== 'undefined' && (
                              <>
                                <span className="text-[#8fa6c8]">Installation</span>
                                <span className="font-mono text-[11px] break-all">
                                  {webPushControls.status.installationId ?? 'Unknown'}
                                </span>
                              </>
                            )}
                            <span className="text-[#8fa6c8]">VAPID key</span>
                            <span>
                              {webPushControls.status.vapidPublicKeyConfigured
                                ? 'Configured'
                                : 'Missing'}
                            </span>
                          </div>

                          {!webPushControls.status.secureContext && (
                            <p className="text-amber-300">
                              HTTPS (or localhost) is required for service workers and push.
                            </p>
                          )}
                          {!webPushControls.status.supportsNotifications && (
                            <p className="text-amber-300">
                              This browser does not support the Notification API.
                            </p>
                          )}
                          {!webPushControls.status.supportsPushManager && (
                            <p className="text-amber-300">
                              This browser does not support PushManager (web push).
                            </p>
                          )}
                          {!webPushControls.status.vapidPublicKeyConfigured && (
                            <p className="text-amber-300">
                              Missing `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`; subscription sync cannot complete yet.
                            </p>
                          )}
                        </div>
                      ) : webPushControls.loading ? (
                        <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-2">
                          <Skeleton className="h-4 w-40 bg-[#22334f]" />
                          <Skeleton className="h-3 w-full bg-[#1b2a42]" />
                          <Skeleton className="h-3 w-4/5 bg-[#1b2a42]" />
                        </div>
                      ) : (
                        <p className="text-sm text-[#a9b8cf]">Web push status not loaded yet.</p>
                      )}

                      <Button
                        type="button"
                        size="sm"
                        onClick={webPushControls.onToggleOnThisDevice}
                        disabled={
                          webPushControls.busy ||
                          webPushControls.loading ||
                          (webPushControls.status ? !webPushControls.status.supported : true)
                        }
                      >
                        {webPushEnabled ? 'Disable Push Notifications' : 'Enable Push Notifications'}
                      </Button>

                      {webPushControls.error && (
                        <p className="text-sm text-red-300">{webPushControls.error}</p>
                      )}

                      {webPushControls.testTools && (
                        <div className="rounded-md border border-dashed border-[#345173] bg-[#101a2a] p-3 space-y-3">
                          <div>
                            <p className="text-sm font-semibold text-white">Push Test Tools</p>
                            <p className="text-xs text-[#9fb2cf]">
                              Developer testing helpers for service worker notifications and manual worker runs.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={webPushControls.testTools.onShowServiceWorkerTestNotification}
                              disabled={webPushControls.testTools.busy || webPushControls.busy}
                            >
                              Show SW Test Notification
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={webPushControls.testTools.onSimulateNotificationClick}
                              disabled={webPushControls.testTools.busy || webPushControls.busy}
                            >
                              Simulate SW Click
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-[#304867] text-white"
                              onClick={webPushControls.testTools.onRunWorkerOnce}
                              disabled={webPushControls.testTools.busy || webPushControls.busy}
                            >
                              Run Worker Once
                            </Button>
                            {webPushControls.testTools.onRunWorkerShadowOnce && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-[#304867] text-white"
                                onClick={webPushControls.testTools.onRunWorkerShadowOnce}
                                disabled={webPushControls.testTools.busy || webPushControls.busy}
                              >
                                Run Worker Shadow
                              </Button>
                            )}
                            {webPushControls.testTools.onRunWorkerWakeupOnce && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-[#304867] text-white"
                                onClick={webPushControls.testTools.onRunWorkerWakeupOnce}
                                disabled={webPushControls.testTools.busy || webPushControls.busy}
                              >
                                Run Worker Wakeup
                              </Button>
                            )}
                          </div>

                          <p className="text-xs text-[#8fa6c8]">
                            Simulated click targets the Friends tab deep-link (`friend_request_accepted`) by default.
                          </p>

                          {webPushControls.testTools.lastResult && (
                            <pre className="max-h-40 overflow-auto rounded border border-[#304867] bg-[#0b1320] p-2 text-xs text-[#c6d3ea] whitespace-pre-wrap">
                              {webPushControls.testTools.lastResult}
                            </pre>
                          )}
                          {webPushControls.testTools.error && (
                            <p className="text-sm text-red-300">{webPushControls.testTools.error}</p>
                          )}

                          {webPushControls.testTools.diagnostics && (
                            <div className="rounded-md border border-[#304867] bg-[#0d1624] p-3 space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-white">
                                    Delivery Diagnostics
                                  </p>
                                  <p className="text-xs text-[#9fb2cf]">
                                    Route policy, simulator controls, and recent delivery traces.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-[#304867] text-white"
                                  onClick={webPushControls.testTools.diagnostics.onRefresh}
                                  disabled={
                                    webPushControls.testTools.busy ||
                                    webPushControls.busy ||
                                    webPushControls.testTools.diagnostics.loading
                                  }
                                >
                                  <RefreshCcw
                                    className={`size-4 ${
                                      webPushControls.testTools.diagnostics.loading ? 'animate-spin' : ''
                                    }`}
                                  />
                                  Refresh
                                </Button>
                              </div>

                              <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1 text-xs text-[#c5d4ec]">
                                <span className="text-[#8fa6c8]">Mode</span>
                                <span className="uppercase">{webPushControls.testTools.diagnostics.devMode}</span>
                                <span className="text-[#8fa6c8]">Route</span>
                                <span>{webPushControls.testTools.diagnostics.routeMode}</span>
                                <span className="text-[#8fa6c8]">Reasons</span>
                                <span className="break-words">
                                  {webPushControls.testTools.diagnostics.routeReasons.join(', ') || 'None'}
                                </span>
                              </div>

                              <div className="rounded border border-[#304867] bg-[#0b1320] p-2 space-y-2">
                                <p className="text-xs font-semibold text-[#b8cae6]">
                                  Queue Health Alerts (cutover guardrails)
                                </p>
                                {webPushControls.testTools.diagnostics.queueHealthState ? (
                                  <>
                                    <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1 text-xs text-[#c5d4ec]">
                                      <span className="text-[#8fa6c8]">Backlog</span>
                                      <span>
                                        claimable {webPushControls.testTools.diagnostics.queueHealthState.claimableNowCount}
                                        {' | '}
                                        pending {webPushControls.testTools.diagnostics.queueHealthState.totalPending}
                                        {' | '}
                                        retryable {webPushControls.testTools.diagnostics.queueHealthState.totalRetryableFailed}
                                        {' | '}
                                        processing {webPushControls.testTools.diagnostics.queueHealthState.totalProcessing}
                                      </span>
                                      <span className="text-[#8fa6c8]">Ages</span>
                                      <span>
                                        oldest claimable {formatAgeSeconds(webPushControls.testTools.diagnostics.queueHealthState.oldestClaimableAgeSeconds)}
                                        {' | '}
                                        retryable {formatAgeSeconds(webPushControls.testTools.diagnostics.queueHealthState.oldestRetryableFailedAgeSeconds)}
                                        {' | '}
                                        processing {formatAgeSeconds(webPushControls.testTools.diagnostics.queueHealthState.oldestProcessingAgeSeconds)}
                                      </span>
                                      <span className="text-[#8fa6c8]">Stale leases</span>
                                      <span>
                                        expired {webPushControls.testTools.diagnostics.queueHealthState.processingLeaseExpiredCount}
                                        {' | '}
                                        oldest overdue {formatAgeSeconds(webPushControls.testTools.diagnostics.queueHealthState.oldestProcessingLeaseOverdueSeconds)}
                                      </span>
                                      <span className="text-[#8fa6c8]">Retries</span>
                                      <span>
                                        due now {webPushControls.testTools.diagnostics.queueHealthState.retryableDueNowCount}
                                        {' | '}
                                        high-attempt {webPushControls.testTools.diagnostics.queueHealthState.highRetryAttemptCount}
                                        {' | '}
                                        max attempts {webPushControls.testTools.diagnostics.queueHealthState.maxAttemptsActive ?? 'n/a'}
                                      </span>
                                      <span className="text-[#8fa6c8]">Recent outcomes</span>
                                      <span>
                                        done/10m {webPushControls.testTools.diagnostics.queueHealthState.doneLast10mCount}
                                        {' | '}
                                        retryable/10m {webPushControls.testTools.diagnostics.queueHealthState.retryableFailedLast10mCount}
                                        {' | '}
                                        dead-letter/60m {webPushControls.testTools.diagnostics.queueHealthState.deadLetterLast60mCount}
                                      </span>
                                    </div>
                                    <div className="rounded border border-[#304867] bg-[#09101c] p-2">
                                      <p className="text-xs font-semibold text-[#b8cae6] mb-1">
                                        Alert Status
                                      </p>
                                      {webPushControls.testTools.diagnostics.queueHealthAlerts.length > 0 ? (
                                        <div className="space-y-1">
                                          {webPushControls.testTools.diagnostics.queueHealthAlerts.map((alert) => (
                                            <div
                                              key={`${alert.level}:${alert.code}`}
                                              className={`text-xs ${
                                                alert.level === 'critical'
                                                  ? 'text-red-300'
                                                  : 'text-amber-300'
                                              }`}
                                            >
                                              <span className="uppercase font-semibold">{alert.level}</span>
                                              {' '}
                                              {alert.code}
                                              {': '}
                                              {alert.message}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-emerald-300">
                                          No queue health alerts triggered. This looks safe for shadow validation and
                                          cutover rehearsals.
                                        </p>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <p className="text-xs text-[#8fa6c8]">
                                    Queue health diagnostics unavailable for this session.
                                  </p>
                                )}
                              </div>

                              <div className="rounded border border-[#304867] bg-[#0b1320] p-2 space-y-2">
                                <p className="text-xs font-semibold text-[#b8cae6]">
                                  Immediate Wakeup Scheduler
                                </p>
                                {webPushControls.testTools.diagnostics.wakeupState ? (
                                  <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1 text-xs text-[#c5d4ec]">
                                    <span className="text-[#8fa6c8]">Enabled</span>
                                    <span>{webPushControls.testTools.diagnostics.wakeupState.enabled ? 'Yes' : 'No'}</span>
                                    <span className="text-[#8fa6c8]">Mode</span>
                                    <span>
                                      {webPushControls.testTools.diagnostics.wakeupState.shadowMode ? 'Shadow' : 'Wakeup'}
                                      {' • '}
                                      min {webPushControls.testTools.diagnostics.wakeupState.minIntervalSeconds}s
                                    </span>
                                    <span className="text-[#8fa6c8]">Last</span>
                                    <span className="break-words">
                                      {webPushControls.testTools.diagnostics.wakeupState.lastMode ?? 'Unknown'}
                                      {webPushControls.testTools.diagnostics.wakeupState.lastReason
                                        ? ` / ${webPushControls.testTools.diagnostics.wakeupState.lastReason}`
                                        : ''}
                                      {webPushControls.testTools.diagnostics.wakeupState.lastSkipReason
                                        ? ` (${webPushControls.testTools.diagnostics.wakeupState.lastSkipReason})`
                                        : ''}
                                    </span>
                                    <span className="text-[#8fa6c8]">Totals</span>
                                    <span>
                                      attempts {webPushControls.testTools.diagnostics.wakeupState.totalAttempts}
                                      {' • '}
                                      scheduled {webPushControls.testTools.diagnostics.wakeupState.totalScheduled}
                                      {' • '}
                                      debounced {webPushControls.testTools.diagnostics.wakeupState.totalDebounced}
                                    </span>
                                  </div>
                                ) : (
                                  <p className="text-xs text-[#8fa6c8]">
                                    Wakeup diagnostics unavailable for this session.
                                  </p>
                                )}
                                {webPushControls.testTools.diagnostics.onSetWakeupConfig && (
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() =>
                                        webPushControls.testTools!.diagnostics!.onSetWakeupConfig?.({
                                          enabled: true,
                                          shadowMode: true,
                                          minIntervalSeconds: 2,
                                        })
                                      }
                                      disabled={webPushControls.testTools.busy || webPushControls.busy}
                                    >
                                      Shadow (2s)
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() =>
                                        webPushControls.testTools!.diagnostics!.onSetWakeupConfig?.({
                                          enabled: true,
                                          shadowMode: false,
                                          minIntervalSeconds: 2,
                                        })
                                      }
                                      disabled={webPushControls.testTools.busy || webPushControls.busy}
                                    >
                                      Cutover Wakeup (2s)
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="border-[#304867] text-white"
                                      onClick={() =>
                                        webPushControls.testTools!.diagnostics!.onSetWakeupConfig?.({
                                          enabled: false,
                                        })
                                      }
                                      disabled={webPushControls.testTools.busy || webPushControls.busy}
                                    >
                                      Disable Wakeups
                                    </Button>
                                  </div>
                                )}
                              </div>

                              <div className="rounded border border-[#304867] bg-[#0b1320] p-2 space-y-2">
                                <p className="text-xs font-semibold text-[#b8cae6]">
                                  Cutover Rehearsal Readiness
                                </p>
                                <div
                                  className={`rounded border p-2 text-xs ${
                                    webPushControls.testTools.diagnostics.cutoverReadiness.status === 'blocked'
                                      ? 'border-red-700/60 bg-red-950/30 text-red-200'
                                      : webPushControls.testTools.diagnostics.cutoverReadiness.status === 'caution'
                                        ? 'border-amber-700/60 bg-amber-950/20 text-amber-100'
                                        : webPushControls.testTools.diagnostics.cutoverReadiness.status === 'active'
                                          ? 'border-sky-700/60 bg-sky-950/20 text-sky-100'
                                          : 'border-emerald-700/60 bg-emerald-950/20 text-emerald-100'
                                  }`}
                                >
                                  <p className="font-semibold uppercase">
                                    {webPushControls.testTools.diagnostics.cutoverReadiness.status}
                                  </p>
                                  <p className="mt-1">
                                    {webPushControls.testTools.diagnostics.cutoverReadiness.summary}
                                  </p>
                                  {webPushControls.testTools.diagnostics.cutoverReadiness.details.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      {webPushControls.testTools.diagnostics.cutoverReadiness.details
                                        .slice(0, 4)
                                        .map((detail) => (
                                          <div key={detail} className="break-words">
                                            - {detail}
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                                {webPushControls.testTools.diagnostics.onSetWakeupConfig && (
                                  <div className="flex flex-wrap gap-2">
                                    {webPushControls.testTools.diagnostics.cutoverReadiness.recommendedAction ===
                                      'enable_shadow_wakeups' && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() =>
                                          webPushControls.testTools!.diagnostics!.onSetWakeupConfig?.({
                                            enabled: true,
                                            shadowMode: true,
                                            minIntervalSeconds:
                                              webPushControls.testTools!.diagnostics!.wakeupState
                                                ?.minIntervalSeconds ?? 2,
                                          })
                                        }
                                        disabled={webPushControls.testTools.busy || webPushControls.busy}
                                      >
                                        Enable Shadow Wakeups
                                      </Button>
                                    )}
                                    {webPushControls.testTools.diagnostics.cutoverReadiness.recommendedAction ===
                                      'start_cutover_rehearsal' && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() =>
                                          webPushControls.testTools!.diagnostics!.onSetWakeupConfig?.({
                                            enabled: true,
                                            shadowMode: false,
                                            minIntervalSeconds:
                                              webPushControls.testTools!.diagnostics!.wakeupState
                                                ?.minIntervalSeconds ?? 2,
                                          })
                                        }
                                        disabled={webPushControls.testTools.busy || webPushControls.busy}
                                      >
                                        Start Cutover Rehearsal
                                      </Button>
                                    )}
                                    {webPushControls.testTools.diagnostics.cutoverReadiness.recommendedAction ===
                                      'rollback_to_shadow' && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="border-[#d97706] text-amber-100"
                                        onClick={() =>
                                          webPushControls.testTools!.diagnostics!.onSetWakeupConfig?.({
                                            enabled: true,
                                            shadowMode: true,
                                            minIntervalSeconds:
                                              webPushControls.testTools!.diagnostics!.wakeupState
                                                ?.minIntervalSeconds ?? 2,
                                          })
                                        }
                                        disabled={webPushControls.testTools.busy || webPushControls.busy}
                                      >
                                        Roll Back to Shadow
                                      </Button>
                                    )}
                                  </div>
                                )}
                                <p className="text-xs text-[#8fa6c8]">
                                  Cron remains a backstop during wakeup cutover rehearsals. Use queue health alerts and
                                  parity drift before promoting wakeup sends.
                                </p>
                              </div>

                              <div className="rounded border border-[#304867] bg-[#0b1320] p-2 space-y-1">
                                <p className="text-xs font-semibold text-[#b8cae6]">
                                  Backend Trace Wake Sources (recent)
                                </p>
                                <p className="text-xs text-[#c5d4ec] break-words">
                                  {Object.keys(webPushControls.testTools.diagnostics.backendWakeSourceCounts).length > 0
                                    ? Object.entries(webPushControls.testTools.diagnostics.backendWakeSourceCounts)
                                        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                                        .map(([source, count]) => `${source}: ${count}`)
                                        .join(' • ')
                                    : 'No backend trace wakeSource data yet.'}
                                </p>
                              </div>

                              <div className="rounded border border-[#304867] bg-[#0b1320] p-2 space-y-2">
                                <p className="text-xs font-semibold text-[#b8cae6]">
                                  Shadow vs Cron Parity (recent backend traces)
                                </p>
                                <div className="grid gap-1 text-xs text-[#c5d4ec]">
                                  {(['shadow', 'cron', 'wakeup', 'manual'] as const).map((source) => {
                                    const summary =
                                      webPushControls.testTools!.diagnostics!.backendParitySummary.bySource[source] ??
                                      { total: 0, send: 0, skip: 0, defer: 0 };
                                    return (
                                      <div key={source} className="break-words">
                                        <span className="uppercase text-[#8fa6c8]">{source}</span>
                                        {' '}
                                        total {summary.total}
                                        {' • '}
                                        send {summary.send}
                                        {' • '}
                                        skip {summary.skip}
                                        {' • '}
                                        defer {summary.defer}
                                      </div>
                                    );
                                  })}
                                </div>
                                <pre className="max-h-32 overflow-auto rounded border border-[#304867] bg-[#09101c] p-2 text-[11px] text-[#c6d3ea] whitespace-pre-wrap">
                                  {webPushControls.testTools.diagnostics.backendParitySummary.topReasonComparisons.length > 0
                                    ? webPushControls.testTools.diagnostics.backendParitySummary.topReasonComparisons
                                        .map(
                                          (row) =>
                                            `${row.reasonCode} | shadow:${row.shadow} cron:${row.cron} wakeup:${row.wakeup} manual:${row.manual}`
                                        )
                                        .join('\n')
                                    : 'No shadow/cron parity rows yet. Run Worker Shadow and wait for cron/manual traces.'}
                                </pre>
                                <div className="rounded border border-[#304867] bg-[#09101c] p-2">
                                  <p className="text-xs font-semibold text-[#b8cae6] mb-1">
                                    Drift Indicators
                                  </p>
                                  <pre className="max-h-24 overflow-auto text-[11px] text-[#c6d3ea] whitespace-pre-wrap">
                                    {webPushControls.testTools.diagnostics.backendParityDrift.length > 0
                                      ? webPushControls.testTools.diagnostics.backendParityDrift
                                          .map(
                                            (row) =>
                                              `${row.reasonCode} | shadow-cron:${row.shadowMinusCron} shadow-wakeup:${row.shadowMinusWakeup}`
                                          )
                                          .join('\n')
                                      : 'No shadow-vs-cron/wakeup drift detected in recent traces.'}
                                  </pre>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={webPushControls.testTools.diagnostics.devMode === 'real' ? 'default' : 'secondary'}
                                  onClick={() => webPushControls.testTools!.diagnostics!.onSetDevMode('real')}
                                  disabled={webPushControls.testTools.busy || webPushControls.busy}
                                >
                                  Real
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={webPushControls.testTools.diagnostics.devMode === 'simulated_push' ? 'default' : 'secondary'}
                                  onClick={() => webPushControls.testTools!.diagnostics!.onSetDevMode('simulated_push')}
                                  disabled={webPushControls.testTools.busy || webPushControls.busy}
                                >
                                  Simulated Push
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={webPushControls.testTools.diagnostics.devMode === 'hybrid' ? 'default' : 'secondary'}
                                  onClick={() => webPushControls.testTools!.diagnostics!.onSetDevMode('hybrid')}
                                  disabled={webPushControls.testTools.busy || webPushControls.busy}
                                >
                                  Hybrid
                                </Button>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={webPushControls.testTools.diagnostics.onSimulateFocused}
                                  disabled={webPushControls.testTools.busy || webPushControls.busy}
                                >
                                  Simulate Focused
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={webPushControls.testTools.diagnostics.onSimulateBackground}
                                  disabled={webPushControls.testTools.busy || webPushControls.busy}
                                >
                                  Simulate Background
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-[#304867] text-white"
                                  onClick={webPushControls.testTools.diagnostics.onClearSimulation}
                                  disabled={webPushControls.testTools.busy || webPushControls.busy}
                                >
                                  Clear Simulation
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-[#304867] text-white"
                                  onClick={webPushControls.testTools.diagnostics.onRecordSimulationTrace}
                                  disabled={webPushControls.testTools.busy || webPushControls.busy}
                                >
                                  Record Route Trace
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-[#304867] text-white"
                                  onClick={webPushControls.testTools.diagnostics.onClearLocalTraces}
                                  disabled={webPushControls.testTools.busy || webPushControls.busy}
                                >
                                  Clear Local Traces
                                </Button>
                              </div>

                              {webPushControls.testTools.diagnostics.error && (
                                <p className="text-sm text-red-300">
                                  {webPushControls.testTools.diagnostics.error}
                                </p>
                              )}

                              <div className="grid gap-3 lg:grid-cols-2">
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-[#b8cae6]">
                                    Local Traces
                                  </p>
                                  <pre className="max-h-48 overflow-auto rounded border border-[#304867] bg-[#0b1320] p-2 text-[11px] text-[#c6d3ea] whitespace-pre-wrap">
                                    {webPushControls.testTools.diagnostics.localTraces.length > 0
                                      ? webPushControls.testTools.diagnostics.localTraces
                                          .slice(0, 12)
                                          .map((trace) =>
                                            `${trace.createdAt} | ${trace.transport}/${trace.stage} | ${trace.decision} | ${trace.reasonCode}`
                                          )
                                          .join('\n')
                                      : 'No local traces yet.'}
                                  </pre>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-[#b8cae6]">
                                    Backend Traces
                                  </p>
                                  <pre className="max-h-48 overflow-auto rounded border border-[#304867] bg-[#0b1320] p-2 text-[11px] text-[#c6d3ea] whitespace-pre-wrap">
                                    {webPushControls.testTools.diagnostics.backendTraces.length > 0
                                      ? webPushControls.testTools.diagnostics.backendTraces
                                          .slice(0, 12)
                                          .map((trace) =>
                                            `${trace.createdAt} | ${trace.transport}/${trace.stage} | ${trace.decision} | ${trace.reasonCode}`
                                          )
                                          .join('\n')
                                      : 'No backend traces yet.'}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
