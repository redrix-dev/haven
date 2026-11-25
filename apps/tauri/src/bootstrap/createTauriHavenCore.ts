import { createSolidHavenCore, type HavenSolidCore } from "@solid-client/core";
import { getTauriSupabase } from "../supabase/getTauriSupabase";
import { createTauriPersistence } from "../lib/createTauriPersistence";

export async function createTauriHavenCore(): Promise<HavenSolidCore> {
  return createSolidHavenCore({
    client: getTauriSupabase(),
    persistence: await createTauriPersistence(),
    context: { platform: "desktop", distribution: "all" },
  });
}
