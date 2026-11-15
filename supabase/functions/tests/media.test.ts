// The media worker against real storage: deleting what nothing uses, leaving
// what a safety case holds, and moving withheld files to the evidence bucket.

import { handle } from "../media-worker/handler.ts";
import {
  type Actor,
  actor,
  assert,
  assertEquals,
  channelId,
  jobFor,
  quietQueue,
  random,
  rpc,
  service,
  sql,
  test,
  wake,
} from "./_support.ts";

type Upload = { id: string; bucket: string; object_path: string };

// The smallest valid PNG: one transparent pixel.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

/** A message with one real file on it, sent the way the apps send one. */
async function messageWithFile(
  who: Actor,
): Promise<{ messageId: string; file: Upload }> {
  const file = await rpc<Upload>(who, "create_upload", {
    p_purpose: "attachment",
    p_mime_type: "image/png",
    p_size_bytes: PNG.byteLength,
    p_filename: `fn-test-${random()}.png`,
  });
  const { error } = await who.db.storage
    .from(file.bucket)
    .upload(file.object_path, PNG, { contentType: "image/png" });
  if (error) throw new Error(`upload: ${error.message}`);
  const message = await rpc<{ id: string }>(who, "send_message", {
    p_channel_id: await channelId("general"),
    p_body: "a file",
    p_attachment_ids: [file.id],
  });
  return { messageId: message.id, file };
}

async function stored(bucket: string, path: string): Promise<boolean> {
  const { data } = await service.storage.from(bucket).exists(path);
  return data === true;
}

test("deleting a message deletes its file from storage", async () => {
  await quietQueue();
  const memberA = await actor("member_a");
  const { messageId, file } = await messageWithFile(memberA);
  assert(await stored("media", file.object_path), "the file was uploaded");

  await rpc(memberA, "delete_message", { p_message_id: messageId });
  assertEquals(
    (await jobFor("media_delete", "media_id", file.id))?.status,
    "pending",
    "the database asks for the file to be deleted",
  );

  assertEquals((await handle(wake())).status, 200, "the worker runs");
  assert(!(await stored("media", file.object_path)), "the bytes are gone");
  const rows = await sql`select 1 from public.media where id = ${file.id}`;
  assertEquals(rows.length, 0, "and so is the row");
  assertEquals(
    (await jobFor("media_delete", "media_id", file.id))?.status,
    "done",
    "the job is finished",
  );
});

test("a file held by a safety case survives, and a flagged one moves to evidence", async () => {
  await quietQueue();
  const memberA = await actor("member_a");
  const memberB = await actor("member_b");
  const staff = await actor("staff_active");
  const { messageId, file } = await messageWithFile(memberA);

  const caseId = await rpc<string>(memberB, "file_platform_case", {
    p_subject_kind: "message",
    p_subject_id: messageId,
    p_reason: "function test",
  });
  await rpc(memberA, "delete_message", { p_message_id: messageId });
  // The race the worker must survive: a delete job that was queued before the
  // case existed.
  await sql`select private.enqueue_job('media_delete', ${sql.json({ media_id: file.id })})`;

  await handle(wake());
  assert(
    await stored("media", file.object_path),
    "the worker does not delete a file a case holds",
  );
  const [held] =
    await sql`select status from public.media where id = ${file.id}`;
  assertEquals(held?.status, "released", "the row is kept too");
  assertEquals(
    (await jobFor("media_delete", "media_id", file.id))?.status,
    "done",
    "the delete job ends without doing anything",
  );

  await rpc(staff, "staff_flag_csam", { p_case_id: caseId });
  assertEquals(
    (await jobFor("media_quarantine", "media_id", file.id))?.status,
    "pending",
    "flagging asks for the file to be moved",
  );
  await handle(wake());
  assert(
    !(await stored("media", file.object_path)),
    "the file is no longer where the apps could reach it",
  );
  assert(
    await stored("evidence", file.object_path),
    "it is in the evidence bucket",
  );
  const [moved] =
    await sql`select bucket from public.media where id = ${file.id}`;
  assertEquals(moved?.bucket, "evidence", "and the row says so");
  const events = await sql`
    select 1 from public.platform_case_events
    where case_id = ${caseId} and kind = 'media_quarantined'`;
  assertEquals(events.length, 1, "the case records the move");

  // A second run (a retry after a crash) changes nothing.
  await sql`select private.enqueue_job('media_quarantine', ${sql.json({ media_id: file.id })})`;
  await handle(wake());
  assert(await stored("evidence", file.object_path), "a repeat leaves it be");
});

test("a move that finished before the worker died is not treated as a failure", async () => {
  await quietQueue();
  const memberA = await actor("member_a");
  const memberB = await actor("member_b");
  const staff = await actor("staff_active");
  const { messageId, file } = await messageWithFile(memberA);
  const caseId = await rpc<string>(memberB, "file_platform_case", {
    p_subject_kind: "message",
    p_subject_id: messageId,
    p_reason: "function test",
  });
  await rpc(staff, "staff_flag_csam", { p_case_id: caseId });

  // The file is moved, but the database was never told.
  const { error } = await service.storage
    .from("media")
    .move(file.object_path, file.object_path, {
      destinationBucket: "evidence",
    });
  if (error) throw new Error(`setting the scene: ${error.message}`);

  await handle(wake());
  const job = await jobFor("media_quarantine", "media_id", file.id);
  assertEquals(job?.status, "done", "the retry sees the file is already there");
  const [moved] =
    await sql`select bucket from public.media where id = ${file.id}`;
  assertEquals(moved?.bucket, "evidence", "and records it");
});
