import {
  authenticateUser,
  createServiceClient,
  jsonResponse,
  okOptionsResponse,
  parseJsonBody,
  requireSupabaseEnv,
  verifyCronSecret,
} from "../_shared/common.ts";

type MaintenanceRequest = {
  mode?: "cron" | "authenticated-fallback";
  maxDeletionJobs?: number;
};

type DeletionJobRow = {
  id: string;
  attachment_id: string | null;
  message_id: string | null;
  community_id: string | null;
  bucket_name: string;
  object_path: string;
  reason: string;
  attempts: number;
  status: string;
  available_at: string;
  created_at: string;
};

const clampInt = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
};

const isMissingObjectError = (message: string): boolean => {
  const lower = message.toLowerCase();
  return (
    lower.includes("not found") ||
    lower.includes("no such") ||
    lower.includes("does not exist")
  );
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return okOptionsResponse();

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const isCron = verifyCronSecret(req);
  if (!isCron) {
    try {
      await authenticateUser(req);
    } catch (error) {
      return jsonResponse(
        {
          code: 401,
          message: error instanceof Error ? error.message : "Unauthorized",
        },
        401,
      );
    }
  }

  let env;
  try {
    env = requireSupabaseEnv();
  } catch (error) {
    return jsonResponse(
      {
        code: 500,
        message: error instanceof Error ? error.message : "Missing env",
      },
      500,
    );
  }

  const body = (await parseJsonBody<MaintenanceRequest>(req)) ?? {};
  const maxDeletionJobs = clampInt(
    body.maxDeletionJobs,
    1,
    isCron ? 500 : 150,
    isCron ? 150 : 50,
  );

  const supabaseAdmin = createServiceClient(
    env.supabaseUrl,
    env.serviceRoleKey,
  );

  let claimedDeletionJobs = 0;
  let deletedObjects = 0;
  let retryableFailures = 0;
  let deadLetters = 0;

  // Media does not expire (HAV-19). This worker only removes storage objects
  // whose attachment rows were deleted: by a message, account or community
  // deletion, through the deletion job queue.
  const { data: claimedJobs, error: claimError } = await supabaseAdmin.rpc(
    "claim_message_attachment_deletion_jobs",
    { p_limit: maxDeletionJobs, p_lease_seconds: isCron ? 90 : 60 },
  );
  if (claimError) {
    console.error("message-media-maintenance claim rpc failed:", claimError);
    return jsonResponse(
      { code: 500, message: "Failed to claim media deletion jobs" },
      500,
    );
  }

  const jobs = (claimedJobs ?? []) as DeletionJobRow[];
  claimedDeletionJobs = jobs.length;

  for (const job of jobs) {
    try {
      const { error: removeError } = await supabaseAdmin.storage
        .from(job.bucket_name)
        .remove([job.object_path]);
      if (removeError) {
        if (isMissingObjectError(removeError.message ?? "")) {
          const { error: completeErr } = await supabaseAdmin.rpc(
            "complete_message_attachment_deletion_job",
            {
              p_job_id: job.id,
              p_outcome: "done",
              p_error: null,
              p_retry_delay_seconds: 60,
            },
          );
          if (completeErr)
            console.error(
              "Failed completing missing-object deletion job as done",
              completeErr,
            );
          deletedObjects += 1;
          continue;
        }
        throw new Error(removeError.message);
      }

      const { error: completeErr } = await supabaseAdmin.rpc(
        "complete_message_attachment_deletion_job",
        {
          p_job_id: job.id,
          p_outcome: "done",
          p_error: null,
          p_retry_delay_seconds: 60,
        },
      );
      if (completeErr) {
        console.error("Failed completing deletion job:", completeErr);
        retryableFailures += 1;
        continue;
      }
      deletedObjects += 1;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const shouldDeadLetter = (job.attempts ?? 1) >= 5;
      const outcome = shouldDeadLetter ? "dead_letter" : "retryable_failed";
      const retryDelaySeconds = shouldDeadLetter
        ? 300
        : Math.min(900, 30 * Math.max(job.attempts ?? 1, 1));

      const { error: completeErr } = await supabaseAdmin.rpc(
        "complete_message_attachment_deletion_job",
        {
          p_job_id: job.id,
          p_outcome: outcome,
          p_error: errorMessage,
          p_retry_delay_seconds: retryDelaySeconds,
        },
      );
      if (completeErr) {
        console.error(
          "Failed updating deletion job failure outcome:",
          completeErr,
        );
      }

      if (shouldDeadLetter) {
        deadLetters += 1;
      } else {
        retryableFailures += 1;
      }
    }
  }

  return jsonResponse({
    mode: isCron ? "cron" : "authenticated-fallback",
    claimedDeletionJobs,
    deletedObjects,
    retryableFailures,
    deadLetters,
  });
});
