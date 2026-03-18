import type { RegisterServiceWorkerResult } from '@web-mobile/pwa/registerServiceWorker';

export const HAVEN_PWA_RUNTIME_PROBE_EVENT = 'haven:pwa-runtime-probe';

export interface HavenPwaRuntimeProbe {
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
  serviceWorkerAttempted: boolean;
  serviceWorkerRegistered: boolean;
  serviceWorkerReason: string;
  innerHeightPx: number;
  visualViewportHeightPx: number;
  visualViewportOffsetTopPx: number;
  visualViewportScale: number;
}

type ProbeWindow = Window & {
  __HAVEN_PWA_RUNTIME__?: HavenPwaRuntimeProbe;
  __HAVEN_PWA_RUNTIME_PROBE_CLEANUP__?: () => void;
};

const isRuntimeProbeEnabled = (): boolean => process.env.NODE_ENV === 'development';

const buildProbe = (
  previousValue: HavenPwaRuntimeProbe | undefined,
  serviceWorkerResult?: RegisterServiceWorkerResult
): HavenPwaRuntimeProbe => {
  const visualViewport = window.visualViewport;

  return {
    displayModeStandalone:
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches,
    navigatorStandalone:
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    serviceWorkerAttempted:
      serviceWorkerResult?.attempted ??
      previousValue?.serviceWorkerAttempted ??
      false,
    serviceWorkerRegistered:
      serviceWorkerResult?.attempted
        ? serviceWorkerResult.registered
        : previousValue?.serviceWorkerRegistered ?? false,
    serviceWorkerReason:
      serviceWorkerResult?.reason ??
      previousValue?.serviceWorkerReason ??
      'Pending registration',
    innerHeightPx: window.innerHeight,
    visualViewportHeightPx: visualViewport?.height ?? window.innerHeight,
    visualViewportOffsetTopPx: visualViewport?.offsetTop ?? 0,
    visualViewportScale: visualViewport?.scale ?? 1,
  };
};

export const getHavenPwaRuntimeProbe = (): HavenPwaRuntimeProbe | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as ProbeWindow).__HAVEN_PWA_RUNTIME__ ?? null;
};

export const updateHavenPwaRuntimeProbe = (
  serviceWorkerResult?: RegisterServiceWorkerResult
): void => {
  if (typeof window === 'undefined' || !isRuntimeProbeEnabled()) {
    return;
  }

  const target = window as ProbeWindow;
  target.__HAVEN_PWA_RUNTIME__ = buildProbe(
    target.__HAVEN_PWA_RUNTIME__,
    serviceWorkerResult
  );
  window.dispatchEvent(new CustomEvent(HAVEN_PWA_RUNTIME_PROBE_EVENT));
};

export const installHavenPwaRuntimeProbe = (): void => {
  if (typeof window === 'undefined' || !isRuntimeProbeEnabled()) {
    return;
  }

  const target = window as ProbeWindow;
  target.__HAVEN_PWA_RUNTIME_PROBE_CLEANUP__?.();

  const refreshProbe = () => {
    updateHavenPwaRuntimeProbe();
  };

  const displayModeMedia =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)')
      : null;
  const visualViewport = window.visualViewport;

  window.addEventListener('resize', refreshProbe);
  visualViewport?.addEventListener('resize', refreshProbe);
  visualViewport?.addEventListener('scroll', refreshProbe);
  displayModeMedia?.addEventListener?.('change', refreshProbe);

  target.__HAVEN_PWA_RUNTIME_PROBE_CLEANUP__ = () => {
    window.removeEventListener('resize', refreshProbe);
    visualViewport?.removeEventListener('resize', refreshProbe);
    visualViewport?.removeEventListener('scroll', refreshProbe);
    displayModeMedia?.removeEventListener?.('change', refreshProbe);
    delete target.__HAVEN_PWA_RUNTIME_PROBE_CLEANUP__;
  };

  updateHavenPwaRuntimeProbe();
};
