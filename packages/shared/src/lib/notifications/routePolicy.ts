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

