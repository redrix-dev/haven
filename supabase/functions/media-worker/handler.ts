// The two things done to stored files that the database cannot do itself:
// deleting the bytes of a file nothing uses any more, and moving a withheld
// file into the evidence bucket.
//
// The database is asked again, at the moment of acting, whether the file may
// still be touched (worker_media_to_delete / worker_media_to_quarantine). A
// safety case can be filed between the job being queued and it running, and a
// held file must not be deleted.

import { call, type Db } from "../_shared/common.ts";
import {
  type Job,
  type JobHandler,
  jobWorker,
  payloadText,
} from "../_shared/jobs.ts";

type StoredFile = { bucket: string; object_path: string };

const EVIDENCE_BUCKET = "evidence";

export const deleteMedia: JobHandler = async (db: Db, job: Job) => {
  const mediaId = payloadText(job, "media_id");
  const [file] =
    (await call<StoredFile[] | null>(db, "worker_media_to_delete", {
      p_media_id: mediaId,
    })) ?? [];
  // Held by a case, put back to use, or already gone.
  if (!file) return;

  // Removing a file that is not there is not an error to storage, so a retry
  // after a half-finished run is safe.
  const { error } = await db.storage
    .from(file.bucket)
    .remove([file.object_path]);
  if (error) throw new Error(`storage remove: ${error.message}`);
  await call(db, "worker_media_deleted", { p_media_id: mediaId });
};

export const quarantineMedia: JobHandler = async (db: Db, job: Job) => {
  const mediaId = payloadText(job, "media_id");
  const [file] =
    (await call<StoredFile[] | null>(db, "worker_media_to_quarantine", {
      p_media_id: mediaId,
    })) ?? [];
  // Not withheld, or already moved.
  if (!file) return;

  const { error } = await db.storage
    .from(file.bucket)
    .move(file.object_path, file.object_path, {
      destinationBucket: EVIDENCE_BUCKET,
    });
  if (error) {
    // A run that moved the file and then died leaves it in evidence with the
    // row still pointing at the old bucket. That is a finished move.
    const { data: alreadyMoved } = await db.storage
      .from(EVIDENCE_BUCKET)
      .exists(file.object_path);
    if (!alreadyMoved) throw new Error(`storage move: ${error.message}`);
  }
  await call(db, "worker_media_quarantined", { p_media_id: mediaId });
};

export const handle = jobWorker({
  media_delete: deleteMedia,
  media_quarantine: quarantineMedia,
});
