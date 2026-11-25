// The loop every worker shares (_shared/jobs.ts), exercised through the media
// worker because it needs nothing outside Haven.

import { handle } from "../media-worker/handler.ts";
import {
  assert,
  assertEquals,
  jobFor,
  quietQueue,
  random,
  sql,
  test,
  wake,
} from "./_support.ts";

const noSuchFile = () => crypto.randomUUID();

test("a worker lets in only a caller with the worker secret", async () => {
  await quietQueue();
  assertEquals((await handle(wake(null))).status, 401, "no secret is refused");
  assertEquals(
    (await handle(wake("not-the-secret-at-all"))).status,
    401,
    "a wrong secret is refused",
  );
  assertEquals(
    (await handle(new Request("http://worker.test/", { method: "GET" })))
      .status,
    405,
    "only POST is answered",
  );

  // A function deployed without the secret must not fall open to "no header".
  Deno.env.delete("HAVEN_WORKER_CRON_SECRET");
  assertEquals(
    (await handle(wake(""))).status,
    401,
    "with no secret configured nobody is let in",
  );
  Deno.env.set("HAVEN_WORKER_CRON_SECRET", "short");
  assertEquals(
    (await handle(wake("short"))).status,
    401,
    "a secret too short to be one is not accepted",
  );
});

test("a job that fails is reported and waits to be tried again", async () => {
  await quietQueue();
  const marker = random();
  // No media_id: the handler cannot do this job.
  await sql`select private.enqueue_job('media_delete', ${sql.json({ marker })})`;

  const response = await handle(wake());
  const totals = await response.json();
  assertEquals(response.status, 200, "the run itself succeeds");
  assertEquals(
    totals,
    { claimed: 1, done: 0, failed: 1 },
    "it is counted as failed",
  );

  const job = await jobFor("media_delete", "marker", marker);
  assert(job, "the job is still there");
  assertEquals(job.status, "pending", "it goes back to waiting");
  assertEquals(job.attempts, 1, "the attempt is counted");
  assert(job.last_error?.includes("media_id"), "the reason is kept");
  assert(job.run_at.getTime() > Date.now(), "it is not tried again at once");
});

test("a job queued just after a wake is done by the same run", async () => {
  await quietQueue();
  const mediaId = noSuchFile();
  const running = handle(wake());
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await sql`select private.enqueue_job('media_delete', ${sql.json({ media_id: mediaId })})`;

  const totals = await (await running).json();
  assertEquals(totals.claimed, 1, "the run was still looking a second later");
  const job = await jobFor("media_delete", "media_id", mediaId);
  assertEquals(job?.status, "done", "and finished the job");
});

test("two runs at once never do the same job twice", async () => {
  await quietQueue();
  const marker = random();
  for (let i = 0; i < 12; i += 1) {
    await sql`select private.enqueue_job('media_delete', ${sql.json({ marker, media_id: noSuchFile() })})`;
  }
  const [first, second] = await Promise.all([handle(wake()), handle(wake())]);
  const a = await first.json();
  const b = await second.json();
  assertEquals(a.claimed + b.claimed, 12, "every job was claimed exactly once");
  const [{ count }] = await sql`
    select count(*)::int from private.jobs
    where payload ->> 'marker' = ${marker} and status = 'done' and attempts = 1`;
  assertEquals(count, 12, "and each was done once");
});

test("one run keeps going until the queue is empty, batch after batch", async () => {
  await quietQueue();
  const marker = random();
  // More than one batch (ten) and more than two.
  for (let i = 0; i < 25; i += 1) {
    await sql`select private.enqueue_job('media_delete', ${sql.json({ marker, media_id: noSuchFile() })})`;
  }
  const totals = await (await handle(wake())).json();
  assertEquals(totals.claimed, 25, "a single run did all of them");
  const [{ count }] = await sql`
    select count(*)::int from private.jobs
    where payload ->> 'marker' = ${marker} and status = 'done'`;
  assertEquals(count, 25, "and every one is finished");
});
