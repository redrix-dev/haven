/**
 * Haven's backend clients: one per area of docs/architecture/DATABASE.md,
 * each a thin, typed door onto the database's RPCs and readable tables.
 *
 * What these clients promise:
 * - Records keep the database's own field names and shapes (records.ts).
 *   Nothing is renamed on the way, so there is no mapping to keep in step.
 * - Every failure is a HavenError carrying the database's reason word.
 * - No permission is decided here. The database decides; these ask.
 */

import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { createChannelsBackend } from "./channels";
import { createCommunitiesBackend } from "./communities";
import { createMediaBackend } from "./media";
import { createMessagesBackend } from "./messages";
import { createNotificationsBackend } from "./notifications";
import { createPeopleBackend } from "./people";
import { createRealtimeBackend } from "./realtime";
import { createSafetyBackend } from "./safety";
import { createSocialBackend } from "./social";
import { createVoiceBackend } from "./voice";

export function createBackend(client: HavenSupabaseClient) {
  return {
    people: createPeopleBackend(client),
    social: createSocialBackend(client),
    communities: createCommunitiesBackend(client),
    channels: createChannelsBackend(client),
    messages: createMessagesBackend(client),
    media: createMediaBackend(client),
    notifications: createNotificationsBackend(client),
    safety: createSafetyBackend(client),
    voice: createVoiceBackend(client),
    realtime: createRealtimeBackend(client),
  };
}

export type Backend = ReturnType<typeof createBackend>;

export * from "./channels";
export * from "./communities";
export * from "./havenError";
export * from "./media";
export * from "./messages";
export * from "./notifications";
export * from "./people";
export * from "./realtime";
export * from "./records";
export * from "./safety";
export * from "./social";
export * from "./voice";
