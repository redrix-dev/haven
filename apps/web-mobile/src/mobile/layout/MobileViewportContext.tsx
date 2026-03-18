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

export interface MobileViewportState {
  hasFocusedTextEntry: boolean;
  keyboardInsetPx: number;
  keyboardOpen: boolean;
  layoutViewportHeightPx: number;
  scale: number;
  shellHeightPx: number;
  visualViewportHeightPx: number;
  visualViewportOffsetTopPx: number;
}

const MobileViewportContext = React.createContext<MobileViewportState | null>(null);

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

function getInitialViewportState(): MobileViewportState {
  const shellHeightPx =
    typeof window === 'undefined'
      ? 0
      : window.visualViewport?.height ?? window.innerHeight;

  return {
    hasFocusedTextEntry: false,
    keyboardInsetPx: 0,
    keyboardOpen: false,
    layoutViewportHeightPx: shellHeightPx,
    scale: 1,
    shellHeightPx,
    visualViewportHeightPx: shellHeightPx,
    visualViewportOffsetTopPx: 0,
  };
}

function applyViewportCssVars(root: HTMLElement, state: MobileViewportState): void {
  root.style.setProperty('--mobile-shell-height', `${state.shellHeightPx}px`);
  root.style.setProperty('--mobile-keyboard-inset', `${state.keyboardInsetPx}px`);
  root.style.setProperty(
    '--mobile-visual-viewport-height',
    `${state.visualViewportHeightPx}px`
  );
  root.style.setProperty(
    '--mobile-visual-viewport-offset-top',
    `${state.visualViewportOffsetTopPx}px`
  );
  root.dataset.mobileKeyboardOpen = state.keyboardOpen ? 'true' : 'false';
}

export function MobileViewportProvider({ children }: { children: React.ReactNode }) {
  const [viewportState, setViewportState] = React.useState<MobileViewportState>(
    getInitialViewportState
  );

  React.useEffect(() => {
    const root = document.documentElement;
    let frameId: number | null = null;
    let layoutViewportHeightPx = window.innerHeight;

    const commitState = (nextState: MobileViewportState) => {
      layoutViewportHeightPx = nextState.layoutViewportHeightPx;
      applyViewportCssVars(root, nextState);
      setViewportState(nextState);
    };

    const syncViewportState = () => {
      frameId = null;

      const activeElement = document.activeElement;
      const hasFocusedTextEntry = isKeyboardTextEntryElement(activeElement);
      const visualViewport = window.visualViewport;

      if (!visualViewport) {
        commitState({
          hasFocusedTextEntry,
          keyboardInsetPx: 0,
          keyboardOpen: false,
          layoutViewportHeightPx: window.innerHeight,
          scale: 1,
          shellHeightPx: window.innerHeight,
          visualViewportHeightPx: window.innerHeight,
          visualViewportOffsetTopPx: 0,
        });
        return;
      }

      if (visualViewport.scale > PINCH_ZOOM_THRESHOLD && !hasFocusedTextEntry) {
        commitState({
          hasFocusedTextEntry,
          keyboardInsetPx: 0,
          keyboardOpen: false,
          layoutViewportHeightPx: window.innerHeight,
          scale: visualViewport.scale,
          shellHeightPx: window.innerHeight,
          visualViewportHeightPx: visualViewport.height,
          visualViewportOffsetTopPx: visualViewport.offsetTop,
        });
        return;
      }

      const visibleHeightPx = visualViewport.height;
      const offsetTopPx = visualViewport.offsetTop;
      const measuredLayoutViewportHeightPx = Math.max(
        window.innerHeight,
        visibleHeightPx + offsetTopPx
      );

      const nextLayoutViewportHeightPx = hasFocusedTextEntry
        ? Math.max(layoutViewportHeightPx, measuredLayoutViewportHeightPx)
        : measuredLayoutViewportHeightPx;

      const keyboardInsetPx = Math.max(
        0,
        nextLayoutViewportHeightPx - (visibleHeightPx + offsetTopPx)
      );
      const keyboardOpen =
        hasFocusedTextEntry && keyboardInsetPx >= KEYBOARD_OPEN_THRESHOLD_PX;
      const shellHeightPx = visibleHeightPx;

      commitState({
        hasFocusedTextEntry,
        keyboardInsetPx: keyboardOpen ? keyboardInsetPx : 0,
        keyboardOpen,
        layoutViewportHeightPx: keyboardOpen
          ? nextLayoutViewportHeightPx
          : measuredLayoutViewportHeightPx,
        scale: visualViewport.scale,
        shellHeightPx,
        visualViewportHeightPx: visibleHeightPx,
        visualViewportOffsetTopPx: offsetTopPx,
      });
    };

    const scheduleSync = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(syncViewportState);
    };

    const visualViewport = window.visualViewport;

    scheduleSync();

    visualViewport?.addEventListener('resize', scheduleSync);
    visualViewport?.addEventListener('scroll', scheduleSync);
    window.addEventListener('resize', scheduleSync);
    document.addEventListener('focusin', scheduleSync);
    document.addEventListener('focusout', scheduleSync);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      visualViewport?.removeEventListener('resize', scheduleSync);
      visualViewport?.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      document.removeEventListener('focusin', scheduleSync);
      document.removeEventListener('focusout', scheduleSync);

      root.style.removeProperty('--mobile-shell-height');
      root.style.removeProperty('--mobile-keyboard-inset');
      root.style.removeProperty('--mobile-visual-viewport-height');
      root.style.removeProperty('--mobile-visual-viewport-offset-top');
      delete root.dataset.mobileKeyboardOpen;
    };
  }, []);

  return (
    <MobileViewportContext.Provider value={viewportState}>
      {children}
    </MobileViewportContext.Provider>
  );
}

export function useMobileViewport(): MobileViewportState {
  const context = React.useContext(MobileViewportContext);

  if (!context) {
    throw new Error('useMobileViewport must be used within <MobileViewportProvider>.');
  }

  return context;
}
