import React from 'react';

const KEYBOARD_OPEN_THRESHOLD_PX = 80;
const PINCH_ZOOM_THRESHOLD = 1.01;

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isKeyboardTextEntryElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;

  if (element.isContentEditable) return true;

  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(element.type.toLowerCase());
  }

  return false;
}

export function useMobileViewportStabilizer(): void {
  React.useEffect(() => {
    const root = document.documentElement;
    let frameId: number | null = null;

    const setClosedViewportState = () => {
      root.style.setProperty('--app-visual-viewport-height', '100dvh');
      root.style.setProperty('--app-keyboard-inset', '0px');
      root.style.setProperty('--app-visual-viewport-offset-top', '0px');
      root.dataset.mobileKeyboardOpen = 'false';
    };

    const syncViewportState = () => {
      frameId = null;

      const activeElement = document.activeElement;
      const hasFocusedTextEntry = isKeyboardTextEntryElement(activeElement);
      const visualViewport = window.visualViewport;

      if (!visualViewport) {
        setClosedViewportState();
        return;
      }

      if (visualViewport.scale > PINCH_ZOOM_THRESHOLD && !hasFocusedTextEntry) {
        setClosedViewportState();
        return;
      }

      const visibleHeightPx = visualViewport.height;
      const offsetTopPx = visualViewport.offsetTop;
      const keyboardInsetPx = Math.max(
        0,
        window.innerHeight - (visualViewport.height + visualViewport.offsetTop)
      );
      const keyboardOpen = hasFocusedTextEntry && keyboardInsetPx >= KEYBOARD_OPEN_THRESHOLD_PX;

      if (!keyboardOpen) {
        setClosedViewportState();
        return;
      }

      root.style.setProperty('--app-visual-viewport-height', `${visibleHeightPx}px`);
      root.style.setProperty('--app-keyboard-inset', `${keyboardInsetPx}px`);
      root.style.setProperty('--app-visual-viewport-offset-top', `${offsetTopPx}px`);
      root.dataset.mobileKeyboardOpen = 'true';
    };

    const scheduleSync = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(syncViewportState);
    };

    const handleFocusEvent = () => {
      scheduleSync();
    };

    const visualViewport = window.visualViewport;

    scheduleSync();

    visualViewport?.addEventListener('resize', scheduleSync);
    visualViewport?.addEventListener('scroll', scheduleSync);
    window.addEventListener('resize', scheduleSync);
    document.addEventListener('focusin', handleFocusEvent);
    document.addEventListener('focusout', handleFocusEvent);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      visualViewport?.removeEventListener('resize', scheduleSync);
      visualViewport?.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      document.removeEventListener('focusin', handleFocusEvent);
      document.removeEventListener('focusout', handleFocusEvent);

      root.style.removeProperty('--app-visual-viewport-height');
      root.style.removeProperty('--app-keyboard-inset');
      root.style.removeProperty('--app-visual-viewport-offset-top');
      delete root.dataset.mobileKeyboardOpen;
    };
  }, []);
}
