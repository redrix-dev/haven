// `npm run devdb -- smoke`: proves the dev backend answers the way a client
// needs it to, from this machine, over whatever network sits in between.
// Uses the anon key and a seeded member's password, exactly like the apps.

import { createClient } from "@supabase/supabase-js";

const MEMBER = {
  email: "rls-member-a@example.test",
  password: "HavenTest!MemberA1",
};

export async function smoke({ apiUrl, anonKey }) {
  const results = [];
  const check = (name, ok, detail) => {
    results.push(ok);
    console.log(
      `[devdb:smoke] ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`,
    );
  };

  const client = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signIn = await client.auth.signInWithPassword(MEMBER);
  check("auth: seeded member signs in", !signIn.error, signIn.error?.message);
  if (signIn.error) return false;

  const community = await client
    .from("communities")
    .select("id")
    .eq("name", "DEV: Hearth")
    .maybeSingle();
  check(
    "rest: member reads DEV: Hearth",
    Boolean(community.data),
    community.error?.message,
  );
  if (!community.data) return false;

  const channels = await client
    .from("channels")
    .select("name")
    .eq("community_id", community.data.id);
  const names = (channels.data ?? []).map((row) => row.name).sort();
  check(
    "rls: member sees dev-chat but not staff-room",
    names.includes("dev-chat") && !names.includes("staff-room"),
    names.join(", "),
  );

  const scrollback = await client
    .from("messages")
    .select("id, channels!inner(name)", { count: "exact", head: true })
    .eq("channels.name", "scrollback");
  check(
    "seed: #scrollback holds 3000 messages",
    scrollback.count === 3000,
    `count ${scrollback.count}`,
  );

  const requests = await client.rpc("list_my_friend_requests");
  check(
    "rpc: list_my_friend_requests answers",
    !requests.error,
    requests.error?.message,
  );

  // Realtime: a websocket has to survive the trip, not just HTTP.
  const echoed = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 15_000);
    const channel = client.channel(`devdb-smoke-${Date.now()}`, {
      config: { broadcast: { self: true } },
    });
    channel
      .on("broadcast", { event: "ping" }, () => {
        clearTimeout(timer);
        resolve(true);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.send({ type: "broadcast", event: "ping", payload: {} });
        }
      });
  });
  check("realtime: websocket broadcast round-trips", echoed);

  const bucket = await client.storage.listBuckets();
  check("storage: API answers", !bucket.error, bucket.error?.message);

  const fn = await fetch(`${apiUrl}/functions/v1/voice-token`, {
    method: "OPTIONS",
    headers: { apikey: anonKey },
  });
  check(
    "functions: edge runtime answers",
    fn.status < 500,
    `HTTP ${fn.status}`,
  );

  await client.removeAllChannels();
  await client.auth.signOut();
  return results.every(Boolean);
}
