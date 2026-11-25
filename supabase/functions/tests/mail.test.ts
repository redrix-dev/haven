// The mail worker: the two safety emails, as Resend would receive them.
// Resend is stood in for by a local server.

import { handle } from "../mail-worker/handler.ts";
import {
  actor,
  assert,
  assertEquals,
  channelId,
  type Fake,
  fakeService,
  jobFor,
  quietQueue,
  random,
  rpc,
  test,
  wake,
} from "./_support.ts";

type Mail = {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  text: string;
};

const STAFF = "staff@haven.test";

/** member_b reports a fresh message of member_a's to Haven staff. */
async function openCase(): Promise<string> {
  const memberA = await actor("member_a");
  const message = await rpc<{ id: string }>(memberA, "send_message", {
    p_channel_id: await channelId("general"),
    p_body: `function test ${random()}`,
  });
  return await rpc<string>(await actor("member_b"), "file_platform_case", {
    p_subject_kind: "message",
    p_subject_id: message.id,
    p_reason: "function test",
  });
}

async function withResend(
  status: number,
  run: (resend: Fake) => Promise<void>,
): Promise<void> {
  await quietQueue();
  const resend = fakeService(() => Response.json({ id: random() }, { status }));
  Deno.env.set("RESEND_API_URL", `${resend.url}/emails`);
  Deno.env.set("RESEND_API_KEY", "re_test_key");
  Deno.env.set("HAVEN_STAFF_EMAIL", STAFF);
  Deno.env.set("HAVEN_MAIL_FROM", "Haven <mail@haven.test>");
  try {
    await run(resend);
  } finally {
    await resend.close();
    for (const name of [
      "RESEND_API_URL",
      "RESEND_API_KEY",
      "HAVEN_STAFF_EMAIL",
      "HAVEN_MAIL_FROM",
    ]) {
      Deno.env.delete(name);
    }
  }
}

test("staff are emailed when a case is opened", async () => {
  await withResend(200, async (resend) => {
    const caseId = await openCase();
    const job = await jobFor("email_send", "case_id", caseId);
    assertEquals(job?.status, "pending", "opening a case asks for an email");

    assertEquals((await handle(wake())).status, 200, "the worker runs");
    assertEquals(resend.requests.length, 1, "one email");
    const [request] = resend.requests;
    assertEquals(
      request.method + " " + request.path,
      "POST /emails",
      "to Resend",
    );
    assertEquals(
      request.headers.get("authorization"),
      "Bearer re_test_key",
      "with the API key",
    );
    assertEquals(
      request.headers.get("idempotency-key"),
      `${job?.id}-0`,
      "marked so a retry cannot send it twice",
    );
    const mail = request.json as Mail;
    assertEquals(mail.to, [STAFF], "addressed to staff");
    assertEquals(mail.from, "Haven <mail@haven.test>", "from Haven");
    assert(
      mail.subject.startsWith("New Haven case"),
      "saying a case was opened",
    );
    assert(mail.text.includes(caseId), "and which one");
    assert(
      !mail.text.includes("rls_member_b") &&
        !mail.text.includes((await actor("member_b")).email),
      "without naming the reporter in an email",
    );
    assertEquals(
      (await jobFor("email_send", "case_id", caseId))?.status,
      "done",
      "the job is finished",
    );
  });
});

test("the person staff acted against is sent the reasons, and can reply", async () => {
  await withResend(200, async (resend) => {
    const caseId = await openCase();
    await handle(wake());
    resend.requests.length = 0;

    const decisionId = await rpc<string>(
      await actor("staff_active"),
      "staff_record_decision",
      {
        p_case_id: caseId,
        p_actions: ["content_removed"],
        p_rule: "Harassment",
        p_reason: "Targeted another member.",
      },
    );
    assertEquals(
      (await jobFor("email_send", "decision_id", decisionId))?.status,
      "pending",
      "a decision asks for an email",
    );
    await handle(wake());

    assertEquals(resend.requests.length, 1, "one email");
    const mail = resend.requests[0].json as Mail;
    assertEquals(
      mail.to,
      [(await actor("member_a")).email],
      "to the person the decision is about",
    );
    assertEquals(mail.reply_to, STAFF, "a reply reaches staff");
    assert(
      mail.text.includes("Rule: Harassment") &&
        mail.text.includes("Reason: Targeted another member."),
      "it states the rule and the reason",
    );
    assert(mail.text.includes("content_removed"), "and the action taken");
  });
});

test("an email Resend refuses is tried again later", async () => {
  await withResend(500, async (resend) => {
    const caseId = await openCase();
    const totals = await (await handle(wake())).json();
    assertEquals(totals.failed, 1, "the run reports the failure");
    assertEquals(resend.requests.length, 1, "it was attempted once");
    const job = await jobFor("email_send", "case_id", caseId);
    assertEquals(job?.status, "pending", "the job waits to be retried");
    assert(job?.last_error?.includes("500"), "with the reason kept");
  });
});

test("with no mail service configured the email waits instead of vanishing", async () => {
  await withResend(200, async (resend) => {
    Deno.env.delete("RESEND_API_KEY");
    const caseId = await openCase();
    await handle(wake());
    assertEquals(resend.requests.length, 0, "nothing is sent without a key");
    const job = await jobFor("email_send", "case_id", caseId);
    assertEquals(job?.status, "pending", "the job is kept");
    assert(
      job?.last_error?.includes("RESEND_API_KEY"),
      "and says what is missing",
    );
  });
});
