import type {
  DataCacheComponentSnapshot,
  DataCacheDebugEntry,
  DataCacheDebugLogInput,
} from "./dataCacheDebugTypes";
import { safeSerializeDebugRecord } from "./safeSerializeDebugValue";

const MAX_ENTRIES = 2500;
const MAX_COMPONENT_SNAPSHOTS = 80;

let enabled = typeof __DEV__ !== "undefined" ? __DEV__ : false;
let nextId = 1;
let sessionStartedAt = Date.now();
const entries: DataCacheDebugEntry[] = [];
const componentSnapshots = new Map<string, DataCacheComponentSnapshot>();
const listeners = new Set<() => void>();
let notifyScheduled = false;

/** Defers subscriber updates so logging during render cannot trigger setState in listeners. */
function scheduleNotify() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    for (const listener of listeners) {
      listener();
    }
  });
}

function formatConsoleLine(entry: DataCacheDebugEntry): string {
  const dataSuffix = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
  return `[DataCache +${entry.elapsedMs}ms][${entry.category}][${entry.source}] ${entry.message}${dataSuffix}`;
}

function pushEntry(input: DataCacheDebugLogInput): DataCacheDebugEntry | null {
  if (!enabled) return null;

  const entry: DataCacheDebugEntry = {
    id: nextId++,
    ts: Date.now(),
    elapsedMs: Date.now() - sessionStartedAt,
    level: input.level ?? "debug",
    category: input.category,
    source: input.source,
    message: input.message,
    data: safeSerializeDebugRecord(input.data),
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }

  const line = formatConsoleLine(entry);
  if (entry.level === "error") {
    console.error(line);
  } else if (entry.level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }

  scheduleNotify();
  return entry;
}

export const dataCacheDebug = {
  isEnabled: () => enabled,

  setEnabled: (next: boolean) => {
    enabled = next;
    pushEntry({
      category: "lifecycle",
      source: "dataCacheDebug",
      message: next ? "Debug logging enabled" : "Debug logging disabled",
      level: "info",
    });
  },

  resetSession: () => {
    sessionStartedAt = Date.now();
    nextId = 1;
    entries.length = 0;
    componentSnapshots.clear();
    scheduleNotify();
  },

  log: (input: DataCacheDebugLogInput) => pushEntry(input),

  store: (
    source: string,
    message: string,
    data?: Record<string, unknown>,
    level: DataCacheDebugEntry["level"] = "debug",
  ) => pushEntry({ category: "store", source, message, data, level }),

  fetch: (
    source: string,
    message: string,
    data?: Record<string, unknown>,
    level: DataCacheDebugEntry["level"] = "debug",
  ) => pushEntry({ category: "fetch", source, message, data, level }),

  cacheRead: (source: string, message: string, data?: Record<string, unknown>) =>
    pushEntry({ category: "cache-read", source, message, data }),

  cacheWrite: (source: string, message: string, data?: Record<string, unknown>) =>
    pushEntry({ category: "cache-write", source, message, data }),

  hydration: (source: string, message: string, data?: Record<string, unknown>) =>
    pushEntry({ category: "hydration", source, message, data }),

  realtime: (source: string, message: string, data?: Record<string, unknown>) =>
    pushEntry({ category: "realtime", source, message, data }),

  lifecycle: (source: string, message: string, data?: Record<string, unknown>) =>
    pushEntry({ category: "lifecycle", source, message, data }),

  navigation: (source: string, message: string, data?: Record<string, unknown>) =>
    pushEntry({ category: "navigation", source, message, data }),

  component: (source: string, message: string, data?: Record<string, unknown>) =>
    pushEntry({ category: "component", source, message, data }),

  setComponentSnapshot: (
    componentId: string,
    values: Record<string, unknown>,
  ) => {
    if (!enabled) return;

    const snapshot: DataCacheComponentSnapshot = {
      componentId,
      ts: Date.now(),
      elapsedMs: Date.now() - sessionStartedAt,
      values: safeSerializeDebugRecord(values) ?? {},
    };

    componentSnapshots.set(componentId, snapshot);
    if (componentSnapshots.size > MAX_COMPONENT_SNAPSHOTS) {
      const oldestKey = componentSnapshots.keys().next().value as string;
      componentSnapshots.delete(oldestKey);
    }

    scheduleNotify();
  },

  getEntries: (): readonly DataCacheDebugEntry[] => entries,

  getComponentSnapshots: (): readonly DataCacheComponentSnapshot[] =>
    Array.from(componentSnapshots.values()).sort((a, b) => b.ts - a.ts),

  clear: () => {
    entries.length = 0;
    componentSnapshots.clear();
    scheduleNotify();
    pushEntry({
      category: "lifecycle",
      source: "dataCacheDebug",
      message: "Log cleared",
      level: "info",
    });
  },

  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  exportAsSortedText: (): string => {
    const sorted = [...entries].sort((a, b) => a.ts - b.ts);
    const lines: string[] = [
      "Haven Data Cache Debug Export",
      `Generated: ${new Date().toISOString()}`,
      `Session elapsed: ${Date.now() - sessionStartedAt}ms`,
      `Entry count: ${sorted.length}`,
      "",
      "=== EVENT LOG (chronological) ===",
    ];

    for (const entry of sorted) {
      const dataLine = entry.data
        ? `\n    data: ${JSON.stringify(entry.data, null, 2).replace(/\n/g, "\n    ")}`
        : "";
      lines.push(
        `[${new Date(entry.ts).toISOString()} +${entry.elapsedMs}ms #${entry.id}] [${entry.level}] [${entry.category}] ${entry.source} — ${entry.message}${dataLine}`,
      );
    }

    lines.push("", "=== COMPONENT SNAPSHOTS (latest) ===");
    for (const snap of dataCacheDebug.getComponentSnapshots()) {
      lines.push(
        `[${new Date(snap.ts).toISOString()} +${snap.elapsedMs}ms] ${snap.componentId}`,
      );
      lines.push(JSON.stringify(snap.values, null, 2));
      lines.push("");
    }

    return lines.join("\n");
  },
};
