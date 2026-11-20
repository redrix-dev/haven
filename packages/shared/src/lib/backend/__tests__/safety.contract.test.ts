import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  actor,
  type Actor,
  eventually,
  hearthChannelId,
  hearthId,
  signOutAll,
  staffActor,
} from "@test-support/setup/supabaseLocal";
import type { HavenEvent } from "@shared/lib/backend";

// Every call in the reports and cases collections, through the real backend
// clients, against local Supabase. REPORTING.md has the product rules; the
// SQL suite (supabase/tests/sql) has the database's own edge cases.

// The smallest valid PNG: one transparent pixel.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

/** What one person hears on their own channel, until `stop`. */
async function listen(person: Actor) {
  const heard: HavenEvent[] = [];
  let connected = false;
  const stop = person.backend.realtime.subscribeToMyEvents(person.id, {
    onEvent: (event) => heard.push(event),
    onConnected: () => {
      connected = true;
    },
  });
  await eventually(() => connected);
  return { heard, stop };
}

/** The person's newest notification of this kind. */
async function newest(person: Actor, kind: string) {
  const inbox = await person.backend.notifications.listNotifications();
  return inbox.find((n) => n.kind === kind);
}

describe.sequential("reports and cases (contract)", { timeout: 20_000 }, () => {
  afterAll(signOutAll);

  it("a community report reaches the moderators, who work it, and the reporter hears it was reviewed", async () => {
    const memberA = await actor("member_a");
    const memberB = await actor("member_b");
    const owner = await actor("community_owner");
    const sent = await memberA.backend.messages.sendMessage(
      hearthChannelId("general"),
      { nonce: randomUUID(), body: "something reportable" },
    );

    const moderator = await listen(owner);
    try {
      const reportId = await memberB.backend.safety.fileCommunityReport(
        hearthId(),
        { kind: "message", id: sent.id },
        "contract test",
      );
      // A second tap gives back the open report, not another one.
      expect(
        await memberB.backend.safety.fileCommunityReport(
          hearthId(),
          { kind: "message", id: sent.id },
          "again",
        ),
      ).toBe(reportId);

      // Moderators hear it at once, with the evidence and without the reporter.
      const created = await eventually(() =>
        moderator.heard.find(
          (e) => e.event === "report.created" && e.payload.id === reportId,
        ),
      );
      expect(created.payload).toMatchObject({
        community_id: hearthId(),
        status: "open",
      });
      expect(JSON.stringify(created.payload)).not.toContain(memberB.id);
      const listed = (
        await owner.backend.safety.listCommunityReports(hearthId())
      ).find((r) => r.id === reportId);
      expect(listed?.snapshot.message?.body).toBe("something reportable");
      expect(JSON.stringify(listed)).not.toContain(memberB.id);

      // Not a moderator: refused. The person reported is never shown it.
      await expect(
        memberA.backend.safety.listCommunityReports(hearthId()),
      ).rejects.toMatchObject({
        kind: "forbidden",
        reason: "missing_permission",
      });

      // Status and notes each come back as report.updated.
      await owner.backend.safety.setCommunityReportStatus(
        reportId,
        "in_review",
      );
      await eventually(() =>
        moderator.heard.find(
          (e) =>
            e.event === "report.updated" &&
            e.payload.id === reportId &&
            e.payload.status === "in_review",
        ),
      );
      const note = await owner.backend.safety.addReportNote(
        reportId,
        "  looked at it  ",
      );
      expect(note).toMatchObject({ report_id: reportId, body: "looked at it" });
      expect(
        (await owner.backend.safety.listReportNotes(reportId)).map((n) => n.id),
      ).toEqual([note.id]);
      expect(await memberA.backend.safety.listReportNotes(reportId)).toEqual(
        [],
      );

      // Closing it tells the reporter it was looked at, not what was decided.
      await owner.backend.safety.setCommunityReportStatus(reportId, "resolved");
      const outcome = await newest(memberB, "report_outcome");
      expect(outcome?.body).toBe(
        "The moderators of TEST: Hearth reviewed your report.",
      );
      expect(
        (await memberB.backend.safety.listMyReports()).find(
          (r) => r.id === reportId,
        ),
      ).toMatchObject({ audience: "community", status: "resolved" });
    } finally {
      moderator.stop();
    }
  });

  it("an escalated report becomes a Haven case and leaves the community's hands", async () => {
    const memberA = await actor("member_a");
    const memberB = await actor("member_b");
    const owner = await actor("community_owner");
    const staff = await staffActor();

    const reportId = await memberA.backend.safety.fileCommunityReport(
      hearthId(),
      { kind: "member", id: memberB.id },
      "keeps harassing people",
    );
    const caseId = await owner.backend.safety.escalateCommunityReport(
      reportId,
      "beyond what we can handle",
    );

    const report = (
      await owner.backend.safety.listCommunityReports(hearthId())
    ).find((r) => r.id === reportId);
    expect(report?.status).toBe("escalated");
    await expect(
      owner.backend.safety.setCommunityReportStatus(reportId, "resolved"),
    ).rejects.toMatchObject({ kind: "conflict", reason: "report_escalated" });

    const file = await staff.backend.safety.loadCase(caseId);
    expect(file?.case).toMatchObject({
      source: "escalation",
      community_report_id: reportId,
      subject_user_id: memberB.id,
      reporter_id: owner.id,
    });
    expect(file?.events.map((e) => e.kind)).toEqual(["filed"]);
  });

  it("a Haven report goes to staff only, and staff work needs a second factor", async () => {
    const memberA = await actor("member_a");
    const memberB = await actor("member_b");
    const passwordOnly = await actor("platform_staff_active");
    const staff = await staffActor();

    const caseId = await memberB.backend.safety.fileHavenReport(
      { kind: "profile", id: memberA.id },
      "impersonating someone",
    );
    const received = await newest(memberB, "report_received");
    expect(received).toMatchObject({
      case_id: caseId,
      body: "Haven staff will review your report.",
    });
    expect(
      (await memberB.backend.safety.listMyReports()).find(
        (r) => r.id === caseId,
      ),
    ).toMatchObject({ audience: "haven", status: "open" });

    // A password alone reads nothing and does nothing.
    expect(await passwordOnly.backend.safety.listCases()).toEqual([]);
    expect(await passwordOnly.backend.safety.loadCase(caseId)).toBeNull();
    await expect(
      passwordOnly.backend.safety.setCaseStatus(caseId, "in_review"),
    ).rejects.toMatchObject({
      kind: "forbidden",
      reason: "second_factor_required",
    });
    // Nor does a person who is not staff.
    expect(await memberB.backend.safety.listCases()).toEqual([]);

    const queue = await staff.backend.safety.listCases({ status: "open" });
    expect(queue.map((c) => c.id)).toContain(caseId);
    const older = await staff.backend.safety.listCases({
      before_id: caseId,
      limit: 200,
    });
    expect(older.map((c) => c.id)).not.toContain(caseId);

    await staff.backend.safety.setCaseStatus(caseId, "in_review");
    await staff.backend.safety.addCaseNote(caseId, "checking the profile");
    const decisionId = await staff.backend.safety.recordDecision(caseId, {
      actions: [],
    });
    const file = await staff.backend.safety.loadCase(caseId);
    expect(file?.case.status).toBe("no_action");
    expect(file?.events.map((e) => e.kind)).toEqual([
      "filed",
      "status_changed",
      "note",
      "decision",
    ]);
    expect(file?.decisions.map((d) => d.id)).toEqual([decisionId]);

    const outcome = await newest(memberB, "report_outcome");
    expect(outcome).toMatchObject({
      case_id: caseId,
      body: "Haven staff reviewed your report and did not find a violation.",
    });
    // No action is not a decision about memberA. (Cases outlive the fixture
    // reload, so earlier runs' decisions may be there: look at this one.)
    expect(
      (await memberA.backend.safety.listDecisionsAboutMe()).map(
        (d) => d.case_id,
      ),
    ).not.toContain(caseId);
  });

  it("a DM report files a Haven case; acting on it removes the message and tells both people", async () => {
    const memberA = await actor("member_a");
    const memberB = await actor("member_b");
    const staff = await staffActor();

    // They share a community; memberB takes DMs from there for this test.
    await memberB.backend.people.updateMySettings({ dms_from: "community" });
    const { conversation, sent } = await (async () => {
      try {
        const conversation = await memberA.backend.channels.openConversation(
          memberB.id,
        );
        const sent = await memberA.backend.messages.sendMessage(
          conversation.id,
          { nonce: randomUUID(), body: "a threat" },
        );
        return { conversation, sent };
      } finally {
        await memberB.backend.people.updateMySettings({ dms_from: "friends" });
      }
    })();
    const caseId = await memberB.backend.safety.fileHavenReport({
      kind: "message",
      id: sent.id,
    });
    const aboutThisCase = async () =>
      (await memberA.backend.safety.listDecisionsAboutMe()).filter(
        (d) => d.case_id === caseId,
      );

    const opened = await staff.backend.safety.loadCase(caseId);
    expect(opened?.case).toMatchObject({
      source: "message",
      subject_message_id: sent.id,
      subject_user_id: memberA.id,
      community_id: null,
    });

    // An action needs the rule and the reason the person will be shown.
    await expect(
      staff.backend.safety.recordDecision(caseId, {
        actions: ["content_removed"],
      }),
    ).rejects.toMatchObject({ reason: "reason_required" });
    const decisionId = await staff.backend.safety.recordDecision(caseId, {
      actions: ["content_removed"],
      rule: "No threats",
      reason: "The message threatened another person.",
    });

    const remaining = await memberB.backend.messages.listMessages(
      conversation.id,
    );
    expect(remaining.map((m) => m.id)).not.toContain(sent.id);
    expect(await newest(memberB, "report_outcome")).toMatchObject({
      case_id: caseId,
      body: "Haven staff took action on your report.",
    });
    expect(await newest(memberA, "moderation_decision")).toMatchObject({
      case_id: caseId,
      body: "Rule: No threats. The message threatened another person.",
    });
    expect(await aboutThisCase()).toEqual([
      expect.objectContaining({
        case_id: caseId,
        actions: ["content_removed"],
        rule: "No threats",
        restricted_until: null,
      }),
    ]);

    // A second decision waits for the first to be reversed.
    await expect(
      staff.backend.safety.recordDecision(caseId, { actions: [] }),
    ).rejects.toMatchObject({ kind: "conflict", reason: "already_decided" });
    await staff.backend.safety.reverseDecision(decisionId, "wrong call");
    expect(await aboutThisCase()).toEqual([]);
    const file = await staff.backend.safety.loadCase(caseId);
    expect(file?.events.map((e) => e.kind)).toContain("decision_reversed");
    expect(file?.decisions[0]?.reversed_at).not.toBeNull();
  });

  it("staff open evidence one file at a time, each view logged, and flag CSAM with its report number", async () => {
    const memberA = await actor("member_a");
    const memberB = await actor("member_b");
    const staff = await staffActor();

    const upload = await memberB.backend.media.uploadFile("attachment", {
      body: PNG,
      mime_type: "image/png",
      size_bytes: PNG.byteLength,
      filename: "pixel.png",
      width: 1,
      height: 1,
    });
    const sent = await memberB.backend.messages.sendMessage(
      hearthChannelId("general"),
      { nonce: randomUUID(), body: "", attachment_ids: [upload.id] },
    );
    const caseId = await memberA.backend.safety.fileHavenReport({
      kind: "message",
      id: sent.id,
    });

    const opened = await staff.backend.safety.loadCase(caseId);
    expect(opened?.media.map((m) => m.media_id)).toEqual([upload.id]);
    const link = await staff.backend.safety.viewCaseMedia(caseId, upload.id);
    const response = await fetch(link);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);

    // The report number comes after the flag, never before.
    await expect(
      staff.backend.safety.recordNcmecReport(caseId, "12345"),
    ).rejects.toMatchObject({ kind: "conflict", reason: "not_flagged" });
    await staff.backend.safety.flagCsam(caseId);
    await staff.backend.safety.recordNcmecReport(caseId, " 12345 ");

    const file = await staff.backend.safety.loadCase(caseId);
    expect(file?.case).toMatchObject({ ncmec_report_id: "12345" });
    expect(file?.case.csam_flagged_at).not.toBeNull();
    expect(file?.events.map((e) => e.kind)).toEqual(
      expect.arrayContaining([
        "media_viewed",
        "csam_flagged",
        "ncmec_recorded",
      ]),
    );
  });
});
