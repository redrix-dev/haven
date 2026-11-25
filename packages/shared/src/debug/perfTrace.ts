/**
 * One clock for mobile launch and session traces.
 *
 * Disabled until `enable()` (the mobile entry calls it before the app graph
 * loads). While disabled, every call is a no-op and does not log.
 *
 * Each recorded event is one console line. Filter a device log on `haven-perf`.
 *
 *   [haven-perf] kind=span name=bootstrap.communities elapsed=120.5 delta=40.0 duration=80.2
 *   [haven-perf] kind=mark name=js-entry elapsed=0.0 delta=0.0
 *   [haven-perf] kind=summary name=bootstrap-ready elapsed=1523.4 delta=0.0 duration=1523.4 events=37 truncated=0 open=0
 *
 * Tokens are `[A-Za-z0-9._:+-]`. Anything else becomes `_`. `parsePerfLine`
 * reads a line back into those tokens. Durations are milliseconds with one
 * decimal. A span's start is `elapsed - duration`.
 *
 * Boot events stay in memory until `chat-first-commit` freezes them. Later
 * events roll. The console lines are the record that survives a long session.
 */

export type PerfKind =
  | "mark"
  | "span"
  | "summary"
  | "summary-top"
  | "summary-persist";

export type PerfFields = Record<string, string | number | boolean>;

export type PerfEvent = {
  kind: "mark" | "span";
  name: string;
  /** performance.now() (or the injected clock) at the event. */
  t: number;
  /** ms since the first recorded event. */
  elapsed: number;
  /** ms since the previous recorded event. */
  delta: number;
  /** Present for spans. The work started at elapsed - duration. */
  duration?: number;
  fields?: PerfFields;
};

export type PerfSpan = {
  /** Idempotent. Extra fields are merged onto the ones from `begin`. */
  end: (fields?: PerfFields) => void;
};

export type ParsedPerfLine = Record<string, string>;

const PREFIX = "[haven-perf]";
const SLOW_MS = 8;
const DEFAULT_BOOT_CAP = 400;
const SESSION_CAP = 200;
const TOKEN_MAX = 120;

export type PersistStats = {
  writes: number;
  writeBytes: number;
  writeMs: number;
  stringifyMs: number;
  slowWrites: number;
  slowStringifies: number;
  reads: number;
  readBytes: number;
  readMs: number;
  slowReads: number;
};

type GlobalPerf = {
  report: () => string;
  lines: () => string[];
  flush: (reason?: string) => void;
};

function defaultNow(): number {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  return Date.now();
}

function emptyStats(): PersistStats {
  return {
    writes: 0,
    writeBytes: 0,
    writeMs: 0,
    stringifyMs: 0,
    slowWrites: 0,
    slowStringifies: 0,
    reads: 0,
    readBytes: 0,
    readMs: 0,
    slowReads: 0,
  };
}

let enabled = false;
let nowFn: () => number = defaultNow;
let t0: number | null = null;
let previousT: number | null = null;
let openSpans = 0;
let bootFrozen = false;
let truncated = false;
let bootCap = DEFAULT_BOOT_CAP;
const bootEvents: PerfEvent[] = [];
const sessionEvents: PerfEvent[] = [];
const lines: string[] = [];
const extraSinks: Array<(line: string) => void> = [];
const onceKeys = new Set<string>();
let stats = emptyStats();

function token(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._:+-]/g, "_").slice(0, TOKEN_MAX);
  return cleaned.length > 0 ? cleaned : "_";
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

function formatField(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return formatNumber(value);
  return token(value);
}

function cleanFields(fields: PerfFields): PerfFields {
  const out: PerfFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value === "string") out[token(key)] = token(value);
    else if (typeof value === "number" && Number.isFinite(value))
      out[token(key)] = value;
    else if (typeof value === "boolean") out[token(key)] = value;
  }
  return out;
}

function formatMs(value: number): string {
  if (!Number.isFinite(value)) return "0.0";
  return value.toFixed(1);
}

function formatLine(input: {
  kind: PerfKind;
  name: string;
  elapsed: number;
  delta: number;
  duration?: number;
  fields?: PerfFields;
}): string {
  const parts = [
    PREFIX,
    `kind=${input.kind}`,
    `name=${token(input.name)}`,
    `elapsed=${formatMs(input.elapsed)}`,
    `delta=${formatMs(input.delta)}`,
  ];
  if (input.duration !== undefined) {
    parts.push(`duration=${formatMs(input.duration)}`);
  }
  if (input.fields) {
    for (const [key, value] of Object.entries(input.fields)) {
      parts.push(`${token(key)}=${formatField(value)}`);
    }
  }
  return parts.join(" ");
}

function emitLine(line: string): void {
  lines.push(line);
  console.log(line);
  for (const sink of extraSinks) {
    try {
      sink(line);
    } catch {
      // A failing sink must never break tracing or the measured code.
    }
  }
}

function allEvents(): readonly PerfEvent[] {
  return bootFrozen ? bootEvents.concat(sessionEvents) : bootEvents;
}

function store(event: PerfEvent): void {
  if (!bootFrozen) {
    bootEvents.push(event);
    if (bootEvents.length > bootCap) {
      bootEvents.shift();
      truncated = true;
    }
    return;
  }
  sessionEvents.push(event);
  if (sessionEvents.length > SESSION_CAP) sessionEvents.shift();
}

function commit(
  kind: "mark" | "span",
  name: string,
  duration: number | undefined,
  fields?: PerfFields,
  at?: number,
): void {
  const t = at ?? nowFn();
  if (t0 === null) t0 = t;
  const prev = previousT ?? t;
  const event: PerfEvent = {
    kind,
    name: token(name),
    t,
    elapsed: t - t0,
    delta: t - prev,
    ...(duration !== undefined ? { duration } : {}),
    ...(fields ? { fields: cleanFields(fields) } : {}),
  };
  previousT = t;
  store(event);
  emitLine(formatLine(event));
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function parsePerfLine(line: string): ParsedPerfLine | null {
  if (!line.startsWith(`${PREFIX} `)) return null;
  const parsed: ParsedPerfLine = {};
  for (const part of line.slice(PREFIX.length + 1).split(" ")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    parsed[part.slice(0, eq)] = part.slice(eq + 1);
  }
  if (!parsed.kind || !parsed.name) return null;
  return parsed;
}

export const perfTrace = {
  isEnabled: (): boolean => enabled,

  enable(): void {
    enabled = true;
  },

  disable(): void {
    enabled = false;
  },

  /**
   * Register an extra sink called with each emitted line, in addition to
   * `console.log`. The mobile entry uses this to mirror lines into the iOS
   * unified log (Console.app) alongside the native boot marks; `console.log`
   * (Metro) is unaffected. Returns an unsubscribe function. A throwing sink is
   * swallowed so it can never break tracing or the code being measured.
   */
  addSink(sink: (line: string) => void): () => void {
    extraSinks.push(sink);
    return () => {
      const index = extraSinks.indexOf(sink);
      if (index >= 0) extraSinks.splice(index, 1);
    };
  },

  now: (): number => nowFn(),

  /** Test hook. Production uses performance.now. */
  setNow(next: () => number): void {
    nowFn = next;
  },

  /** Test hook. Boot events past this count set truncated=1 and drop the oldest. */
  setBootCap(next: number): void {
    bootCap = Math.max(1, next);
  },

  reset(): void {
    t0 = null;
    previousT = null;
    openSpans = 0;
    bootFrozen = false;
    truncated = false;
    bootCap = DEFAULT_BOOT_CAP;
    bootEvents.length = 0;
    sessionEvents.length = 0;
    lines.length = 0;
    extraSinks.length = 0;
    onceKeys.clear();
    stats = emptyStats();
    nowFn = defaultNow;
  },

  mark(name: string, fields?: PerfFields): void {
    if (!enabled) return;
    commit("mark", name, undefined, fields);
  },

  /** Records the mark the first time `name` is seen. Returns whether it recorded. */
  markOnce(name: string, fields?: PerfFields): boolean {
    if (!enabled) return false;
    if (onceKeys.has(name)) return false;
    onceKeys.add(name);
    commit("mark", name, undefined, fields);
    return true;
  },

  begin(name: string, fields?: PerfFields): PerfSpan {
    if (!enabled) return { end() {} };
    const started = nowFn();
    openSpans += 1;
    let closed = false;
    return {
      end(extra?: PerfFields) {
        if (closed) return;
        closed = true;
        openSpans = Math.max(0, openSpans - 1);
        const merged =
          fields || extra ? { ...(fields ?? {}), ...(extra ?? {}) } : undefined;
        const finished = nowFn();
        const t = finished;
        if (t0 === null) t0 = started;
        const prev = previousT ?? t;
        const event: PerfEvent = {
          kind: "span",
          name: token(name),
          t,
          elapsed: t - t0,
          delta: t - prev,
          duration: finished - started,
          ...(merged ? { fields: cleanFields(merged) } : {}),
        };
        previousT = t;
        store(event);
        emitLine(formatLine(event));
      },
    };
  },

  /**
   * Run `task` and record its duration. When disabled, `task` is called as-is.
   * A thrown or rejected task is recorded with `error=1` and rethrown.
   */
  measure<T>(name: string, task: () => T, fields?: PerfFields): T {
    if (!enabled) return task();
    const span = this.begin(name, fields);
    try {
      const result = task();
      if (isThenable(result)) {
        return result.then(
          (value) => {
            span.end();
            return value;
          },
          (error: unknown) => {
            span.end({ error: 1 });
            throw error;
          },
        ) as T;
      }
      span.end();
      return result;
    } catch (error) {
      span.end({ error: 1 });
      throw error;
    }
  },

  noteStringify(
    key: string,
    bytes: number,
    durationMs: number,
    endedAt: number,
  ): void {
    if (!enabled) return;
    stats.stringifyMs += durationMs;
    if (durationMs < SLOW_MS) return;
    stats.slowStringifies += 1;
    commit("span", "persist.stringify", durationMs, { key, bytes }, endedAt);
  },

  noteWrite(
    key: string,
    bytes: number,
    durationMs: number,
    endedAt: number,
  ): void {
    if (!enabled) return;
    stats.writes += 1;
    stats.writeBytes += bytes;
    stats.writeMs += durationMs;
    if (durationMs < SLOW_MS) return;
    stats.slowWrites += 1;
    commit("span", "persist.write", durationMs, { key, bytes }, endedAt);
  },

  noteRead(
    key: string,
    bytes: number,
    durationMs: number,
    endedAt: number,
  ): void {
    if (!enabled) return;
    stats.reads += 1;
    stats.readBytes += bytes;
    stats.readMs += durationMs;
    if (durationMs < SLOW_MS) return;
    stats.slowReads += 1;
    commit("span", "persist.read", durationMs, { key, bytes }, endedAt);
  },

  getPersistStats(): PersistStats {
    return { ...stats };
  },

  getEvents(): readonly PerfEvent[] {
    return allEvents();
  },

  getLines(): readonly string[] {
    return lines;
  },

  getReport(): string {
    const events = allEvents();
    if (events.length === 0) return "(no perf events recorded)";
    const rows = [
      `Haven perf — ${events.length} events${truncated ? " (boot buffer truncated)" : ""}`,
      `${"Event".padEnd(42)} ${"Elapsed".padStart(10)} ${"Δ".padStart(10)} ${"Duration".padStart(10)}`,
    ];
    for (const event of events) {
      const elapsed = `${event.elapsed.toFixed(1)}`.padStart(10);
      const delta = `${event.delta.toFixed(1)}`.padStart(10);
      const duration =
        event.duration !== undefined
          ? `${event.duration.toFixed(1)}`.padStart(10)
          : "".padStart(10);
      rows.push(`${event.name.padEnd(42)} ${elapsed} ${delta} ${duration}`);
    }
    return rows.join("\n");
  },

  printReport(): void {
    console.log(this.getReport());
  },

  /**
   * One summary block: the reason, the slowest spans still in memory, and
   * persist counters (including writes that were too fast to log on their own).
   * `chat-first-commit` freezes the boot buffer.
   */
  flushSummary(reason: string): void {
    if (!enabled) return;
    const events = allEvents();
    const elapsed = events.length > 0 ? events[events.length - 1].elapsed : 0;
    emitLine(
      formatLine({
        kind: "summary",
        name: reason,
        elapsed,
        delta: 0,
        duration: elapsed,
        fields: {
          events: events.length,
          truncated: truncated ? 1 : 0,
          open: openSpans,
        },
      }),
    );
    const slowest = events
      .filter(
        (event): event is PerfEvent & { duration: number } =>
          event.kind === "span" && event.duration !== undefined,
      )
      .slice()
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 12);
    for (const event of slowest) {
      emitLine(
        formatLine({
          kind: "summary-top",
          name: event.name,
          elapsed: event.elapsed,
          delta: 0,
          duration: event.duration,
          fields: event.fields,
        }),
      );
    }
    emitLine(
      formatLine({
        kind: "summary-persist",
        name: "persist",
        elapsed,
        delta: 0,
        fields: {
          writes: stats.writes,
          writeBytes: stats.writeBytes,
          stringifyMs: stats.stringifyMs,
          writeMs: stats.writeMs,
          slowWrites: stats.slowWrites,
          slowStringifies: stats.slowStringifies,
          reads: stats.reads,
          readBytes: stats.readBytes,
          readMs: stats.readMs,
          slowReads: stats.slowReads,
        },
      }),
    );
    if (reason === "chat-first-commit") bootFrozen = true;
  },

  installGlobalHook(): void {
    const host = globalThis as typeof globalThis & { __havenPerf?: GlobalPerf };
    host.__havenPerf = {
      report: () => this.getReport(),
      lines: () => lines.slice(),
      flush: (reason?: string) => this.flushSummary(reason ?? "manual"),
    };
  },
};
