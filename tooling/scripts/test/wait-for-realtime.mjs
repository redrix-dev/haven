// After `supabase db reset` the stack is back before Realtime can carry the
// database's broadcasts: a subscription says SUBSCRIBED, but what the
// database sends in the next few seconds is lost. The first contract test that
// listens for an event then fails with "nothing arrived". Seen twice
// (2026-11-18, 2026-11-20), reproduced by running test:db and then
// communities.contract on its own.
//
// This waits until a broadcast sent from the database, the way every app event
// is sent (`realtime.send`), actually reaches a subscriber.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const send = (postgresUrl, topic) =>
  execFileSync(
    "psql",
    [
      postgresUrl,
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `select realtime.send('{}'::jsonb, 'probe', '${topic}', false)`,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );

/**
 * Resolves once Realtime delivers a database broadcast; throws after
 * `timeoutMs`. Returns how long that took.
 */
export async function waitForRealtime(localEnv, timeoutMs = 60_000) {
  const started = Date.now();
  const client = createClient(localEnv.API_URL, localEnv.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const topic = `readiness-${randomUUID()}`;
  let heard = false;
  const channel = client
    .channel(topic)
    .on("broadcast", { event: "probe" }, () => {
      heard = true;
    })
    .subscribe();
  try {
    while (!heard) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(
          `Realtime did not deliver a database broadcast within ${timeoutMs / 1000}s.`,
        );
      }
      if (channel.state === "joined") send(localEnv.POSTGRES_URL, topic);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return Date.now() - started;
  } finally {
    await client.removeChannel(channel);
    client.realtime.disconnect();
  }
}
