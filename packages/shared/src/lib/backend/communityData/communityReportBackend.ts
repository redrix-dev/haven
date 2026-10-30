/**
 * Reports raised from a community: a message or a profile, to the community's
 * moderators or to Haven staff, each with an evidence snapshot; and the
 * report-status broadcast moderators' clients listen for.
 */
import { havenCommunitySb } from "./runtime";
import {
  fetchSupportReportProfileSnapshot,
  fetchSupportReportMessageSnapshot,
} from "./supportReportSnapshots";
import type {
  MessageReportKind,
  MessageReportTarget,
  SupportReportMessageSnapshot,
  SupportReportProfileSnapshot,
  ReportStatusUpdatedBroadcastPayload,
} from "../types";
import { createPortableUuid } from "../../runtime/uuid";

export interface CommunityReportBackend {
  reportUserProfile(input: {
    communityId: string;
    targetUserId: string;
    reporterUserId: string;
    reason: string;
  }): Promise<void>;
  reportPlatformUserProfile(input: {
    targetUserId: string;
    reporterUserId: string;
    reason: string;
  }): Promise<void>;
  reportMessage(input: {
    communityId: string;
    channelId: string;
    messageId: string;
    reporterUserId: string;
    target: MessageReportTarget;
    kind: MessageReportKind;
    comment: string;
  }): Promise<void>;
  broadcastReportStatusUpdated(
    input: ReportStatusUpdatedBroadcastPayload,
  ): Promise<void>;
}

export const communityReportBackend: CommunityReportBackend = {
  async reportUserProfile({
    communityId,
    targetUserId,
    reporterUserId,
    reason,
  }) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new Error("Report reason is required.");
    }

    let snapshot: SupportReportProfileSnapshot | null = null;
    try {
      snapshot = await fetchSupportReportProfileSnapshot(targetUserId);
    } catch (snapshotError) {
      console.warn(
        "Failed to capture support report profile snapshot:",
        snapshotError,
      );
    }

    const reportId = createPortableUuid();
    const reportTitle = "User Report: Profile";
    const reportNotes = JSON.stringify({
      type: "user_report",
      targetUserId,
      reason: normalizedReason,
    });

    const { error } = await havenCommunitySb().from("support_reports").insert({
      id: reportId,
      community_id: communityId,
      destination: "haven_staff",
      reporter_user_id: reporterUserId,
      title: reportTitle,
      notes: reportNotes,
      snapshot,
      include_last_n_messages: null,
    });
    if (error) throw error;
  },

  async reportPlatformUserProfile({ targetUserId, reporterUserId, reason }) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new Error("Report reason is required.");
    }

    let snapshot: SupportReportProfileSnapshot | null = null;
    try {
      snapshot = await fetchSupportReportProfileSnapshot(targetUserId);
    } catch (snapshotError) {
      console.warn(
        "Failed to capture support report profile snapshot:",
        snapshotError,
      );
    }

    const reportId = createPortableUuid();
    const reportTitle = "User Report: Profile";
    const reportNotes = JSON.stringify({
      type: "user_report",
      targetUserId,
      reason: normalizedReason,
    });

    const { error } = await havenCommunitySb().from("support_reports").insert({
      id: reportId,
      community_id: null,
      destination: "haven_staff",
      reporter_user_id: reporterUserId,
      title: reportTitle,
      notes: reportNotes,
      snapshot,
      include_last_n_messages: null,
    });
    if (error) throw error;
  },

  async reportMessage({
    communityId,
    channelId,
    messageId,
    reporterUserId,
    target,
    kind,
    comment,
  }) {
    const reportTitle =
      kind === "bug" ? "Message Report: Bug" : "Message Report: Content Abuse";

    const reportNotes = JSON.stringify({
      type: "message_report",
      messageId,
      channelId,
      target,
      kind,
      comment,
    });

    let snapshot: SupportReportMessageSnapshot | null = null;
    try {
      snapshot = await fetchSupportReportMessageSnapshot({
        communityId,
        channelId,
        messageId,
      });
    } catch (snapshotError) {
      console.warn(
        "Failed to capture support report message snapshot:",
        snapshotError,
      );
    }

    if (target === "both") {
      // Fan-out: insert server_admins row first, then haven_staff row with source_report_id link.
      // 'both' is never stored — each side gets an independent row.
      const serverAdminsId = createPortableUuid();
      const havenStaffId = createPortableUuid();

      const { error: saError } = await havenCommunitySb()
        .from("support_reports")
        .insert({
          id: serverAdminsId,
          community_id: communityId,
          destination: "server_admins",
          reporter_user_id: reporterUserId,
          title: reportTitle,
          notes: reportNotes,
          snapshot,
          include_last_n_messages: null,
        });
      if (saError) throw saError;

      const { error: hsError } = await havenCommunitySb()
        .from("support_reports")
        .insert({
          id: havenStaffId,
          community_id: communityId,
          destination: "haven_staff",
          reporter_user_id: reporterUserId,
          title: reportTitle,
          notes: reportNotes,
          snapshot,
          include_last_n_messages: null,
          source_report_id: serverAdminsId,
        });
      if (hsError) throw hsError;

      // Link both rows to the channel for context; the message itself is
      // evidence in the snapshot.
      for (const reportId of [serverAdminsId, havenStaffId]) {
        const { error: channelLinkError } = await havenCommunitySb()
          .from("support_report_channels")
          .insert({
            report_id: reportId,
            community_id: communityId,
            channel_id: channelId,
          });
        if (channelLinkError) throw channelLinkError;
      }
      return;
    }

    // Single destination: server_admins or haven_staff
    const reportId = createPortableUuid();

    const { error: reportError } = await havenCommunitySb()
      .from("support_reports")
      .insert({
        id: reportId,
        community_id: communityId,
        destination: target,
        reporter_user_id: reporterUserId,
        title: reportTitle,
        notes: reportNotes,
        snapshot,
        include_last_n_messages: null,
      });

    if (reportError) throw reportError;

    const { error: channelLinkError } = await havenCommunitySb()
      .from("support_report_channels")
      .insert({
        report_id: reportId,
        community_id: communityId,
        channel_id: channelId,
      });
    if (channelLinkError) throw channelLinkError;
  },

  async broadcastReportStatusUpdated({
    reportId,
    status,
    communityId,
    updatedBy,
  }) {
    const { error } = await havenCommunitySb().rpc(
      "broadcast_report_status_updated" as never,
      {
        p_community_id: communityId,
        p_report_id: reportId,
        p_status: status,
        p_updated_by: updatedBy,
      } as never,
    );
    if (error) throw error;
  },
};
