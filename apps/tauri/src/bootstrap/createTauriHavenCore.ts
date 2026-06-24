import { createSolidHavenCore, type HavenSolidCore } from "@solid-client/core";
import {
  getTauriSupabase,
  getTauriSupabaseConfig,
} from "../supabase/getTauriSupabase";
import { createTauriPersistence } from "../lib/createTauriPersistence";

export async function createTauriHavenCore(): Promise<HavenSolidCore> {
  const client = getTauriSupabase();
  const persistence = await createTauriPersistence();

  return createSolidHavenCore({
    client,
    publicConfig: getTauriSupabaseConfig(),
    persistence,
  });
}
