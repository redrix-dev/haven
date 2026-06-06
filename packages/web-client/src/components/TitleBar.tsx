import React from 'react';
import { getAppHost } from '@shared/infrastructure/platform/appHost';
import type { UpdaterStatus } from '@shared/infrastructure/platform/desktop/types';

const WINDOW_CONTROL_BUTTON_CLASS =
  'no-drag flex h-8 w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-border-titlebar hover:text-white';

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path
      d="M1 1L9 9M9 1L1 9"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

const MinimizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path
      d="M1.5 5H8.5"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

const MaximizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <rect
      x="1.5"
      y="1.5"
      width="7"
      height="7"
      rx="0.6"
      stroke="currentColor"
      strokeWidth="1.2"
    />
  </svg>
);

const HavenOwlIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 1.25C4.4 1.25 1.75 4.15 1.75 7.55C1.75 11.5 4.55 14.75 8 14.75C11.45 14.75 14.25 11.5 14.25 7.55C14.25 4.15 11.6 1.25 8 1.25Z"
      fill="var(--primary)"
    />
    <path
      d="M4.2 4.7L6 3.2L7.1 5.15H8.9L10 3.2L11.8 4.7V8.35C11.8 10.5 10.15 12.25 8 12.25C5.85 12.25 4.2 10.5 4.2 8.35V4.7Z"
      fill="var(--icon-owl-light)"
    />
    <circle cx="6.3" cy="7.2" r="1.1" fill="var(--surface-desktop-shell)" />
    <circle cx="9.7" cy="7.2" r="1.1" fill="var(--surface-desktop-shell)" />
    <path
      d="M8 8.5L6.95 9.55H9.05L8 8.5Z"
      fill="var(--icon-beak)"
    />
  </svg>
);

type UpdateBadgeProps = {
  status: UpdaterStatus | null;
  onInstall: () => void;
};

/**
 * Breathing pulse badge shown in the title bar when an update is available or
 * downloaded. Replaces the native "needs restart" dialog so updates are
 * non-blocking — users restart at their convenience.
 */
function UpdateBadge({ status, onInstall }: UpdateBadgeProps) {
  if (status?.status === 'update_downloaded') {
    return (
      <button
        type="button"
        onClick={onInstall}
        title="Click to restart Haven and install the update"
        className="no-drag flex cursor-pointer items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/25 transition-colors hover:bg-emerald-500/25"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        Restart to update
      </button>
    );
  }

  if (status?.status === 'update_available') {
    return (
      <div
        title="Update downloading in the background"
        className="no-drag flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-400 ring-1 ring-sky-500/25"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
        Updating…
      </div>
    );
  }

  return null;
}

const UPDATE_POLL_INTERVAL_MS = 30_000;

export function TitleBar() {
  const host = getAppHost();
  const isDesktop = host.isDesktopApp();
  const isMac = window.navigator.platform.includes('Mac');
  const showWindowControls = isDesktop && !isMac && Boolean(host.windowChrome);

  const [updaterStatus, setUpdaterStatus] = React.useState<UpdaterStatus | null>(null);

  React.useEffect(() => {
    const bridge = host.desktopSettings;
    if (!isDesktop || !bridge) return;

    const fetchStatus = async () => {
      try {
        const status = await bridge.getUpdaterStatus();
        setUpdaterStatus(status);
      } catch {
        // Non-critical — silently ignore; the settings panel is the primary update UI.
      }
    };

    void fetchStatus();
    const interval = setInterval(() => { void fetchStatus(); }, UPDATE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isDesktop, host]);

  const handleInstallUpdate = React.useCallback(() => {
    void host.desktopSettings?.installUpdate?.();
  }, [host]);

  if (!isDesktop || !host.windowChrome) return null;

  const { minimizeWindow, maximizeWindow, closeWindow } = host.windowChrome;

  const handleMinimize = () => { void minimizeWindow(); };
  const handleMaximizeToggle = () => { void maximizeWindow(); };
  const handleClose = () => { void closeWindow(); };

  // On macOS, the native traffic-light buttons (stoplight) sit in the top-left
  // corner of the frameless region. Reserve ~80 px of left padding so our
  // logo/name never sits under them. Windows gets symmetric px-3.
  const paddingClass = isMac ? 'pl-20 pr-3' : 'px-3';

  return (
    <div className={`drag-region fixed inset-x-0 top-0 z-50 flex h-8 items-center justify-between border-b border-border-titlebar bg-surface-desktop-shell/95 ${paddingClass} text-titlebar backdrop-blur-sm`}>
      <div className="flex items-center gap-2 text-sm font-medium tracking-[0.02em]">
        <HavenOwlIcon />
        <span>Haven</span>
      </div>

      <UpdateBadge status={updaterStatus} onInstall={handleInstallUpdate} />

      {showWindowControls ? (
        <div className="flex items-stretch">
          <button
            type="button"
            className={WINDOW_CONTROL_BUTTON_CLASS}
            onClick={handleMinimize}
            aria-label="Minimize window"
          >
            <MinimizeIcon />
          </button>
          <button
            type="button"
            className={WINDOW_CONTROL_BUTTON_CLASS}
            onClick={handleMaximizeToggle}
            aria-label="Maximize or restore window"
          >
            <MaximizeIcon />
          </button>
          <button
            type="button"
            className={`${WINDOW_CONTROL_BUTTON_CLASS} hover:bg-titlebar-close-hover`}
            onClick={handleClose}
            aria-label="Close window"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
}
