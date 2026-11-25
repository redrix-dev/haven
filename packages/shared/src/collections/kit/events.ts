/**
 * Which collection applies each realtime event.
 *
 * HavenCore builds one `EventTable`: an entry for every event in
 * `HavenEventMap`, either the function that applies it or the reason the app
 * ignores it. Every event is required, so when the database starts sending a
 * new one, the table stops compiling until someone decides what it means.
 */

import { perfTrace } from "@shared/debug/perfTrace";
import type {
  HavenEvent,
  HavenEventMap,
  HavenEventName,
} from "@shared/lib/backend/realtime";

/** An event the app chooses not to act on, and why. */
export type Ignored = { readonly ignored: string };

export type EventTable = {
  readonly [Name in HavenEventName]:
    | ((payload: HavenEventMap[Name]) => void)
    | Ignored;
};

/**
 * Applies one event through the table. A handler that throws is logged and
 * the next event still arrives: one bad event must not stop the stream.
 * With tracing on, each applied event is one `event` span named by type.
 */
export function applyEvent(table: EventTable, event: HavenEvent): void {
  const entry = table[event.event];
  if (typeof entry !== "function") return;
  const span = perfTrace.begin("event", { type: event.event });
  try {
    (entry as (payload: unknown) => void)(event.payload);
    span.end();
  } catch (error) {
    span.end({ error: 1 });
    console.error(`[events] applying ${event.event} failed`, error);
  }
}
