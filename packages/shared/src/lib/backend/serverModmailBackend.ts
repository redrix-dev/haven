import { supabase } from '@shared/lib/supabase';
import type { Database } from '@shared/types/database';
import { centralCommunityDataBackend } from './communityDataBackend';
import type {
  ServerReportDetail,
  ServerReportLinkedChannel,
  ServerReportLinkedMessage,
  ServerReportSummary,
  SupportReportDestination,
  SupportReportInternalNote,
  SupportReportKind,
  SupportReportSnapshot,
  SupportReportStatus,
} from './types';

type SupportReportRow = Pick<
  Database['public']['Tables']['support_reports']['Row'],
  | 'id'
  | 'community_id'
  | 'destination'
  | 'status'
  | 'title'
  | 'notes'
  | 'snapshot'
  | 'created_at'
  | 'updated_at'
  | 'reporter_user_id'
  | 'include_last_n_messages'
> & {
  reporter:
    | Pick<Database['public']['Tables']['profiles']['Row'], 'username' | 'avatar_url'>
    | Array<Pick<Database['public']['Tables']['profiles']['Row'], 'username' | 'avatar_url'>>
    | null;
  community:
    | Pick<Database['public']['Tables']['communities']['Row'], 'name'>
    | Array<Pick<Database['public']['Tables']['communities']['Row'], 'name'>>
    | null;
};

type SupportReportChannelLinkRow = {
  channel_id: string;
  channels:
    | Pick<Database['public']['Tables']['channels']['Row'], 'name'>
    | Array<Pick<Database['public']['Tables']['channels']['Row'], 'name'>>
    | null;
};

type SupportReportMessageLinkRow = Pick<
  Database['public']['Tables']['support_report_messages']['Row'],
  'message_id'
>;

type MessageChannelRow = Pick<
  Database['public']['Tables']['messages']['Row'],
  'id' | 'channel_id'
>;

type ChannelNameRow = Pick<Database['public']['Tables']['channels']['Row'], 'id' | 'name'>;

type RoleNameRow = Pick<Database['public']['Tables']['roles']['Row'], 'id' | 'name'>;

type MemberRoleRow = Pick<Database['public']['Tables']['member_roles']['Row'], 'role_id'>;

const SERVER_VISIBLE_DESTINATIONS: SupportReportDestination[] = ['server_admins', 'both'];
const VALID_REPORT_STATUSES: SupportReportStatus[] = [
  'pending',
  'under_review',
  'resolved',
  'dismissed',
  'escalated',
];

const asObjectRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const takeFirst = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const parseJsonRecord = (value: string | null): Record<string, unknown> | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return asObjectRecord(parsed);
  } catch {
    return null;
  }
};

const isSupportReportStatus = (value: string): value is SupportReportStatus =>
  VALID_REPORT_STATUSES.includes(value as SupportReportStatus);

const getSupportReportKind = (notes: Record<string, unknown> | null): SupportReportKind => {
  const reportType = notes?.type;
  if (
    reportType === 'message_report' ||
    reportType === 'user_report' ||
    reportType === 'escalated_report'
  ) {
    return reportType;
  }
  return 'unknown';
};

const parseSupportReportSnapshot = (value: unknown): SupportReportSnapshot | null => {
  const snapshot = asObjectRecord(value);
  if (!snapshot) return null;
  if ('reportedMessage' in snapshot || 'targetUserId' in snapshot) {
    return snapshot as SupportReportSnapshot;
  }
  return null;
};

const parseInternalNotes = (
  notes: Record<string, unknown> | null
): SupportReportInternalNote[] => {
  const rawNotes = notes?.internalNotes;
  if (!Array.isArray(rawNotes)) return [];

  return rawNotes
    .map((entry) => {
      const note = asObjectRecord(entry);
      if (!note) return null;
      const id = typeof note.id === 'string' ? note.id : null;
      const authorUserId = typeof note.authorUserId === 'string' ? note.authorUserId : null;
      const body = typeof note.body === 'string' ? note.body : null;
      const createdAt = typeof note.createdAt === 'string' ? note.createdAt : null;
      if (!id || !authorUserId || !body || !createdAt) return null;

      return {
        id,
        authorUserId,
        authorDisplayName:
          typeof note.authorDisplayName === 'string' ? note.authorDisplayName : null,
        body,
        createdAt,
      } satisfies SupportReportInternalNote;
    })
    .filter((note): note is SupportReportInternalNote => note !== null);
};

const getTargetUserId = (
  reportType: SupportReportKind,
  notes: Record<string, unknown> | null,
  snapshot: SupportReportSnapshot | null
): string | null => {
  if (reportType === 'message_report') {
    if (snapshot && 'reportedMessage' in snapshot) {
      return snapshot.reportedMessage.authorUserId;
    }
    return null;
  }
  if (reportType === 'user_report') {
    if (snapshot && 'targetUserId' in snapshot) {
      return snapshot.targetUserId;
    }
    return typeof notes?.targetUserId === 'string' ? notes.targetUserId : null;
  }
  return null;
};

const getTargetDisplayName = (
  reportType: SupportReportKind,
  notes: Record<string, unknown> | null,
  snapshot: SupportReportSnapshot | null
): string | null => {
  if (reportType === 'message_report' && snapshot && 'reportedMessage' in snapshot) {
    return snapshot.reportedMessage.authorUsername;
  }
  if (reportType === 'user_report' && snapshot && 'targetUserId' in snapshot) {
    return snapshot.targetUsername;
  }
  const legacyUsername = notes?.targetUsername;
  return typeof legacyUsername === 'string' ? legacyUsername : null;
};

const mapSupportReportRowToSummary = (row: SupportReportRow): ServerReportSummary => {
  const reporter = takeFirst(row.reporter);
  const community = takeFirst(row.community);
  const notes = parseJsonRecord(row.notes);
  const snapshot = parseSupportReportSnapshot(row.snapshot);

  return {
    reportId: row.id,
    communityId: row.community_id,
    serverName: community?.name ?? row.community_id,
    destination: row.destination as SupportReportDestination,
    status: row.status,
    title: row.title,
    reportType: getSupportReportKind(notes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reporterUserId: row.reporter_user_id,
    reporterUsername: reporter?.username ?? null,
    reporterAvatarUrl: reporter?.avatar_url ?? null,
    snapshot,
  };
};

const loadChannelNameMap = async (channelIds: readonly string[]) => {
  const uniqueChannelIds = Array.from(new Set(channelIds.filter(Boolean)));
  if (uniqueChannelIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from('channels')
    .select('id, name')
    .in('id', uniqueChannelIds);
  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.id, (row as ChannelNameRow).name]));
};

const loadEscalationContext = async (communityId: string, userId: string) => {
  const [{ data: profile, error: profileError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase.from('profiles').select('id, username, avatar_url').eq('id', userId).maybeSingle(),
      supabase
        .from('community_members')
        .select('id, nickname')
        .eq('community_id', communityId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

  if (profileError) throw profileError;
  if (membershipError) throw membershipError;

  let roleNames: string[] = [];
  if (membership?.id) {
    const [{ data: memberRoles, error: memberRolesError }] = await Promise.all([
      supabase
        .from('member_roles')
        .select('role_id')
        .eq('community_id', communityId)
        .eq('member_id', membership.id),
    ]);
    if (memberRolesError) throw memberRolesError;

    const roleIds = (memberRoles ?? []).map((row) => (row as MemberRoleRow).role_id);
    if (roleIds.length > 0) {
      const { data: roleRows, error: roleRowsError } = await supabase
        .from('roles')
        .select('id, name')
        .eq('community_id', communityId)
        .in('id', roleIds);
      if (roleRowsError) throw roleRowsError;
      roleNames = (roleRows ?? []).map((row) => (row as RoleNameRow).name).sort();
    }
  }

  return {
    displayName: membership?.nickname?.trim() || profile?.username || null,
    roleNames,
  };
};

const fetchSupportReportRow = async (reportId: string) => {
  const { data, error } = await supabase
    .from('support_reports')
    .select(
      'id, community_id, destination, status, title, notes, snapshot, created_at, updated_at, reporter_user_id, include_last_n_messages, reporter:profiles!support_reports_reporter_user_id_fkey(username, avatar_url), community:communities!support_reports_community_id_fkey(name)'
    )
    .eq('id', reportId)
    .in('destination', SERVER_VISIBLE_DESTINATIONS)
    .maybeSingle();
  if (error) throw error;
  return (data as SupportReportRow | null) ?? null;
};

export interface ServerModmailBackend {
  listServerReports(communityIds: string[]): Promise<ServerReportSummary[]>;
  getServerReport(reportId: string): Promise<ServerReportDetail | null>;
  updateReportStatus(reportId: string, status: SupportReportStatus): Promise<void>;
  addInternalNote(reportId: string, body: string): Promise<void>;
  escalateReport(reportId: string): Promise<string>;
}

export const centralServerModmailBackend: ServerModmailBackend = {
  async listServerReports(communityIds) {
    const uniqueCommunityIds = Array.from(new Set(communityIds.filter(Boolean)));
    if (uniqueCommunityIds.length === 0) return [];

    const { data, error } = await supabase
      .from('support_reports')
      .select(
        'id, community_id, destination, status, title, notes, snapshot, created_at, updated_at, reporter_user_id, include_last_n_messages, reporter:profiles!support_reports_reporter_user_id_fkey(username, avatar_url), community:communities!support_reports_community_id_fkey(name)'
      )
      .in('community_id', uniqueCommunityIds)
      .in('destination', SERVER_VISIBLE_DESTINATIONS)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return ((data ?? []) as SupportReportRow[]).map(mapSupportReportRowToSummary);
  },

  async getServerReport(reportId) {
    const reportRow = await fetchSupportReportRow(reportId);
    if (!reportRow) return null;

    const summary = mapSupportReportRowToSummary(reportRow);
    const notes = parseJsonRecord(reportRow.notes);

    const [
      { data: channelLinks, error: channelLinksError },
      { data: messageLinks, error: messageLinksError },
    ] = await Promise.all([
      supabase
        .from('support_report_channels')
        .select('channel_id, channels(name)')
        .eq('report_id', reportId),
      supabase
        .from('support_report_messages')
        .select('message_id')
        .eq('report_id', reportId),
    ]);

    if (channelLinksError) throw channelLinksError;
    if (messageLinksError) throw messageLinksError;

    const linkedChannels: ServerReportLinkedChannel[] = (
      (channelLinks ?? []) as SupportReportChannelLinkRow[]
    ).map((row) => ({
      channelId: row.channel_id,
      channelName: takeFirst(row.channels)?.name ?? null,
    }));

    const messageIds = ((messageLinks ?? []) as SupportReportMessageLinkRow[]).map(
      (row) => row.message_id
    );

    let linkedMessages: ServerReportLinkedMessage[] = [];
    if (messageIds.length > 0) {
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('id, channel_id')
        .in('id', messageIds);
      if (messagesError) throw messagesError;

      const messageRows = (messages ?? []) as MessageChannelRow[];
      const channelNameMap = await loadChannelNameMap(
        messageRows.map((row) => row.channel_id).filter((channelId): channelId is string => Boolean(channelId))
      );

      linkedMessages = messageIds.map((messageId) => {
        const messageRow = messageRows.find((row) => row.id === messageId) ?? null;
        return {
          messageId,
          channelId: messageRow?.channel_id ?? null,
          channelName: messageRow?.channel_id
            ? channelNameMap.get(messageRow.channel_id) ?? null
            : null,
        };
      });
    }

    return {
      ...summary,
      notes,
      linkedChannels,
      linkedMessages,
      internalNotes: parseInternalNotes(notes),
      targetUserId: getTargetUserId(summary.reportType, notes, summary.snapshot),
      targetDisplayName: getTargetDisplayName(summary.reportType, notes, summary.snapshot),
    };
  },

  async updateReportStatus(reportId, status) {
    if (!isSupportReportStatus(status)) {
      throw new Error('Unsupported report status.');
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    const reportRow = await fetchSupportReportRow(reportId);
    if (!reportRow) {
      throw new Error('Report not found.');
    }

    const { error: updateError } = await supabase
      .from('support_reports')
      .update({ status })
      .eq('id', reportId);
    if (updateError) throw updateError;

    try {
      await centralCommunityDataBackend.broadcastReportStatusUpdated({
        reportId,
        status,
        communityId: reportRow.community_id,
        updatedBy: user.id,
      });
    } catch (broadcastError) {
      console.error('Failed to broadcast report status update:', broadcastError);
    }
  },

  async addInternalNote(reportId, body) {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      throw new Error('Internal note is required.');
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    const reportRow = await fetchSupportReportRow(reportId);
    if (!reportRow) {
      throw new Error('Report not found.');
    }

    const notes = parseJsonRecord(reportRow.notes) ?? {};
    const existingNotes = parseInternalNotes(notes);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const nextInternalNotes = [
      ...existingNotes,
      {
        id: crypto.randomUUID(),
        authorUserId: user.id,
        authorDisplayName: profile?.username ?? null,
        body: trimmedBody,
        createdAt: new Date().toISOString(),
      } satisfies SupportReportInternalNote,
    ];

    const { error: updateError } = await supabase
      .from('support_reports')
      .update({
        notes: JSON.stringify({
          ...notes,
          internalNotes: nextInternalNotes,
        }),
      })
      .eq('id', reportId);
    if (updateError) throw updateError;
  },

  async escalateReport(reportId) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    const reportRow = await fetchSupportReportRow(reportId);
    if (!reportRow) {
      throw new Error('Report not found.');
    }
    if (reportRow.destination !== 'server_admins') {
      throw new Error('Only server-staff-only reports can be shared with Haven staff.');
    }

    const parsedOriginalNotes = parseJsonRecord(reportRow.notes);
    const [{ data: originalChannelLinks, error: channelLinksError }, { data: originalMessageLinks, error: messageLinksError }, { data: originalReporter, error: originalReporterError }] =
      await Promise.all([
        supabase
          .from('support_report_channels')
          .select('channel_id')
          .eq('report_id', reportId),
        supabase
          .from('support_report_messages')
          .select('message_id')
          .eq('report_id', reportId),
        supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', reportRow.reporter_user_id)
          .maybeSingle(),
      ]);

    if (channelLinksError) throw channelLinksError;
    if (messageLinksError) throw messageLinksError;
    if (originalReporterError) throw originalReporterError;

    const escalationContext = await loadEscalationContext(reportRow.community_id, user.id);
    const escalatedAt = new Date().toISOString();
    const escalatedReportId = crypto.randomUUID();

    const escalationNotes = {
      type: 'escalated_report',
      originalReportId: reportRow.id,
      escalatedBy: user.id,
      escalatedAt,
      escalatedByDisplayName: escalationContext.displayName,
      escalatedByRoleNames: escalationContext.roleNames,
      originalReporterUserId: reportRow.reporter_user_id,
      originalReporterUsername: originalReporter?.username ?? null,
      originalReporterAvatarUrl: originalReporter?.avatar_url ?? null,
      originalNotes: parsedOriginalNotes,
    };

    const { error: insertError } = await supabase.from('support_reports').insert({
      id: escalatedReportId,
      community_id: reportRow.community_id,
      destination: 'haven_staff',
      status: 'pending',
      title: reportRow.title,
      notes: JSON.stringify(escalationNotes),
      snapshot: reportRow.snapshot,
      reporter_user_id: user.id,
      include_last_n_messages: reportRow.include_last_n_messages,
    });
    if (insertError) throw insertError;

    const nextChannelLinks = ((originalChannelLinks ?? []) as Array<{ channel_id: string }>).map(
      (row) => ({
        report_id: escalatedReportId,
        community_id: reportRow.community_id,
        channel_id: row.channel_id,
      })
    );
    if (nextChannelLinks.length > 0) {
      const { error: copyChannelLinksError } = await supabase
        .from('support_report_channels')
        .insert(nextChannelLinks);
      if (copyChannelLinksError) throw copyChannelLinksError;
    }

    const nextMessageLinks = ((originalMessageLinks ?? []) as Array<{ message_id: string }>).map(
      (row) => ({
        report_id: escalatedReportId,
        message_id: row.message_id,
      })
    );
    if (nextMessageLinks.length > 0) {
      const { error: copyMessageLinksError } = await supabase
        .from('support_report_messages')
        .insert(nextMessageLinks);
      if (copyMessageLinksError) throw copyMessageLinksError;
    }

    await centralServerModmailBackend.updateReportStatus(reportId, 'escalated');
    return escalatedReportId; // CHECKPOINT 3 COMPLETE
  },
};
