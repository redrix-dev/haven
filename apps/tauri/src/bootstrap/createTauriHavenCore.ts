import { createSolidHavenCore, type HavenSolidCore } from "@solid-client/core";
import {
  getTauriSupabase,
  getTauriSupabaseConfig,
} from "../supabase/getTauriSupabase";
import { createTauriPersistence } from "../lib/createTauriPersistence";

export function createTauriHavenCore(): HavenSolidCore {
  const client = getTauriSupabase();

  return createSolidHavenCore({
    client,
    publicConfig: getTauriSupabaseConfig(),
    persistence: createTauriPersistence(),
  });
}
