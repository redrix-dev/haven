import { describe, expect, it } from 'vitest';
import { resolveNotificationRoutePolicy } from '@/lib/notifications/routePolicy';

const baseAudio = {
  masterSoundEnabled: true,
  playSoundsWhenFocused: true,
} as const;

describe('resolveNotificationRoutePolicy', () => {
  it('routes focused clients to in-app and suppresses OS push display', () => {
    const result = resolveNotificationRoutePolicy({
      hasFocus: true,
      pushSupported: true,
      pushPermission: 'granted',
      swRegistered: true,
      pushSubscriptionActive: true,
      pushSyncEnabled: true,
      serviceWorkerRegistrationEnabled: true,
      audioSettings: baseAudio,
    });

    expect(result.routeMode).toBe('foreground_in_app');
    expect(result.allowOsPushDisplay).toBe(false);
    expect(result.allowInAppSound).toBe(true);
    expect(result.reasonCodes).toContain('sw_focused_window_suppressed');
  });

  it('routes background clients with active push to OS push and suppresses in-app sound', () => {
    const result = resolveNotificationRoutePolicy({
      hasFocus: false,
      pushSupported: true,
      pushPermission: 'granted',
      swRegistered: true,
      pushSubscriptionActive: true,
      pushSyncEnabled: true,
      serviceWorkerRegistrationEnabled: true,
      audioSettings: baseAudio,
    });

    expect(result.routeMode).toBe('background_os_push');
    expect(result.allowOsPushDisplay).toBe(true);
    expect(result.allowInAppSound).toBe(false);
    expect(result.reasonCodes).toContain('in_app_suppressed_due_to_push_active_background');
  });

  it('falls back to in-app when push is unavailable', () => {
    const result = resolveNotificationRoutePolicy({
      hasFocus: false,
      pushSupported: true,
      pushPermission: 'default',
      swRegistered: false,
      pushSubscriptionActive: false,
      pushSyncEnabled: false,
      serviceWorkerRegistrationEnabled: false,
      audioSettings: baseAudio,
    });

    expect(result.routeMode).toBe('fallback_in_app');
    expect(result.allowOsPushDisplay).toBe(false);
    expect(result.allowInAppSound).toBe(true);
    expect(result.reasonCodes).toContain('no_active_push_subscription');
  });

  it('respects local audio prefs when focused', () => {
    const result = resolveNotificationRoutePolicy({
      hasFocus: true,
      pushSupported: false,
      pushPermission: 'unsupported',
      swRegistered: false,
      pushSubscriptionActive: false,
      audioSettings: {
        masterSoundEnabled: true,
        playSoundsWhenFocused: false,
      },
    });

    expect(result.allowInAppSound).toBe(false);
    expect(result.reasonCodes).toContain('sound_pref_disabled');
  });
});

