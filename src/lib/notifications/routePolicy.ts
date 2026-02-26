import type { NotificationAudioSettings } from '@/shared/desktop/types';

export type NotificationRouteMode =
  | 'foreground_in_app'
  | 'background_os_push'
  | 'fallback_in_app'
  | 'unsupported_push';

export type NotificationRouteDecision = 'send' | 'skip' | 'defer';

export type NotificationDeliveryTransport = 'in_app' | 'web_push' | 'simulated_push' | 'route_policy';

export type NotificationDecisionStage = 'enqueue' | 'claim' | 'send_time' | 'client_route';

export type NotificationDeliveryReasonCode =
  | 'sent'
  | 'push_pref_disabled'
  | 'in_app_pref_disabled'
  | 'sound_pref_disabled'
  | 'dm_conversation_muted'
  | 'recipient_dismissed'
  | 'recipient_read'
  | 'no_active_push_subscription'
  | 'sw_focused_window_suppressed'
  | 'in_app_suppressed_due_to_push_active_background'
  | 'provider_retryable_failure'
  | 'provider_terminal_failure'
  | 'browser_push_unsupported'
  | 'notification_permission_not_granted'
  | 'service_worker_not_ready'
  | 'push_sync_disabled'
  | 'push_subscription_inactive'
  | 'app_focused'
  | 'app_backgrounded';

export type NotificationRoutePolicyInput = {
  hasFocus: boolean;
  pushSupported: boolean;
  pushPermission: NotificationPermission | 'unsupported';
  swRegistered: boolean;
  pushSubscriptionActive: boolean;
  pushSyncEnabled?: boolean;
  serviceWorkerRegistrationEnabled?: boolean;
  audioSettings: Pick<
    NotificationAudioSettings,
    'masterSoundEnabled' | 'playSoundsWhenFocused'
  >;
  developerOverrides?: {
    forceHasFocus?: boolean;
    forcePushSupported?: boolean;
    forcePushPermission?: NotificationPermission | 'unsupported';
    forceSwRegistered?: boolean;
    forcePushSubscriptionActive?: boolean;
    forcePushSyncEnabled?: boolean;
    forceServiceWorkerRegistrationEnabled?: boolean;
  };
};

export type NotificationRoutePolicyDecision = {
  routeMode: NotificationRouteMode;
  allowInAppVisual: boolean;
  allowInAppSound: boolean;
  allowOsPushDisplay: boolean;
  reasonCodes: NotificationDeliveryReasonCode[];
};

const hasGrantedPushPermission = (value: NotificationPermission | 'unsupported'): boolean =>
  value === 'granted';

export const resolveNotificationRoutePolicy = (
  input: NotificationRoutePolicyInput
): NotificationRoutePolicyDecision => {
  const overrides = input.developerOverrides;
  const hasFocus = overrides?.forceHasFocus ?? input.hasFocus;
  const pushSupported = overrides?.forcePushSupported ?? input.pushSupported;
  const pushPermission = overrides?.forcePushPermission ?? input.pushPermission;
  const swRegistered = overrides?.forceSwRegistered ?? input.swRegistered;
  const pushSubscriptionActive =
    overrides?.forcePushSubscriptionActive ?? input.pushSubscriptionActive;
  const pushSyncEnabled = overrides?.forcePushSyncEnabled ?? (input.pushSyncEnabled ?? true);
  const serviceWorkerRegistrationEnabled =
    overrides?.forceServiceWorkerRegistrationEnabled ??
    (input.serviceWorkerRegistrationEnabled ?? true);

  const reasonCodes: NotificationDeliveryReasonCode[] = [];

  const pushCapable =
    pushSupported &&
    hasGrantedPushPermission(pushPermission) &&
    swRegistered &&
    pushSyncEnabled &&
    serviceWorkerRegistrationEnabled &&
    pushSubscriptionActive;

  if (!pushSupported) {
    reasonCodes.push('browser_push_unsupported');
  } else {
    if (!hasGrantedPushPermission(pushPermission)) {
      reasonCodes.push('notification_permission_not_granted');
    }
    if (!serviceWorkerRegistrationEnabled) {
      reasonCodes.push('service_worker_not_ready');
    } else if (!swRegistered) {
      reasonCodes.push('service_worker_not_ready');
    }
    if (!pushSyncEnabled) {
      reasonCodes.push('push_sync_disabled');
    }
    if (!pushSubscriptionActive) {
      reasonCodes.push('push_subscription_inactive');
    }
  }

  let routeMode: NotificationRouteMode;
  let allowOsPushDisplay = false;
  let allowInAppVisual = true;
  let allowInAppSound = true;

  if (hasFocus) {
    reasonCodes.push('app_focused');
    if (pushCapable) {
      reasonCodes.push('sw_focused_window_suppressed');
    }
    routeMode = pushCapable ? 'foreground_in_app' : pushSupported ? 'fallback_in_app' : 'unsupported_push';
    allowOsPushDisplay = false;
  } else if (pushCapable) {
    reasonCodes.push('app_backgrounded', 'in_app_suppressed_due_to_push_active_background');
    routeMode = 'background_os_push';
    allowOsPushDisplay = true;
    allowInAppSound = false;
  } else {
    reasonCodes.push('app_backgrounded', 'no_active_push_subscription');
    routeMode = pushSupported ? 'fallback_in_app' : 'unsupported_push';
    allowOsPushDisplay = false;
  }

  if (!input.audioSettings.masterSoundEnabled) {
    allowInAppSound = false;
    reasonCodes.push('sound_pref_disabled');
  } else if (hasFocus && input.audioSettings.playSoundsWhenFocused === false) {
    allowInAppSound = false;
    reasonCodes.push('sound_pref_disabled');
  }

  return {
    routeMode,
    allowInAppVisual,
    allowInAppSound,
    allowOsPushDisplay,
    reasonCodes: Array.from(new Set(reasonCodes)),
  };
};

