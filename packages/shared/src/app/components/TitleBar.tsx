import React from 'react';
import { desktopClient } from '@platform/desktop/client';

const WINDOW_CONTROL_BUTTON_CLASS =
  'no-drag flex h-8 w-10 items-center justify-center text-[#9fb2d1] transition-colors hover:bg-[#1a2a3f] hover:text-white';

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
      fill="#3F79D8"
    />
    <path
      d="M4.2 4.7L6 3.2L7.1 5.15H8.9L10 3.2L11.8 4.7V8.35C11.8 10.5 10.15 12.25 8 12.25C5.85 12.25 4.2 10.5 4.2 8.35V4.7Z"
      fill="#EAF1FF"
    />
    <circle cx="6.3" cy="7.2" r="1.1" fill="#0D1626" />
    <circle cx="9.7" cy="7.2" r="1.1" fill="#0D1626" />
    <path
      d="M8 8.5L6.95 9.55H9.05L8 8.5Z"
      fill="#D08D3F"
    />
  </svg>
);

export function TitleBar() {
  const isDesktop = desktopClient.isAvailable();
  const isMac = window.navigator.platform.includes('Mac');
  const showWindowControls = isDesktop && !isMac;

  if (!isDesktop) return null;

  const handleMinimize = () => {
    if (!desktopClient.isAvailable()) return;
    void desktopClient.minimizeWindow();
  };

  const handleMaximizeToggle = () => {
    if (!desktopClient.isAvailable()) return;
    void desktopClient.maximizeWindow();
  };

  const handleClose = () => {
    if (!desktopClient.isAvailable()) return;
    void desktopClient.closeWindow();
  };

  return (
    <div className="drag-region fixed inset-x-0 top-0 z-50 flex h-8 items-center justify-between border-b border-[#1a2a3f] bg-[#0d1626]/95 px-3 text-[#d7e0ef] backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm font-medium tracking-[0.02em]">
        <HavenOwlIcon />
        <span>Haven</span>
      </div>
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
            className={`${WINDOW_CONTROL_BUTTON_CLASS} hover:bg-[#c34747]`}
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

// CHECKPOINT 3 COMPLETE
