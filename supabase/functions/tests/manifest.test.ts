// update-manifest: which release a phone is offered.

import { handle } from "../update-manifest/handler.ts";
import {
  assertEquals,
  fakeService,
  random,
  service,
  sql,
  test,
} from "./_support.ts";

function ask(runtimeVersion: string, currentUpdateId?: string): Request {
  return new Request("http://manifest.test/", {
    headers: {
      "expo-runtime-version": runtimeVersion,
      "expo-channel-name": "production",
      "expo-platform": "ios",
      ...(currentUpdateId ? { "expo-current-update-id": currentUpdateId } : {}),
    },
  });
}

test("a phone is offered the newest active release for its runtime", async () => {
  const runtime = `fn-test-${random()}`;
  const bundles = fakeService(
    () =>
      new Response("console.log('bundle')", {
        headers: { "content-type": "application/javascript" },
      }),
  );
  // The release tooling brings its own random ids, so the newest release can
  // have the lowest id. "Newest" has to mean by time.
  const older = "ffffffff-0000-4000-8000-000000000001";
  const newer = "00000000-0000-4000-8000-000000000002";
  try {
    await sql`delete from public.ota_releases where id in (${older}, ${newer})`;
    const { error } = await service.from("ota_releases").insert([
      {
        id: older,
        channel: "production",
        runtime_version: runtime,
        bundle_url: `${bundles.url}/older.js`,
        note: "older",
        git_sha: "aaa",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: newer,
        channel: "production",
        runtime_version: runtime,
        bundle_url: `${bundles.url}/newer.js`,
        note: "newer",
        git_sha: "bbb",
        created_at: "2026-02-01T00:00:00Z",
      },
    ]);
    if (error)
      throw new Error(`the release tooling's insert failed: ${error.message}`);

    const response = await handle(ask(runtime));
    assertEquals(response.status, 200, "there is an update");
    const manifest = await response.json();
    assertEquals(manifest.id, newer, "it is the newer release");
    assertEquals(
      manifest.launchAsset.url,
      `${bundles.url}/newer.js`,
      "pointing at that release's bundle",
    );
    assertEquals(manifest.extra.otaReleaseNote, "newer", "with its note");

    assertEquals(
      (await handle(ask(runtime, newer))).status,
      204,
      "a phone already on it is told there is nothing new",
    );
    assertEquals(
      (await handle(ask(`other-${runtime}`))).status,
      204,
      "a different runtime version gets nothing",
    );

    await sql`update public.ota_releases set active = false where id = ${newer}`;
    assertEquals(
      (await (await handle(ask(runtime))).json()).id,
      older,
      "a withdrawn release is skipped",
    );
  } finally {
    await sql`delete from public.ota_releases where id in (${older}, ${newer})`;
    await bundles.close();
  }
});
