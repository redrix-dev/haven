/**
 * Compatibility shim. New traces go through `perfTrace`. `mark` records on
 * that same clock when tracing is enabled.
 */
import { perfTrace, type PerfFields } from "./perfTrace";

export type BootEvent = {
  name: string;
  t: number;
  elapsed: number;
  delta: number;
  data?: Record<string, unknown>;
};

function fieldsFrom(data?: Record<string, unknown>): PerfFields | undefined {
  if (!data) return undefined;
  const fields: PerfFields = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      fields[key] = value;
    }
  }
  return fields;
}

function mark(name: string, data?: Record<string, unknown>): void {
  perfTrace.mark(name, fieldsFrom(data));
}

function getEvents(): Readonly<BootEvent[]> {
  return perfTrace.getEvents().map((event) => ({
    name: event.name,
    t: event.t,
    elapsed: event.elapsed,
    delta: event.delta,
    data: event.fields,
  }));
}

function getReport(): string {
  return perfTrace.getReport();
}

function printReport(): void {
  perfTrace.printReport();
}

function _reset(): void {
  perfTrace.reset();
}

export const bootLogger = {
  mark,
  getEvents,
  getReport,
  printReport,
  _reset,
} as const;
