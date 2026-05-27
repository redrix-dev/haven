import React, { useEffect, useState } from "react";
import havenIconUrl from "@web-client/assets/images/haven-icon.png";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FADE_DURATION_MS = 500;
const MESSAGE_HOLD_MS = 900;   // how long each message stays visible
const MESSAGE_FADE_MS = 180;   // cross-fade between messages

const AUTH_MESSAGES = [
  "Checking your session…",
  "Authenticating…",
];

const LOADING_MESSAGES = [
  "Loading your servers…",
  "Validating cache…",
  "Syncing conversations…",
  "Loading profile data…",
  "Almost there…",
];

// ---------------------------------------------------------------------------
// Owl icon — uses the canonical app icon PNG for brand consistency
// ---------------------------------------------------------------------------

function HavenOwlLarge() {
  return (
    <img
      src={havenIconUrl}
      alt=""
      aria-hidden="true"
      width={80}
      height={80}
      className="haven-splash-owl rounded-2xl"
      draggable={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Three-dot loading indicator
// ---------------------------------------------------------------------------

function LoadingDots() {
  return (
    <div className="flex items-end gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block rounded-full bg-primary"
          style={{
            width: 6,
            height: 6,
            animation: `havenSplashDot 1.3s ease-in-out ${i * 0.18}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export type BootSplashPhase = "auth" | "loading";

interface BootSplashProps {
  /** When false the splash begins its fade-out and unmounts itself. */
  visible: boolean;
  /** Controls the pool of status messages shown. */
  phase: BootSplashPhase;
}

export function BootSplash({ visible, phase }: BootSplashProps) {
  // Whether the element is in the DOM at all (set false after fade-out)
  const [mounted, setMounted] = useState(true);
  // CSS opacity driving the fade-out transition
  const [opacity, setOpacity] = useState(1);

  // Message cycling state
  const messages = phase === "auth" ? AUTH_MESSAGES : LOADING_MESSAGES;
  const [msgIdx, setMsgIdx] = useState(0);
  const [msgOpacity, setMsgOpacity] = useState(1);

  // ── Overlay fade-out when visible → false ────────────────────────────────
  useEffect(() => {
    if (!visible) {
      setOpacity(0);
      const t = setTimeout(() => setMounted(false), FADE_DURATION_MS);
      return () => clearTimeout(t);
    }
    // Re-show if somehow recycled (e.g. dev HMR)
    setOpacity(1);
    setMounted(true);
  }, [visible]);

  // ── Reset message index when phase changes ───────────────────────────────
  useEffect(() => {
    setMsgIdx(0);
    setMsgOpacity(1);
  }, [phase]);

  // ── Cycle messages while visible ─────────────────────────────────────────
  useEffect(() => {
    if (!visible || messages.length <= 1) return;

    const cycle = setInterval(() => {
      // Fade out current message
      setMsgOpacity(0);
      // After fade, swap text and fade back in
      const swap = setTimeout(() => {
        setMsgIdx((i) => (i + 1) % messages.length);
        setMsgOpacity(1);
      }, MESSAGE_FADE_MS);
      return () => clearTimeout(swap);
    }, MESSAGE_HOLD_MS + MESSAGE_FADE_MS);

    return () => clearInterval(cycle);
  }, [visible, messages]);

  if (!mounted) return null;

  return (
    <>
      {/* Keyframes injected once alongside the component */}
      <style>{`
        @keyframes havenSplashOwlBreathe {
          0%, 100% { transform: scale(1);    opacity: 1;    }
          50%       { transform: scale(1.06); opacity: 0.88; }
        }
        .haven-splash-owl {
          animation: havenSplashOwlBreathe 2.6s ease-in-out infinite;
        }
        @keyframes havenSplashDot {
          0%, 60%, 100% { transform: scaleY(1);   opacity: 0.35; }
          30%            { transform: scaleY(1.5); opacity: 1;    }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-0 bg-surface-app"
        style={{
          opacity,
          transition: `opacity ${FADE_DURATION_MS}ms ease`,
          // Prevent accidental clicks reaching the loading app beneath
          pointerEvents: opacity === 0 ? "none" : "auto",
        }}
        aria-live="polite"
        aria-label="Haven is loading"
      >
        {/* Owl */}
        <HavenOwlLarge />

        {/* Wordmark */}
        <p className="mt-5 text-[22px] font-semibold tracking-wide text-foreground select-none">
          Haven
        </p>

        {/* Status copy — fades between messages */}
        <p
          className="mt-2 text-sm text-muted-foreground select-none"
          style={{
            opacity: msgOpacity,
            transition: `opacity ${MESSAGE_FADE_MS}ms ease`,
            minHeight: "1.25rem",
          }}
        >
          {messages[msgIdx]}
        </p>

        {/* Dots */}
        <div className="mt-7">
          <LoadingDots />
        </div>
      </div>
    </>
  );
}
