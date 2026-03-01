import React, { useState, useEffect } from 'react';
import { X, Bell, BellOff, Smartphone, Volume2, VolumeX, Loader2 } from 'lucide-react';
import type { NotificationPreferences, NotificationPreferenceUpdate } from '@/lib/backend/types';
import type { HavenWebPushClientStatus } from '@/web/pwa/webPushClient';

interface MobileNotificationSettingsSheetProps {
  open: boolean;
  onClose: () => void;
  notificationPreferences: NotificationPreferences | null;
  notificationPreferencesLoading: boolean;
  notificationPreferencesSaving: boolean;
  onSavePreferences: (update: NotificationPreferenceUpdate) => Promise<void>;
  webPushStatus: HavenWebPushClientStatus | null;
  webPushStatusLoading: boolean;
  webPushActionBusy: boolean;
  onEnablePush: () => Promise<void>;
  onDisablePush: () => Promise<void>;
}

type ToggleRowProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
};

function ToggleRow({ label, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-3.5 border-b border-white/5 last:border-b-0">
      <div className="min-w-0">
        <p className={`text-sm ${disabled ? 'text-gray-600' : 'text-gray-200'}`}>{label}</p>
        {description && (
          <p className={`text-xs mt-0.5 ${disabled ? 'text-gray-700' : 'text-gray-500'}`}>{description}</p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${
          disabled ? 'opacity-40 cursor-default' : 'cursor-pointer'
        } ${checked ? 'bg-blue-500' : 'bg-white/10'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function MobileNotificationSettingsSheet({
  open,
  onClose,
  notificationPreferences,
  notificationPreferencesLoading,
  notificationPreferencesSaving,
  onSavePreferences,
  webPushStatus,
  webPushStatusLoading,
  webPushActionBusy,
  onEnablePush,
  onDisablePush,
}: MobileNotificationSettingsSheetProps) {
  // Local draft state so changes are batched into one save
  const [draft, setDraft] = useState<NotificationPreferenceUpdate | null>(null);

  useEffect(() => {
    if (notificationPreferences) {
      setDraft({
        friendRequestInAppEnabled: notificationPreferences.friendRequestInAppEnabled,
        friendRequestSoundEnabled: notificationPreferences.friendRequestSoundEnabled,
        friendRequestPushEnabled: notificationPreferences.friendRequestPushEnabled,
        dmInAppEnabled: notificationPreferences.dmInAppEnabled,
        dmSoundEnabled: notificationPreferences.dmSoundEnabled,
        dmPushEnabled: notificationPreferences.dmPushEnabled,
        mentionInAppEnabled: notificationPreferences.mentionInAppEnabled,
        mentionSoundEnabled: notificationPreferences.mentionSoundEnabled,
        mentionPushEnabled: notificationPreferences.mentionPushEnabled,
      });
    }
  }, [notificationPreferences]);

  if (!open) return null;

  const set = <K extends keyof NotificationPreferenceUpdate>(key: K, value: boolean) => {
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const handleSave = async () => {
    if (!draft) return;
    await onSavePreferences(draft);
    onClose();
  };

  const pushEnabled = webPushStatus?.subscribed === true;
  const pushBlocked = webPushStatus?.permissionState === 'denied';
  const pushUnavailable = webPushStatus === null && !webPushStatusLoading;

  const pushLabel = (() => {
    if (webPushStatusLoading || webPushActionBusy) return 'Checking…';
    if (pushBlocked) return 'Blocked by browser';
    if (pushEnabled) return 'Disable push notifications';
    return 'Enable push notifications';
  })();

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 touch-none overscroll-none" onClick={onClose} />

      {/* Sheet */}
      <div className="mobile-bottom-sheet fixed inset-x-0 z-50 rounded-t-2xl bg-[#0d1525] border-t border-white/10 flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <h2 className="text-base font-semibold text-white">Notification Settings</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
          {/* Push notifications CTA */}
          {!pushUnavailable && (
            <div className="mt-4 mb-2">
              <div className="flex items-center gap-2 mb-3">
                <Smartphone className="w-3.5 h-3.5 text-gray-500" />
                <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Push Notifications</p>
              </div>

              {pushBlocked ? (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
                  <p className="text-sm text-red-300 font-medium">Notifications blocked</p>
                  <p className="text-xs text-red-400/70 mt-0.5">
                    Open your browser settings to allow notifications for this site.
                  </p>
                </div>
              ) : (
                <button
                  onClick={pushEnabled ? onDisablePush : onEnablePush}
                  disabled={webPushStatusLoading || webPushActionBusy}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                    pushEnabled
                      ? 'bg-white/5 border-white/10 hover:bg-white/8'
                      : 'bg-blue-600/20 border-blue-500/30 hover:bg-blue-600/30'
                  } ${webPushStatusLoading || webPushActionBusy ? 'opacity-60 cursor-default' : ''}`}
                >
                  {webPushStatusLoading || webPushActionBusy ? (
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                  ) : pushEnabled ? (
                    <BellOff className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <Bell className="w-4 h-4 text-blue-400 shrink-0" />
                  )}
                  <span className={`text-sm font-medium ${pushEnabled ? 'text-gray-300' : 'text-blue-300'}`}>
                    {pushLabel}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Preference toggles */}
          {notificationPreferencesLoading && !draft ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            </div>
          ) : draft ? (
            <>
              {/* Direct Messages */}
              <div className="mt-5 mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <Bell className="w-3.5 h-3.5 text-gray-500" />
                  <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Direct Messages</p>
                </div>
                <div className="rounded-xl bg-white/3 border border-white/5 px-4">
                  <ToggleRow
                    label="In-app notifications"
                    checked={draft.dmInAppEnabled}
                    onChange={(v) => set('dmInAppEnabled', v)}
                  />
                  <ToggleRow
                    label="Sound"
                    checked={draft.dmSoundEnabled}
                    onChange={(v) => set('dmSoundEnabled', v)}
                  />
                  <ToggleRow
                    label="Push"
                    checked={draft.dmPushEnabled}
                    onChange={(v) => set('dmPushEnabled', v)}
                    disabled={!pushEnabled}
                  />
                </div>
              </div>

              {/* Mentions */}
              <div className="mt-5 mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <Bell className="w-3.5 h-3.5 text-gray-500" />
                  <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Mentions</p>
                </div>
                <div className="rounded-xl bg-white/3 border border-white/5 px-4">
                  <ToggleRow
                    label="In-app notifications"
                    checked={draft.mentionInAppEnabled}
                    onChange={(v) => set('mentionInAppEnabled', v)}
                  />
                  <ToggleRow
                    label="Sound"
                    checked={draft.mentionSoundEnabled}
                    onChange={(v) => set('mentionSoundEnabled', v)}
                  />
                  <ToggleRow
                    label="Push"
                    checked={draft.mentionPushEnabled}
                    onChange={(v) => set('mentionPushEnabled', v)}
                    disabled={!pushEnabled}
                  />
                </div>
              </div>

              {/* Friend Requests */}
              <div className="mt-5 mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <Bell className="w-3.5 h-3.5 text-gray-500" />
                  <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Friend Requests</p>
                </div>
                <div className="rounded-xl bg-white/3 border border-white/5 px-4">
                  <ToggleRow
                    label="In-app notifications"
                    checked={draft.friendRequestInAppEnabled}
                    onChange={(v) => set('friendRequestInAppEnabled', v)}
                  />
                  <ToggleRow
                    label="Sound"
                    checked={draft.friendRequestSoundEnabled}
                    onChange={(v) => set('friendRequestSoundEnabled', v)}
                  />
                  <ToggleRow
                    label="Push"
                    checked={draft.friendRequestPushEnabled}
                    onChange={(v) => set('friendRequestPushEnabled', v)}
                    disabled={!pushEnabled}
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Save button */}
        {draft && (
          <div className="px-4 pb-8 pt-3 border-t border-white/10 shrink-0">
            <button
              onClick={handleSave}
              disabled={notificationPreferencesSaving}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
            >
              {notificationPreferencesSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
