// Fills in a link's preview: fetches the page, keeps a copy of its picture in
// the public `previews` bucket, and hands the result to the database, which
// tells everyone looking at a message with that link.

import { call, type Db } from "../_shared/common.ts";
import {
  type Job,
  type JobHandler,
  jobWorker,
  payloadText,
} from "../_shared/jobs.ts";
import {
  fetchImage,
  imagePath,
  type Network,
  PreviewRefused,
  PreviewUnavailable,
  resolvePreview,
} from "./preview.ts";

const PREVIEW_BUCKET = "previews";
// A site that is down three times in a row gets no preview. Without this the
// row would stay "pending" for as long as the job kept retrying.
const GIVE_UP_AFTER_ATTEMPTS = 3;

/** Copies the page's picture into our bucket. A preview is fine without one. */
async function cacheImage(
  net: Network,
  db: Db,
  imageUrl: string,
): Promise<string | null> {
  try {
    const image = await fetchImage(net, imageUrl);
    const path = await imagePath(image);
    const { error } = await db.storage
      .from(PREVIEW_BUCKET)
      .upload(path, image.bytes, {
        contentType: image.mimeType,
        cacheControl: "31536000",
        // The path is the picture's own hash: the same bytes, the same file.
        upsert: true,
      });
    if (error) throw new PreviewUnavailable(`storage: ${error.message}`);
    return path;
  } catch (error) {
    if (
      error instanceof PreviewRefused ||
      error instanceof PreviewUnavailable
    ) {
      return null;
    }
    throw error;
  }
}

export function linkPreviewJob(net: Network): JobHandler {
  return async (db: Db, job: Job) => {
    const previewId = payloadText(job, "preview_id");
    const url = await call<string | null>(db, "worker_link_preview_url", {
      p_preview_id: previewId,
    });
    if (!url) return;

    let result: Record<string, unknown>;
    try {
      const preview = await resolvePreview(net, url);
      result = {
        p_status: preview.status,
        p_title: preview.title,
        p_description: preview.description,
        p_site_name: preview.siteName,
        p_image_path: preview.imageUrl
          ? await cacheImage(net, db, preview.imageUrl)
          : null,
        p_embed_provider: preview.embedProvider,
        p_embed_id: preview.embedId,
      };
    } catch (error) {
      const temporary = error instanceof PreviewUnavailable;
      // Anything else is a fault of ours or the database's: let the job retry.
      if (!temporary && !(error instanceof PreviewRefused)) throw error;
      if (temporary && job.attempts < GIVE_UP_AFTER_ATTEMPTS) throw error;
      result = { p_status: "failed", p_error: error.message.slice(0, 300) };
    }
    await call(db, "worker_link_preview_result", {
      p_preview_id: previewId,
      ...result,
    });
  };
}

/** The real internet. DNS answers are looked at before anything is fetched. */
export const internet: Network = {
  fetch: (url, init) => fetch(url, init),
  resolve: async (hostname) => {
    const lookups = await Promise.allSettled([
      Deno.resolveDns(hostname, "A"),
      Deno.resolveDns(hostname, "AAAA"),
    ]);
    return lookups.flatMap((lookup) =>
      lookup.status === "fulfilled" ? lookup.value : [],
    );
  },
};

export const handle = jobWorker(
  { link_preview: linkPreviewJob(internet) },
  { batch: 5 },
);
