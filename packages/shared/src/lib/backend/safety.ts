/**
 * Reports, cases and staff decisions. DATABASE.md: "Safety";
 * docs/architecture/REPORTING.md for the product rules.
 *
 * Two audiences: a community's moderators handle community reports; Haven
 * staff handle platform cases. Nobody handles a report about themselves, and
 * the database writes the evidence when a report is filed, so nothing here
 * sends message text along with a report.
 */

import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { rows, rpc, rpcRows } from "./client";
import { fromStorageError } from "./havenError";
import type {
  CaseAction,
  CaseMedia,
  CaseSource,
  CaseStatus,
  CommunityReportNote,
  CommunityReportRecord,
  DecisionAboutMe,
  MyReport,
  PlatformCase,
  PlatformCaseDecision,
  PlatformCaseEvent,
  ReportStatus,
  ReportSubject,
} from "./records";

/** Everything staff see about one case. */
export type CaseFile = {
  case: PlatformCase;
  events: PlatformCaseEvent[];
  decisions: PlatformCaseDecision[];
  media: CaseMedia[];
};

export type Decision = {
  actions: CaseAction[];
  rule?: string;
  reason?: string;
  /** For `user_suspended`: how long. */
  suspend_days?: number;
};

export function createSafetyBackend(client: HavenSupabaseClient) {
  return {
    // ── Anyone ──────────────────────────────────────────────────────────────
    /** Report a message or a member to a community's moderators. */
    async fileCommunityReport(
      communityId: string,
      subject: { kind: ReportSubject; id: string },
      reason?: string,
    ): Promise<string> {
      return (await rpc(client, "file_community_report", {
        p_community_id: communityId,
        p_subject_kind: subject.kind,
        p_subject_id: subject.id,
        p_reason: reason,
      })) as string;
    },

    /** Report a message or a profile to Haven staff. */
    async fileHavenReport(
      subject: { kind: Extract<CaseSource, "message" | "profile">; id: string },
      reason?: string,
    ): Promise<string> {
      return (await rpc(client, "file_platform_case", {
        p_subject_kind: subject.kind,
        p_subject_id: subject.id,
        p_reason: reason,
      })) as string;
    },

    /** What the caller reported and where each one stands. */
    async listMyReports(): Promise<MyReport[]> {
      return rpcRows<MyReport>(client, "list_my_reports", {});
    },

    /** Staff decisions about the caller, newest first. */
    async listDecisionsAboutMe(): Promise<DecisionAboutMe[]> {
      return rpcRows<DecisionAboutMe>(client, "list_decisions_about_me", {});
    },

    // ── Moderators ──────────────────────────────────────────────────────────
    /** Needs `manage_reports` (refused without it). Never shows who filed one. */
    async listCommunityReports(
      communityId: string,
    ): Promise<CommunityReportRecord[]> {
      return rpcRows<CommunityReportRecord>(client, "list_community_reports", {
        p_community_id: communityId,
      });
    },

    async setCommunityReportStatus(
      reportId: string,
      status: Exclude<ReportStatus, "escalated">,
    ): Promise<void> {
      await rpc(client, "set_community_report_status", {
        p_report_id: reportId,
        p_status: status,
      });
    },

    async listReportNotes(reportId: string): Promise<CommunityReportNote[]> {
      return rows(
        await client
          .from("community_report_notes")
          .select("*")
          .eq("report_id", reportId)
          .order("id"),
      );
    },

    async addReportNote(
      reportId: string,
      body: string,
    ): Promise<CommunityReportNote> {
      return (await rpc(client, "add_community_report_note", {
        p_report_id: reportId,
        p_body: body,
      })) as CommunityReportNote;
    },

    /** Hands a community report to Haven staff. Returns the case. */
    async escalateCommunityReport(
      reportId: string,
      reason?: string,
    ): Promise<string> {
      return (await rpc(client, "escalate_community_report", {
        p_report_id: reportId,
        p_reason: reason,
      })) as string;
    },

    // ── Haven staff ─────────────────────────────────────────────────────────
    /** Newest first. Empty for anyone who is not active staff. */
    async listCases(
      options: { status?: CaseStatus; before_id?: string; limit?: number } = {},
    ): Promise<PlatformCase[]> {
      let query = client
        .from("platform_cases")
        .select("*")
        .order("id", { ascending: false })
        .limit(Math.min(options.limit ?? 50, 200));
      if (options.status) query = query.eq("status", options.status);
      if (options.before_id) query = query.lt("id", options.before_id);
      return rows(await query);
    },

    async loadCase(caseId: string): Promise<CaseFile | null> {
      const [found, events, decisions, media] = await Promise.all([
        client.from("platform_cases").select("*").eq("id", caseId),
        client
          .from("platform_case_events")
          .select("*")
          .eq("case_id", caseId)
          .order("id"),
        client
          .from("platform_case_decisions")
          .select("*")
          .eq("case_id", caseId)
          .order("id"),
        client.from("case_media").select("*").eq("case_id", caseId),
      ]);
      const [row] = rows(found);
      if (!row) return null;
      return {
        case: row,
        events: rows(events),
        decisions: rows(decisions),
        media: rows(media),
      };
    },

    async setCaseStatus(caseId: string, status: CaseStatus): Promise<void> {
      await rpc(client, "staff_set_case_status", {
        p_case_id: caseId,
        p_status: status,
      });
    },

    async addCaseNote(caseId: string, body: string): Promise<void> {
      await rpc(client, "staff_add_case_note", {
        p_case_id: caseId,
        p_body: body,
      });
    },

    /** Records the decision, acts on it, and tells the person. Returns its id. */
    async recordDecision(caseId: string, decision: Decision): Promise<string> {
      return (await rpc(client, "staff_record_decision", {
        p_case_id: caseId,
        p_actions: decision.actions,
        p_rule: decision.rule,
        p_reason: decision.reason,
        p_suspend_days: decision.suspend_days,
      })) as string;
    },

    async reverseDecision(decisionId: string, reason: string): Promise<void> {
      await rpc(client, "staff_reverse_decision", {
        p_decision_id: decisionId,
        p_reason: reason,
      });
    },

    async flagCsam(caseId: string): Promise<void> {
      await rpc(client, "staff_flag_csam", { p_case_id: caseId });
    },

    async recordNcmecReport(caseId: string, reportId: string): Promise<void> {
      await rpc(client, "staff_record_ncmec_report", {
        p_case_id: caseId,
        p_ncmec_report_id: reportId,
      });
    },

    /**
     * Opens one evidence file. The database logs the view, which is what lets
     * storage serve the file for the next ten minutes; returns a signed link.
     */
    async viewCaseMedia(caseId: string, mediaId: string): Promise<string> {
      const [file] = await rpcRows<{ bucket: string; object_path: string }>(
        client,
        "staff_view_case_media",
        { p_case_id: caseId, p_media_id: mediaId },
      );
      if (!file) throw new Error("staff_view_case_media returned no file");
      const { data, error } = await client.storage
        .from(file.bucket)
        .createSignedUrl(file.object_path, 300);
      if (error) throw fromStorageError(error);
      return data.signedUrl;
    },
  };
}

export type SafetyBackend = ReturnType<typeof createSafetyBackend>;
