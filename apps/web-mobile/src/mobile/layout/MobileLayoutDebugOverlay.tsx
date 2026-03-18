import React from 'react';
import { useMobileViewport } from '@web-mobile/mobile/layout/MobileViewportContext';
import { useMobileSurfaceHost } from '@web-mobile/mobile/layout/MobileSurfaceHost';
import {
  getHavenPwaRuntimeProbe,
  HAVEN_PWA_RUNTIME_PROBE_EVENT,
} from '@web-mobile/pwa/runtimeProbe';

interface MobileLayoutDebugOverlayProps {
  bottomDockHeightPx: number;
  headerHeightPx: number;
  subheaderHeightPx: number;
}

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('debugMobileLayout') === '1') {
    return true;
  }

  try {
    return window.localStorage.getItem('haven.mobileLayoutDebug') === '1';
  } catch {
    return false;
  }
}

export function MobileLayoutDebugOverlay({
  bottomDockHeightPx,
  headerHeightPx,
  subheaderHeightPx,
}: MobileLayoutDebugOverlayProps) {
  const viewport = useMobileViewport();
  const { surfaces } = useMobileSurfaceHost();
  const enabled = isDebugEnabled();
  const [, setProbeVersion] = React.useState(0);

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const handleProbeUpdate = () => {
      setProbeVersion((currentValue) => currentValue + 1);
    };

    window.addEventListener(HAVEN_PWA_RUNTIME_PROBE_EVENT, handleProbeUpdate);

    return () => {
      window.removeEventListener(HAVEN_PWA_RUNTIME_PROBE_EVENT, handleProbeUpdate);
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  const pwaProbe = getHavenPwaRuntimeProbe();

  return (
    <div className="pointer-events-none absolute top-[calc(var(--mobile-safe-top)+0.5rem)] right-2 z-30 w-[min(18rem,calc(100%-1rem))] rounded-xl border border-[#304867] bg-[#09101bcc] px-3 py-2 text-[10px] leading-tight text-[#d8e6fb] backdrop-blur">
      <p className="font-semibold text-white">Mobile Layout Debug</p>
      <p>shell: {Math.round(viewport.shellHeightPx)}px</p>
      <p>visual: {Math.round(viewport.visualViewportHeightPx)}px</p>
      <p>offsetTop: {Math.round(viewport.visualViewportOffsetTopPx)}px</p>
      <p>scale: {viewport.scale.toFixed(2)}</p>
      <p>keyboard: {viewport.keyboardOpen ? 'open' : 'closed'}</p>
      <p>keyboardInset: {Math.round(viewport.keyboardInsetPx)}px</p>
      <p>header: {Math.round(headerHeightPx)}px</p>
      <p>subheader: {Math.round(subheaderHeightPx)}px</p>
      <p>bottomDock: {Math.round(bottomDockHeightPx)}px</p>
      {pwaProbe && (
        <>
          <p className="mt-1 font-semibold text-white">PWA</p>
          <p>display-mode standalone: {pwaProbe.displayModeStandalone ? 'yes' : 'no'}</p>
          <p>navigator.standalone: {pwaProbe.navigatorStandalone ? 'yes' : 'no'}</p>
          <p>
            service worker: {pwaProbe.serviceWorkerRegistered ? 'registered' : 'not registered'}
          </p>
          <p>service worker reason: {pwaProbe.serviceWorkerReason}</p>
        </>
      )}
      <p className="mt-1 font-semibold text-white">Surfaces</p>
      {surfaces.length === 0 ? (
        <p>none</p>
      ) : (
        surfaces.map((surface) => (
          <p key={surface.id}>
            {surface.kind}: {surface.label ?? surface.id}
          </p>
        ))
      )}
    </div>
  );
}
