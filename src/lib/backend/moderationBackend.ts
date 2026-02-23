import { supabase } from '@/lib/supabase';
import type {
  DmMessageReportAction,
  DmMessageReportContextMessage,
  DmMessageReportDetail,
  DmMessageReportStatus,
  DmMessageReportSummary,
} from './types';

export interface ModerationBackend {
  listDmMessageReportsForReview(input?: {
    statuses?: DmMessageReportStatus[];
    limit?: number;
    beforeCreatedAt?: string | null;
    beforeReportId?: string | null;
  }): Promise<DmMessageReportSummary[]>;
  getDmMessageReportDetail(reportId: string): Promise<DmMessageReportDetail | null>;
  listDmMessageReportActions(reportId: string): Promise<DmMessageReportAction[]>;
  listDmMessageContext(input: {
    messageId: string;
    before?: number;
    after?: number;
  }): Promise<DmMessageReportContextMessage[]>;
  assignDmMessageReport(input: {
    reportId: string;
    assigneeUserId: string | null;
    notes?: string | null;
  }): Promise<boolean>;
  updateDmMessageReportStatus(input: {
    reportId: string;
    status: DmMessageReportStatus;
    notes?: string | null;
  }): Promise<boolean>;
  addDmMessageReportAction(input: {
    reportId: string;
    actionType: string;
    notes?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<string>;
}

type DmMessageReportSummaryRow = {
  report_id: string;
  conversation_id: string;
  message_id: string;
  status: DmMessageReportStatus;
  kind: DmMessageReportSummary['kind'];
  comment: string;
  created_at: string;
  updated_at: string;
  reporter_user_id: string;
  reporter_username: string | null;
  reporter_avatar_url: string | null;
  reported_user_id: string;
  reported_username: string | null;
  reported_avatar_url: string | null;
  assigned_to_user_id: string | null;
  assigned_to_username: string | null;
  assigned_at: string | null;
  message_created_at: string | null;
  message_deleted_at: string | null;
  message_preview: string | null;
};

type DmMessageReportDetailRow = {
  report_id: string;
  conversation_id: string;
  message_id: string;
  status: DmMessageReportStatus;
  kind: DmMessageReportDetail['kind'];
  comment: string;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  reporter_user_id: string;
  reporter_username: string | null;
  reporter_avatar_url: string | null;
  reported_user_id: string;
  reported_username: string | null;
  reported_avatar_url: string | null;
  assigned_to_user_id: string | null;
  assigned_to_username: string | null;
  assigned_at: string | null;
  message_author_user_id: string;
  message_author_username: string | null;
  message_author_avatar_url: string | null;
  message_content: string;
  message_metadata: unknown;
  message_created_at: string;
  message_edited_at: string | null;
  message_deleted_at: string | null;
};

type DmMessageReportActionRow = {
  action_id: string;
  report_id: string;
  acted_by_user_id: string;
  acted_by_username: string | null;
  acted_by_avatar_url: string | null;
  action_type: string;
  notes: string | null;
  metadata: unknown;
  created_at: string;
};

type DmMessageContextRow = {
  message_id: string;
  conversation_id: string;
  author_user_id: string;
  author_username: string | null;
  author_avatar_url: string | null;
  content: string;
  metadata: unknown;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  is_target: boolean | null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const callBooleanRpc = async (functionName: string, args: Record<string, unknown>): Promise<boolean> => {
  const { data, error } = await supabase.rpc(functionName as never, args as never);
  if (error) throw error;
  return Boolean(data);
};

const mapSummary = (row: DmMessageReportSummaryRow): DmMessageReportSummary => ({
  reportId: row.report_id,
  conversationId: row.conversation_id,
  messageId: row.message_id,
  status: row.status,
  kind: row.kind,
  comment: row.comment,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  reporterUserId: row.reporter_user_id,
  reporterUsername: row.reporter_username ?? null,
  reporterAvatarUrl: row.reporter_avatar_url ?? null,
  reportedUserId: row.reported_user_id,
  reportedUsername: row.reported_username ?? null,
  reportedAvatarUrl: row.reported_avatar_url ?? null,
  assignedToUserId: row.assigned_to_user_id ?? null,
  assignedToUsername: row.assigned_to_username ?? null,
  assignedAt: row.assigned_at ?? null,
  messageCreatedAt: row.message_created_at ?? null,
  messageDeletedAt: row.message_deleted_at ?? null,
  messagePreview: row.message_preview ?? null,
});

const mapDetail = (row: DmMessageReportDetailRow): DmMessageReportDetail => ({
  reportId: row.report_id,
  conversationId: row.conversation_id,
  messageId: row.message_id,
  status: row.status,
  kind: row.kind,
  comment: row.comment,
  resolutionNotes: row.resolution_notes ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  reporterUserId: row.reporter_user_id,
  reporterUsername: row.reporter_username ?? null,
  reporterAvatarUrl: row.reporter_avatar_url ?? null,
  reportedUserId: row.reported_user_id,
  reportedUsername: row.reported_username ?? null,
  reportedAvatarUrl: row.reported_avatar_url ?? null,
  assignedToUserId: row.assigned_to_user_id ?? null,
  assignedToUsername: row.assigned_to_username ?? null,
  assignedAt: row.assigned_at ?? null,
  messageAuthorUserId: row.message_author_user_id,
  messageAuthorUsername: row.message_author_username ?? null,
  messageAuthorAvatarUrl: row.message_author_avatar_url ?? null,
  messageContent: row.message_content,
  messageMetadata: asRecord(row.message_metadata),
  messageCreatedAt: row.message_created_at,
  messageEditedAt: row.message_edited_at ?? null,
  messageDeletedAt: row.message_deleted_at ?? null,
});

const mapAction = (row: DmMessageReportActionRow): DmMessageReportAction => ({
  actionId: row.action_id,
  reportId: row.report_id,
  actedByUserId: row.acted_by_user_id,
  actedByUsername: row.acted_by_username ?? null,
  actedByAvatarUrl: row.acted_by_avatar_url ?? null,
  actionType: row.action_type,
  notes: row.notes ?? null,
  metadata: asRecord(row.metadata),
  createdAt: row.created_at,
});

const mapContextMessage = (row: DmMessageContextRow): DmMessageReportContextMessage => ({
  messageId: row.message_id,
  conversationId: row.conversation_id,
  authorUserId: row.author_user_id,
  authorUsername: row.author_username ?? null,
  authorAvatarUrl: row.author_avatar_url ?? null,
  content: row.content,
  metadata: asRecord(row.metadata),
  createdAt: row.created_at,
  editedAt: row.edited_at ?? null,
  deletedAt: row.deleted_at ?? null,
  isTarget: Boolean(row.is_target),
});

export const centralModerationBackend: ModerationBackend = {
  async listDmMessageReportsForReview(input) {
    const { data, error } = await supabase.rpc(
      'list_dm_message_reports_for_review' as never,
      {
        p_statuses: input?.statuses?.length ? input.statuses : undefined,
        p_limit: input?.limit ?? 50,
        p_before_created_at: input?.beforeCreatedAt ?? undefined,
        p_before_report_id: input?.beforeReportId ?? undefined,
      } as never
    );
    if (error) throw error;
    return ((data ?? []) as DmMessageReportSummaryRow[]).map(mapSummary);
  },

  async getDmMessageReportDetail(reportId) {
    const { data, error } = await supabase.rpc(
      'get_dm_message_report_detail' as never,
      { p_report_id: reportId } as never
    );
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : null) as DmMessageReportDetailRow | null;
    return row ? mapDetail(row) : null;
  },

  async listDmMessageReportActions(reportId) {
    const { data, error } = await supabase.rpc(
      'list_dm_message_report_actions' as never,
      { p_report_id: reportId } as never
    );
    if (error) throw error;
    return ((data ?? []) as DmMessageReportActionRow[]).map(mapAction);
  },

  async listDmMessageContext(input) {
    const { data, error } = await supabase.rpc(
      'list_dm_message_context' as never,
      {
        p_message_id: input.messageId,
        p_before: input.before ?? 20,
        p_after: input.after ?? 20,
      } as never
    );
    if (error) throw error;
    return ((data ?? []) as DmMessageContextRow[]).map(mapContextMessage);
  },

  async assignDmMessageReport(input) {
    return callBooleanRpc('assign_dm_message_report', {
      p_report_id: input.reportId,
      p_assignee_user_id: input.assigneeUserId ?? null,
      p_notes: input.notes ?? null,
    });
  },

  async updateDmMessageReportStatus(input) {
    return callBooleanRpc('update_dm_message_report_status', {
      p_report_id: input.reportId,
      p_status: input.status,
      p_notes: input.notes ?? null,
    });
  },

  async addDmMessageReportAction(input) {
    const { data, error } = await supabase.rpc(
      'add_dm_message_report_action' as never,
      {
        p_report_id: input.reportId,
        p_action_type: input.actionType,
        p_notes: input.notes ?? null,
        p_metadata: input.metadata ?? {},
      } as never
    );
    if (error) throw error;
    const actionId = data as unknown;
    if (typeof actionId !== 'string' || actionId.trim().length === 0) {
      throw new Error('DM report action creation returned no id.');
    }
    return actionId;
  },
};
