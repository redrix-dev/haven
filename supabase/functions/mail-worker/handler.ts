// Sends the two emails the safety system needs, through Resend: a notice to
// Haven staff that a case was opened, and the statement of reasons to a person
// staff took action against. The database writes the words
// (worker_email_content); this worker only delivers them.

import { call, type Db, env, requireEnv } from "../_shared/common.ts";
import {
  type Job,
  type JobHandler,
  jobWorker,
  payloadText,
} from "../_shared/jobs.ts";

type Email = { to_email: string | null; subject: string; body: string };

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Haven <alerts@redrixx.com>";
const DEFAULT_STAFF = "legal@redrixx.com";

export const sendEmail: JobHandler = async (db: Db, job: Job) => {
  const decisionId = job.payload?.decision_id;
  const emails =
    (await call<Email[] | null>(db, "worker_email_content", {
      p_template: payloadText(job, "template"),
      p_case_id: payloadText(job, "case_id"),
      p_decision_id: typeof decisionId === "string" ? decisionId : null,
    })) ?? [];
  // The case or the account is gone: there is nobody to write to.
  if (emails.length === 0) return;

  const apiKey = requireEnv("RESEND_API_KEY");
  const staff = env("HAVEN_STAFF_EMAIL") ?? DEFAULT_STAFF;
  for (const [index, email] of emails.entries()) {
    const response = await fetch(env("RESEND_API_URL") ?? RESEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        // A retry after a lost answer must not send the same email twice.
        "idempotency-key": `${job.id}-${index}`,
      },
      body: JSON.stringify({
        from: env("HAVEN_MAIL_FROM") ?? DEFAULT_FROM,
        // No address means the mail is for staff.
        to: [email.to_email ?? staff],
        // The statement of reasons says "reply to this email".
        reply_to: staff,
        subject: email.subject,
        text: email.body,
      }),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`Resend answered ${response.status}: ${detail}`);
    }
  }
};

export const handle = jobWorker({ email_send: sendEmail });
