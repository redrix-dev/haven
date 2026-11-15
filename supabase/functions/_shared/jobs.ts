// The loop every worker runs. The database queues work as rows in
// private.jobs (docs/architecture/DATABASE.md, "Jobs and workers"); a worker
// claims rows of its kind, does each one, and reports how it went.
//
// A job handler returns when the job is finished and throws when it should be
// tried again. The database decides the retry delay and when to give up.

import {
  call,
  type Db,
  describeError,
  isWorkerCall,
  json,
  serviceDb,
} from "./common.ts";

export type Job = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export type JobHandler = (db: Db, job: Job) => Promise<void>;

export type WorkerOptions = {
  /** Jobs claimed at once and run side by side. */
  batch?: number;
  /** How long a claimed job is this worker's before it is handed out again. */
  leaseSeconds?: number;
  /** Stop claiming after this long; the next wake carries on. */
  budgetMs?: number;
  /**
   * Keep looking for this long after the run starts, even when the queue is
   * empty. The database wakes a worker at most once every two seconds, so a
   * job queued just after a wake gets no wake of its own; staying a little
   * longer than that picks it up now instead of at the next minute.
   */
  lingerMs?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function jobWorker(
  handlers: Record<string, JobHandler>,
  options: WorkerOptions = {},
): (req: Request) => Promise<Response> {
  const batch = options.batch ?? 10;
  const leaseSeconds = options.leaseSeconds ?? 120;
  const budgetMs = options.budgetMs ?? 40_000;
  const lingerMs = options.lingerMs ?? 2_500;

  return async (req) => {
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }
    if (!isWorkerCall(req)) return json({ error: "unauthorized" }, 401);

    const db = serviceDb();
    const started = Date.now();
    const totals = { claimed: 0, done: 0, failed: 0 };

    const runOne = async (handler: JobHandler, job: Job) => {
      let error: string | null = null;
      try {
        await handler(db, job);
      } catch (thrown) {
        error = describeError(thrown).slice(0, 1000);
        console.error(`[${job.kind}] job ${job.id} failed: ${error}`);
      }
      try {
        await call(db, "worker_finish_job", {
          p_job_id: job.id,
          p_error: error,
        });
        if (error) totals.failed += 1;
        else totals.done += 1;
      } catch (thrown) {
        // The lease runs out and the job is handed out again.
        console.error(
          `[${job.kind}] could not report job ${job.id}: ${describeError(thrown)}`,
        );
      }
    };

    while (Date.now() - started < budgetMs) {
      let claimedThisRound = 0;
      for (const [kind, handler] of Object.entries(handlers)) {
        const jobs =
          (await call<Job[] | null>(db, "worker_claim_jobs", {
            p_kind: kind,
            p_limit: batch,
            p_lease_seconds: leaseSeconds,
          })) ?? [];
        claimedThisRound += jobs.length;
        await Promise.all(jobs.map((job) => runOne(handler, job)));
      }
      totals.claimed += claimedThisRound;
      if (claimedThisRound > 0) continue;
      if (Date.now() - started >= lingerMs) break;
      await sleep(500);
    }

    return json(totals);
  };
}

/** Reads one string field of a job's payload, or throws: the job is malformed. */
export function payloadText(job: Job, key: string): string {
  const value = job.payload?.[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`job payload has no ${key}`);
  }
  return value;
}
