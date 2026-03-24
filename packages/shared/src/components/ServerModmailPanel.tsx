import React from 'react';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
import { Label } from '@shared/components/ui/label';
import { ScrollArea } from '@shared/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Textarea } from '@shared/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@shared/components/ui/alert-dialog';
import { getCommunityDataBackend, getServerModmailBackend } from '@shared/lib/backend';
import type {
  ServerPermissions,
  ServerReportDetail,
  ServerReportSummary,
  SupportReportDestination,
  SupportReportKind,
  SupportReportSnapshotMessage,
  SupportReportStatus,
} from '@shared/lib/backend/types';
import { getErrorMessage } from '@platform/lib/errors';
import { RefreshCcw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserDisplayName: string;
  managedServers: Array<{ id: string; name: string }>;
  serverPermissionsById: Record<string, ServerPermissions>;
  reportStatusRefreshVersion: number;
  onBanUserFromServer: (input: {
    targetUserId: string;
    communityId: string;
    reason: string;
  }) => Promise<void>;
  onKickUserFromServer: (input: {
    targetUserId: string;
    communityId: string;
    username: string;
  }) => Promise<void>;
};

type VisibleStatusFilter = 'all' | 'pending' | 'under_review' | 'resolved';

type ActionConfirmState =
  | {
      kind: 'delete_message';
      reportId: string;
      communityId: string;
      messageId: string;
    }
  | {
      kind: 'kick_user';
      reportId: string;
      communityId: string;
      targetUserId: string;
      username: string;
    }
  | {
      kind: 'ban_user';
      reportId: string;
      communityId: string;
      targetUserId: string;
      username: string;
    };

const serverModmailBackend = getServerModmailBackend();

const STATUS_FILTERS: Array<{ value: VisibleStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'resolved', label: 'Resolved' },
];

const STATUS_ACTIONS: Array<{ value: Exclude<SupportReportStatus, 'escalated'>; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

const safeFmt = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

const destinationLabel = (destination: SupportReportDestination) => {
  switch (destination) {
    case 'haven_staff':
      return 'Haven Moderation Team';
    case 'server_admins':
      return 'Server Staff';
    case 'both':
      return 'Both';
  }
};

const reportTypeLabel = (reportType: SupportReportKind) => {
  switch (reportType) {
    case 'message_report':
      return 'Message Report';
    case 'user_report':
      return 'Profile Report';
    case 'escalated_report':
      return 'Escalated Report';
    default:
      return 'Report';
  }
};

const statusLabel = (status: SupportReportStatus) => {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'under_review':
      return 'Under Review';
    case 'resolved':
      return 'Resolved';
    case 'dismissed':
      return 'Dismissed';
    case 'escalated':
      return 'Escalated';
  }
};

const statusBadgeClass = (status: SupportReportStatus) => {
  switch (status) {
    case 'pending':
      return 'border-[#6a9bff] text-[#d5e6ff]';
    case 'under_review':
      return 'border-[#c4a35f] text-[#ffe7b7]';
    case 'resolved':
      return 'border-[#5ea779] text-[#c8f2d7]';
    case 'dismissed':
      return 'border-[#7f7f93] text-[#d2d2e3]';
    case 'escalated':
      return 'border-[#d58cff] text-[#f2ddff]';
  }
};

const statusMatchesFilter = (status: SupportReportStatus, filter: VisibleStatusFilter) => {
  if (filter === 'all') return true;
  if (filter === 'resolved') return status === 'resolved';
  return status === filter;
};

const renderSnapshotMessage = (
  message: SupportReportSnapshotMessage,
  label: string,
  accentClassName = 'border-[#304867]'
) => (
  <div className={`rounded-md border ${accentClassName} bg-[#101a2b] p-3`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs uppercase tracking-wide text-[#97acd0]">{label}</p>
      <p className="text-xs text-[#8ea4c7]">{safeFmt(message.createdAt)}</p>
    </div>
    <p className="mt-1 text-sm font-medium text-white">
      {message.authorUsername ?? message.authorUserId ?? 'Unknown user'}
    </p>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#dbe7f8]">
      {message.content || '(No content captured)'}
    </p>
  </div>
);

export function ServerModmailPanel({
  open,
  onOpenChange,
  currentUserDisplayName,
  managedServers,
  serverPermissionsById,
  reportStatusRefreshVersion,
  onBanUserFromServer,
  onKickUserFromServer,
}: Props) {
  const [serverFilter, setServerFilter] = React.useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = React.useState<VisibleStatusFilter>('all');
  const [reports, setReports] = React.useState<ServerReportSummary[]>([]);
  const [selectedReportId, setSelectedReportId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ServerReportDetail | null>(null);
  const [loadingReports, setLoadingReports] = React.useState(false);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [internalNoteDraft, setInternalNoteDraft] = React.useState('');
  const [actionConfirm, setActionConfirm] = React.useState<ActionConfirmState | null>(null);
  const [escalateConfirmOpen, setEscalateConfirmOpen] = React.useState(false);

  const visibleServerIds = React.useMemo(
    () =>
      serverFilter === 'all'
        ? managedServers.map((server) => server.id)
        : managedServers.some((server) => server.id === serverFilter)
          ? [serverFilter]
          : [],
    [managedServers, serverFilter]
  );

  const refreshReports = React.useCallback(async () => {
    if (!open) return;
    setLoadingReports(true);
    setError(null);
    try {
      const nextReports = await serverModmailBackend.listServerReports(visibleServerIds);
      setReports(nextReports);
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'Failed to load server reports.'));
    } finally {
      setLoadingReports(false);
    }
  }, [open, visibleServerIds]);

  const refreshDetail = React.useCallback(
    async (reportId: string) => {
      if (!open || !reportId) return;
      setLoadingDetail(true);
      setError(null);
      try {
        const nextDetail = await serverModmailBackend.getServerReport(reportId);
        setDetail(nextDetail);
      } catch (nextError) {
        setError(getErrorMessage(nextError, 'Failed to load report detail.'));
      } finally {
        setLoadingDetail(false);
      }
    },
    [open]
  );

  React.useEffect(() => {
    if (!open) {
      setReports([]);
      setSelectedReportId(null);
      setDetail(null);
      setLoadingReports(false);
      setLoadingDetail(false);
      setBusy(false);
      setError(null);
      setInternalNoteDraft('');
      setActionConfirm(null);
      setEscalateConfirmOpen(false);
      return;
    }
    void refreshReports();
  }, [open, refreshReports]);

  React.useEffect(() => {
    if (!open || reportStatusRefreshVersion === 0) return;
    void refreshReports();
    if (selectedReportId) {
      void refreshDetail(selectedReportId);
    }
  }, [open, refreshDetail, refreshReports, reportStatusRefreshVersion, selectedReportId]);

  const visibleReports = React.useMemo(
    () => reports.filter((report) => statusMatchesFilter(report.status, statusFilter)),
    [reports, statusFilter]
  );

  React.useEffect(() => {
    if (!open) return;
    if (visibleReports.length === 0) {
      setSelectedReportId(null);
      setDetail(null);
      return;
    }
    if (!selectedReportId || !visibleReports.some((report) => report.reportId === selectedReportId)) {
      setSelectedReportId(visibleReports[0].reportId);
    }
  }, [open, selectedReportId, visibleReports]);

  React.useEffect(() => {
    if (!open || !selectedReportId) return;
    void refreshDetail(selectedReportId);
  }, [open, refreshDetail, selectedReportId]);

  const runAction = async (task: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      await refreshReports();
      if (selectedReportId) {
        await refreshDetail(selectedReportId);
      }
      toast.success(successMessage);
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'Failed moderation action.'));
    } finally {
      setBusy(false);
    }
  };

  const selectedServerPermissions = detail
    ? serverPermissionsById[detail.communityId]
    : undefined;
  const primaryLinkedMessageId = detail?.linkedMessages[0]?.messageId ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="app" className="border-[#304867] bg-[#111a2b] p-0 text-white">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="border-b border-[#263a58] px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <ShieldAlert className="size-5 text-[#ffcf82]" />
                  Server Modmail
                </DialogTitle>
                <DialogDescription className="text-[#a9b8cf]">
                  Review reports filed against the servers you manage.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-[#355077] text-[#d5e4ff]">
                  {currentUserDisplayName}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#304867] text-white"
                  onClick={() => {
                    void refreshReports();
                    if (selectedReportId) void refreshDetail(selectedReportId);
                  }}
                  disabled={loadingReports || loadingDetail}
                >
                  <RefreshCcw
                    className={`size-4 ${(loadingReports || loadingDetail) ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[0.95fr_1.45fr]">
            <div className="min-h-0 border-b border-[#263a58] xl:border-b-0 xl:border-r">
              <div className="space-y-3 border-b border-[#263a58] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">Report Inbox</span>
                  <Badge variant="outline" className="border-[#304867] text-[#cfe0ff]">
                    {visibleReports.length}
                  </Badge>
                </div>

                {managedServers.length > 1 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-[#a9b8cf]">Server</Label>
                    <Select value={serverFilter} onValueChange={setServerFilter}>
                      <SelectTrigger className="w-full border-[#304867] bg-[#142033] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-[#304867] bg-[#142033] text-white">
                        <SelectItem value="all">All servers</SelectItem>
                        {managedServers.map((server) => (
                          <SelectItem key={server.id} value={server.id}>
                            {server.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((filter) => (
                    <Button
                      key={filter.value}
                      type="button"
                      size="sm"
                      variant="outline"
                      className={
                        statusFilter === filter.value
                          ? 'border-[#5b92e8] bg-[#13233c] text-white'
                          : 'border-[#304867] bg-[#142033] text-[#cfe0ff]'
                      }
                      onClick={() => setStatusFilter(filter.value)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </div>

              <ScrollArea className="h-full max-h-[40dvh] xl:max-h-none">
                <div className="space-y-2 p-3">
                  {loadingReports ? (
                    Array.from({ length: 4 }, (_, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-[#304867] bg-[#142033] px-3 py-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-4 w-36 bg-[#22334f]" />
                            <Skeleton className="h-5 w-20 rounded-full bg-[#22334f]" />
                          </div>
                          <Skeleton className="h-3 w-40 bg-[#1b2a42]" />
                          <Skeleton className="h-3 w-44 bg-[#1b2a42]" />
                        </div>
                      </div>
                    ))
                  ) : visibleReports.length === 0 ? (
                    <p className="text-sm text-[#a9b8cf]">No reports in this filter.</p>
                  ) : (
                    visibleReports.map((report) => (
                      <button
                        key={report.reportId}
                        type="button"
                        onClick={() => setSelectedReportId(report.reportId)}
                        className={`w-full rounded-md border px-3 py-3 text-left ${
                          report.reportId === selectedReportId
                            ? 'border-[#5b92e8] bg-[#13233c]'
                            : 'border-[#304867] bg-[#142033] hover:bg-[#182841]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="border-[#304867] text-[#d5e4ff]">
                            {reportTypeLabel(report.reportType)}
                          </Badge>
                          <Badge variant="outline" className={statusBadgeClass(report.status)}>
                            {statusLabel(report.status)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {report.reporterUsername ?? report.reporterUserId}
                        </p>
                        <p className="mt-1 text-xs text-[#a9b8cf]">{report.serverName}</p>
                        <p className="mt-1 text-xs text-[#8ea4c7]">{safeFmt(report.createdAt)}</p>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="min-h-0">
              <ScrollArea className="h-full max-h-[40dvh] xl:max-h-none">
                <div className="space-y-4 p-4">
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  {loadingDetail && !detail ? (
                    <div className="space-y-4">
                      {Array.from({ length: 3 }, (_, index) => (
                        <div
                          key={index}
                          className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3"
                        >
                          <Skeleton className="h-4 w-40 bg-[#22334f]" />
                          <Skeleton className="h-3 w-2/3 bg-[#1b2a42]" />
                          <Skeleton className="h-20 w-full bg-[#1b2a42]" />
                        </div>
                      ))}
                    </div>
                  ) : !detail ? (
                    <p className="text-sm text-[#a9b8cf]">Select a report to review.</p>
                  ) : (
                    <>
                      <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="border-[#304867] text-[#d5e4ff]">
                              {reportTypeLabel(detail.reportType)}
                            </Badge>
                            <Badge variant="outline" className="border-[#304867] text-[#d5e4ff]">
                              {destinationLabel(detail.destination)}
                            </Badge>
                          </div>
                          <Badge variant="outline" className={statusBadgeClass(detail.status)}>
                            {statusLabel(detail.status)}
                          </Badge>
                        </div>
                        <p className="text-sm font-semibold text-white">
                          Reporter: {detail.reporterUsername ?? detail.reporterUserId}
                        </p>
                        <p className="text-xs text-[#a9b8cf]">
                          Filed {safeFmt(detail.createdAt)} | Last updated {safeFmt(detail.updatedAt)}
                        </p>
                      </div>

                      <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {STATUS_ACTIONS.map((action) => (
                            <Button
                              key={action.value}
                              type="button"
                              size="sm"
                              variant="outline"
                              className={
                                detail.status === action.value
                                  ? 'border-[#5b92e8] bg-[#13233c] text-white'
                                  : 'border-[#304867] bg-[#101a2b] text-[#d5e4ff]'
                              }
                              disabled={busy || detail.status === action.value}
                              onClick={() => {
                                void runAction(
                                  () =>
                                    serverModmailBackend.updateReportStatus(
                                      detail.reportId,
                                      action.value
                                    ),
                                  `Report marked ${action.label.toLowerCase()}.`
                                );
                              }}
                            >
                              {action.label}
                            </Button>
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {selectedServerPermissions?.canManageMessages && primaryLinkedMessageId && (
                            <Button
                              type="button"
                              variant="outline"
                              className="border-[#304867] bg-[#101a2b] text-white"
                              onClick={() =>
                                setActionConfirm({
                                  kind: 'delete_message',
                                  reportId: detail.reportId,
                                  communityId: detail.communityId,
                                  messageId: primaryLinkedMessageId,
                                })
                              }
                            >
                              Delete Reported Message
                            </Button>
                          )}
                          {selectedServerPermissions?.canManageMembers && detail.targetUserId && (
                            <Button
                              type="button"
                              variant="outline"
                              className="border-[#304867] bg-[#101a2b] text-white"
                              onClick={() => {
                                const targetUserId = detail.targetUserId;
                                if (!targetUserId) return;

                                setActionConfirm({
                                  kind: 'kick_user',
                                  reportId: detail.reportId,
                                  communityId: detail.communityId,
                                  targetUserId,
                                  username:
                                    detail.targetDisplayName ??
                                    targetUserId.substring(0, 12),
                                });
                              }}
                            >
                              Kick Reported User
                            </Button>
                          )}
                          {selectedServerPermissions?.canManageBans && detail.targetUserId && (
                            <Button
                              type="button"
                              variant="outline"
                              className="border-[#304867] bg-[#101a2b] text-white"
                              onClick={() => {
                                const targetUserId = detail.targetUserId;
                                if (!targetUserId) return;

                                setActionConfirm({
                                  kind: 'ban_user',
                                  reportId: detail.reportId,
                                  communityId: detail.communityId,
                                  targetUserId,
                                  username:
                                    detail.targetDisplayName ??
                                    targetUserId.substring(0, 12),
                                });
                              }}
                            >
                              Ban Reported User
                            </Button>
                          )}
                          {detail.destination === 'server_admins' && detail.status !== 'escalated' && (
                            <Button
                              type="button"
                              variant="outline"
                              className="border-[#805e22] bg-[#2f2210] text-[#ffd9a2]"
                              onClick={() => setEscalateConfirmOpen(true)}
                            >
                              Escalate to Haven Moderation
                            </Button>
                          )}
                        </div>
                      </div>

                      {detail.reportType === 'message_report' &&
                      detail.snapshot &&
                      'reportedMessage' in detail.snapshot ? (
                        <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3">
                          <p className="text-sm font-semibold text-white">Captured message snapshot</p>
                          {renderSnapshotMessage(
                            detail.snapshot.reportedMessage,
                            'Reported Message',
                            'border-[#5b92e8]'
                          )}
                          {detail.snapshot.contextBefore.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-wide text-[#97acd0]">
                                Context Before
                              </p>
                              {detail.snapshot.contextBefore.map((message) =>
                                renderSnapshotMessage(message, 'Earlier Message')
                              )}
                            </div>
                          )}
                          {detail.snapshot.contextAfter.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-wide text-[#97acd0]">
                                Context After
                              </p>
                              {detail.snapshot.contextAfter.map((message) =>
                                renderSnapshotMessage(message, 'Later Message')
                              )}
                            </div>
                          )}
                        </div>
                      ) : detail.reportType === 'user_report' &&
                        detail.snapshot &&
                        'targetUserId' in detail.snapshot ? (
                        <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-2">
                          <p className="text-sm font-semibold text-white">Captured profile snapshot</p>
                          <p className="text-sm text-white">
                            {detail.snapshot.targetUsername ?? detail.snapshot.targetUserId}
                          </p>
                          <p className="text-xs text-[#a9b8cf]">
                            Captured {safeFmt(detail.snapshot.capturedAt)}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-md border border-[#304867] bg-[#142033] p-3">
                          <p className="text-sm text-[#a9b8cf]">
                            No snapshot data was captured for this report.
                          </p>
                        </div>
                      )}

                      <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3">
                        <p className="text-sm font-semibold text-white">Linked report context</p>
                        {detail.linkedChannels.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-[#97acd0]">Channels</p>
                            {detail.linkedChannels.map((channel) => (
                              <p key={channel.channelId} className="text-sm text-[#dbe7f8]">
                                {channel.channelName ?? channel.channelId}
                              </p>
                            ))}
                          </div>
                        )}
                        {detail.linkedMessages.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-[#97acd0]">
                              Linked Messages
                            </p>
                            {detail.linkedMessages.map((message) => (
                              <p key={message.messageId} className="text-sm text-[#dbe7f8]">
                                {message.channelName ? `${message.channelName} - ` : ''}
                                {message.messageId}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3">
                        <p className="text-sm font-semibold text-white">Internal notes</p>
                        {detail.internalNotes.length === 0 ? (
                          <p className="text-sm text-[#a9b8cf]">No internal notes yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {detail.internalNotes.map((note) => (
                              <div
                                key={note.id}
                                className="rounded-md border border-[#304867] bg-[#101a2b] p-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-white">
                                    {note.authorDisplayName ?? note.authorUserId}
                                  </p>
                                  <p className="text-xs text-[#8ea4c7]">{safeFmt(note.createdAt)}</p>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#dbe7f8]">
                                  {note.body}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="space-y-2">
                          <Textarea
                            value={internalNoteDraft}
                            onChange={(event) => setInternalNoteDraft(event.target.value)}
                            placeholder="Add an internal note for other moderators..."
                            className="min-h-[96px] border-[#304867] bg-[#101a2b] text-white"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="border-[#304867] bg-[#101a2b] text-white"
                            disabled={busy || internalNoteDraft.trim().length === 0}
                            onClick={() => {
                              void runAction(
                                async () => {
                                  await serverModmailBackend.addInternalNote(
                                    detail.reportId,
                                    internalNoteDraft
                                  );
                                  setInternalNoteDraft('');
                                },
                                'Internal note added.'
                              );
                            }}
                          >
                            Save Internal Note
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>

      <AlertDialog
        open={Boolean(actionConfirm)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setActionConfirm(null);
        }}
      >
        <AlertDialogContent className="border-[#304867] bg-[#18243a] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionConfirm?.kind === 'delete_message'
                ? 'Delete reported message?'
                : actionConfirm?.kind === 'kick_user'
                  ? 'Kick reported user?'
                  : 'Ban reported user?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {actionConfirm?.kind === 'delete_message'
                ? 'This removes the reported message from the server.'
                : actionConfirm?.kind === 'kick_user'
                  ? `Remove "${actionConfirm.username}" from the server without banning them?`
                  : actionConfirm
                    ? `Ban "${actionConfirm.username}" from the server?`
                    : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#304867] bg-[#1d2a42] text-white hover:bg-[#22324d]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#3f79d8] text-white hover:bg-[#325fae]"
              onClick={(event) => {
                event.preventDefault();
                if (!actionConfirm) return;

                void runAction(
                  async () => {
                    if (actionConfirm.kind === 'delete_message') {
                      const communityBackend = getCommunityDataBackend(actionConfirm.communityId);
                      await communityBackend.deleteMessage({
                        communityId: actionConfirm.communityId,
                        messageId: actionConfirm.messageId,
                      });
                      setActionConfirm(null);
                      return;
                    }

                    if (actionConfirm.kind === 'kick_user') {
                      await onKickUserFromServer({
                        targetUserId: actionConfirm.targetUserId,
                        communityId: actionConfirm.communityId,
                        username: actionConfirm.username,
                      });
                      await serverModmailBackend.updateReportStatus(
                        actionConfirm.reportId,
                        'resolved'
                      );
                      setActionConfirm(null);
                      return;
                    }

                    await onBanUserFromServer({
                      targetUserId: actionConfirm.targetUserId,
                      communityId: actionConfirm.communityId,
                      reason: `Actioned from server report ${actionConfirm.reportId}.`,
                    });
                    await serverModmailBackend.updateReportStatus(
                      actionConfirm.reportId,
                      'resolved'
                    );
                    setActionConfirm(null);
                  },
                  actionConfirm.kind === 'delete_message'
                    ? 'Reported message deleted.'
                    : actionConfirm.kind === 'kick_user'
                      ? 'Reported user removed from the server.'
                      : 'Reported user banned from the server.'
                );
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={escalateConfirmOpen} onOpenChange={setEscalateConfirmOpen}>
        <AlertDialogContent className="border-[#304867] bg-[#18243a] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Share with Haven Moderation Staff</AlertDialogTitle>
            <div className="space-y-3 text-sm text-[#a9b8cf]">
              <p>
                You are about to share this report with Haven Moderation Staff. By
                confirming you understand that the following will be submitted and
                visible to Haven staff:
              </p>
              <div className="space-y-1">
                <p>• Your display name and server role</p>
                <p>• The reported message content and author</p>
                <p>• The report context window</p>
                <p>• Reporter information</p>
              </div>
              <p>Haven Moderation Staff will NOT have access to:</p>
              <div className="space-y-1">
                <p>• Private server channels you have not shared</p>
                <p>• Direct messages</p>
                <p>• Any other server data beyond this report</p>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#304867] bg-[#1d2a42] text-white hover:bg-[#22324d]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#3f79d8] text-white hover:bg-[#325fae]"
              onClick={(event) => {
                event.preventDefault();
                if (!detail) return;

                void runAction(
                  async () => {
                    await serverModmailBackend.escalateReport(detail.reportId);
                    setEscalateConfirmOpen(false);
                  },
                  'Report shared with Haven Moderation Staff.'
                );
              }}
            >
              Share with Haven Staff
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* CHECKPOINT 5 COMPLETE */}
    </Dialog>
  );
}
