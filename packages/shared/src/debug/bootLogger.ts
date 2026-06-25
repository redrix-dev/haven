/**
 * bootLogger — lightweight startup timing recorder.
 *
 * Designed to be imported at the very top of each platform entry point so
 * event #0 is captured before any other module executes.  Timestamps are
 * recorded with `performance.now()` which is available on all three platforms
 * (web, Electron renderer, React Native ≥ 0.70).
 *
 * Usage:
 *   import { bootLogger } from '@shared/debug/bootLogger';
 *   bootLogger.mark('js-entry');           // first thing in index.tsx / App.tsx
 *   bootLogger.mark('core-created');       // after createHavenCore()
 *   ...
 *   bootLogger.printReport();             // dump to console
 *   const html = bootLogger.getReportHtml(); // render in a panel
 */

export type BootEvent = {
  name: string;
  /** Absolute timestamp from performance.now() */
  t: number;
  /** ms since the FIRST recorded event (t0) */
  elapsed: number;
  /** ms since the PREVIOUS event */
  delta: number;
  data?: Record<string, unknown>;
};

const MAX_EVENTS = 200;
const events: BootEvent[] = [];

function now(): number {
  if (typeof performance !== "undefined") return performance.now();
  if (typeof Date !== "undefined") return Date.now();
  return 0;
}

// Use the timestamp injected by the HTML <head> inline script as the real page-
// start origin.  This captures the "window visible but blank" period that
// precedes bundle evaluation.  Falls back to 0 (= performance.timeOrigin, i.e.
// navigation start) so all elapsed values are page-relative even without the
// HTML shim (e.g. React Native, tests).
const bootGlobal = globalThis as typeof globalThis & {
  __havenBootT0?: unknown;
};

const _pageT0: number =
  typeof bootGlobal.__havenBootT0 === "number" ? bootGlobal.__havenBootT0 : 0;

let t0: number = _pageT0;

function mark(name: string, data?: Record<string, unknown>): void {
  if (events.length >= MAX_EVENTS) return;

  const t = now();
  const prev = events[events.length - 1];
  const elapsed = t - t0;
  const delta = prev ? t - prev.t : 0;

  events.push({ name, t, elapsed, delta, data });
}

function getEvents(): Readonly<BootEvent[]> {
  return events;
}

function getReport(): string {
  if (events.length === 0) return "(no boot events recorded)";

  const lines: string[] = [
    `Haven Boot Sequence — ${events.length} events`,
    `${"Event".padEnd(40)} ${"Elapsed".padStart(10)} ${"Δ".padStart(10)}`,
    "─".repeat(63),
  ];

  for (const e of events) {
    const elapsed = `+${e.elapsed.toFixed(1)} ms`.padStart(10);
    const delta =
      e.delta > 0 ? `+${e.delta.toFixed(1)} ms`.padStart(10) : "".padStart(10);
    lines.push(`${e.name.padEnd(40)} ${elapsed} ${delta}`);
    if (e.data) {
      for (const [k, v] of Object.entries(e.data)) {
        lines.push(`  ${k}: ${String(v)}`);
      }
    }
  }

  return lines.join("\n");
}

function printReport(): void {
  console.log("\n%c" + getReport(), "font-family: monospace; white-space: pre");
}

/** Reset — only useful in tests. */
function _reset(): void {
  events.length = 0;
  t0 = _pageT0;
}

export const bootLogger = {
  mark,
  getEvents,
  getReport,
  printReport,
  _reset,
} as const;
