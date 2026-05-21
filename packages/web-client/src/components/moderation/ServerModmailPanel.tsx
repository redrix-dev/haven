import React from 'react';
import { Badge } from '@shared/app/ui/badge';
import { Button } from '@shared/app/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@shared/app/ui/dialog';
import { Label } from '@shared/app/ui/label';
import { ScrollArea } from '@shared/app/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/app/ui/select';
import { Skeleton } from '@shared/app/ui/skeleton';
import { Textarea } from '@shared/app/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@shared/app/ui/alert-dialog';
import { getCommunityDataBackend } from '@shared/lib/backend';
import { useHavenCore } from '@shared/core';
import type {
  ServerPermissions,
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
    case 'resolved_by_platform':
      return 'Resolved by Platform';
  }
};

const statusBadgeClass = (status: SupportReportStatus) => {
  switch (status) {
    case 'pending':
      return 'border-mod-tier-blue-border text-nav-strong';
    case 'under_review':
      return 'border-mod-tier-gold-border text-mod-tier-gold-text';
    case 'resolved':
      return 'border-mod-tier-green-border text-mod-tier-green-text';
    case 'dismissed':
      return 'border-mod-tier-gray-border text-mod-tier-gray-text';
    case 'escalated':
      return 'border-mod-tier-purple-border text-mod-tier-purple-text';
    case 'resolved_by_platform':
      return 'border-mod-tier-purple-border text-mod-tier-purple-text';
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
  accentClassName = 'border-border'
) => (
  <div className={`rounded-md border ${accentClassName} bg-surface-inset p-3`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs uppercase tracking-wide text-label-muted">{label}</p>
      <p className="text-xs text-muted-foreground">{safeFmt(message.createdAt)}</p>
    </div>
    <p className="mt-1 text-sm font-medium text-white">
      {message.authorUsername ?? message.authorUserId ?? 'Unknown user'}
    </p>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-banner">
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
  onBanUserFromServer,
  onKickUserFromServer,
}: Props) {
  const core = useHavenCore();
  const [serverFilter, setServerFilter] = React.useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = React.useState<VisibleStatusFilter>('all');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [internalNoteDraft, setInternalNoteDraft] = React.useState('');
  const [actionConfirm, setActionConfirm] = React.useState<ActionConfirmState | null>(null);
  const [escalateConfirmOpen, setEscalateConfirmOpen] = React.useState(false);

  // Nexus-driven state — no local entity state
  const reports = core.moderation.useReports(
    serverFilter !== 'all' ? serverFilter : undefined,
    statusFilter !== 'all' ? statusFilter : undefined,
  );
  const detail = core.moderation.useDetail();
  const selectedReportId = core.moderation.useSelectedReportId();
  const loadingReports = core.moderation.useIsLoadingReports();
  const loadingDetail = core.moderation.useIsLoadingDetail();

  const managedServerIds = React.useMemo(
    () => managedServers.map((s) => s.id),
    [managedServers],
  );

  // Load reports when panel opens; reset UI on close
  React.useEffect(() => {
    if (!open) {
      core.moderation.clearSelection();
      setBusy(false);
      setError(null);
      setInternalNoteDraft('');
      setActionConfirm(null);
      setEscalateConfirmOpen(false);
      return;
    }
    void core.moderation.load(managedServerIds);
  }, [open, core, managedServerIds]);

  // reports from the nexus hook is already filtered — alias for clarity
  const visibleReports = reports;

  // Auto-select the first visible report when the list changes
  React.useEffect(() => {
    if (!open) return;
    if (visibleReports.length === 0) {
      core.moderation.clearSelection();
      return;
    }
    if (!selectedReportId || !visibleReports.some((report) => report.reportId === selectedReportId)) {
      void core.moderation.selectReport(visibleReports[0].reportId);
    }
  }, [open, core, selectedReportId, visibleReports]);

  // Fetch detail when a report is selected
  React.useEffect(() => {
    if (!open || !selectedReportId) return;
    void core.moderation.selectReport(selectedReportId);
  }, [open, core, selectedReportId]);

  const runAction = async (task: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError(null);
    try {
      await task();
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
      <DialogContent size="app" className="border-border bg-surface-app p-0 text-white">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="border-b border-border-panel px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <ShieldAlert className="size-5 text-mod-callout" />
                  Server Modmail
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Review reports filed against the servers you manage.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-border-badge text-nav">
                  {currentUserDisplayName}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  className="border-border text-white"
                  onClick={() => {
                    void core.moderation.load(managedServerIds);
                    if (selectedReportId) void core.moderation.selectReport(selectedReportId);
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
            <div className="min-h-0 border-b border-border-panel xl:border-b-0 xl:border-r">
              <div className="space-y-3 border-b border-border-panel px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">Report Inbox</span>
                  <Badge variant="outline" className="border-border text-pill">
                    {visibleReports.length}
                  </Badge>
                </div>

                {managedServers.length > 1 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Server</Label>
                    <Select value={serverFilter} onValueChange={setServerFilter}>
                      <SelectTrigger className="w-full border-border bg-surface-panel text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border bg-surface-panel text-white">
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
                          ? 'border-border-selected bg-surface-row-active text-white'
                          : 'border-border bg-surface-panel text-pill'
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
                        className="rounded-md border border-border bg-surface-panel px-3 py-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-4 w-36 bg-surface-hover" />
                            <Skeleton className="h-5 w-20 rounded-full bg-surface-hover" />
                          </div>
                          <Skeleton className="h-3 w-40 bg-surface-skeleton" />
                          <Skeleton className="h-3 w-44 bg-surface-skeleton" />
                        </div>
                      </div>
                    ))
                  ) : visibleReports.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No reports in this filter.</p>
                  ) : (
                    visibleReports.map((report) => (
                      <button
                        key={report.reportId}
                        type="button"
                        onClick={() => void core.moderation.selectReport(report.reportId)}
                        className={`w-full rounded-md border px-3 py-3 text-left ${
                          report.reportId === selectedReportId
                            ? 'border-border-selected bg-surface-row-active'
                            : 'border-border bg-surface-panel hover:bg-surface-list-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="border-border text-nav">
                            {reportTypeLabel(report.reportType)}
                          </Badge>
                          <Badge variant="outline" className={statusBadgeClass(report.status)}>
                            {statusLabel(report.status)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {report.reporterUsername ?? report.reporterUserId}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{report.serverName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{safeFmt(report.createdAt)}</p>
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
                          className="rounded-md border border-border bg-surface-panel p-3 space-y-3"
                        >
                          <Skeleton className="h-4 w-40 bg-surface-hover" />
                          <Skeleton className="h-3 w-2/3 bg-surface-skeleton" />
                          <Skeleton className="h-20 w-full bg-surface-skeleton" />
                        </div>
                      ))}
                    </div>
                  ) : !detail ? (
                    <p className="text-sm text-muted-foreground">Select a report to review.</p>
                  ) : (
                    <>
                      <div className="rounded-md border border-border bg-surface-panel p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="border-border text-nav">
                              {reportTypeLabel(detail.reportType)}
                            </Badge>
                            <Badge variant="outline" className="border-border text-nav">
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
                        <p className="text-xs text-muted-foreground">
                          Filed {safeFmt(detail.createdAt)} | Last updated {safeFmt(detail.updatedAt)}
                        </p>
                      </div>

                      {/* Platform action notice — shown when Haven staff has acted on this report */}
                      {detail.platformAction && (
                        <div className="rounded-md border border-mod-tier-purple-border bg-mod-tier-warn-bg p-3 space-y-2">
                          <p className="text-sm font-semibold text-mod-tier-purple-text">
                            Haven Platform Moderation has acted on this report
                          </p>
                          <div className="space-y-1 text-sm text-banner">
                            {detail.platformAction.user_banned === true && (
                              <p>✓ User has been platform banned</p>
                            )}
                            {detail.platformAction.content_removed === true && (
                              <p>✓ Reported content has been removed</p>
                            )}
                            {detail.platformAction.user_banned !== true && (
                              <p className="text-mod-tier-gold-text">⚠ User has not been platform banned — community action may still be appropriate</p>
                            )}
                            {detail.platformAction.content_removed !== true && (
                              <p className="text-mod-tier-gold-text">⚠ Content has not been removed by platform — community action may still be required</p>
                            )}
                          </div>
                          {detail.status === 'resolved_by_platform' && (
                            <Button
                              type="button"
                              variant="outline"
                              className="border-mod-tier-green-border text-mod-tier-green-text mt-2"
                              disabled={busy}
                              onClick={() => {
                                void runAction(
                                  () => core.moderation.acknowledge(detail.reportId),
                                  'Report acknowledged.'
                                );
                              }}
                            >
                              Acknowledge & Close
                            </Button>
                          )}
                        </div>
                      )}

                      <div className="rounded-md border border-border bg-surface-panel p-3 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {STATUS_ACTIONS.map((action) => (
                            <Button
                              key={action.value}
                              type="button"
                              size="sm"
                              variant="outline"
                              className={
                                detail.status === action.value
                                  ? 'border-border-selected bg-surface-row-active text-white'
                                  : 'border-border bg-surface-inset text-nav'
                              }
                              disabled={busy || detail.status === action.value}
                              onClick={() => {
                                void runAction(
                                  () => core.moderation.updateStatus(detail.reportId, action.value),
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
                              className="border-border bg-surface-inset text-white"
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
                              className="border-border bg-surface-inset text-white"
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
                              className="border-border bg-surface-inset text-white"
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
                              className="border-mod-tier-warn-border bg-mod-tier-warn-bg text-mod-tier-warn-text"
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
                        <div className="rounded-md border border-border bg-surface-panel p-3 space-y-3">
                          <p className="text-sm font-semibold text-white">Captured message snapshot</p>
                          {renderSnapshotMessage(
                            detail.snapshot.reportedMessage,
                            'Reported Message',
                            'border-border-selected'
                          )}
                          {detail.snapshot.contextBefore.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-wide text-label-muted">
                                Context Before
                              </p>
                              {detail.snapshot.contextBefore.map((message) =>
                                renderSnapshotMessage(message, 'Earlier Message')
                              )}
                            </div>
                          )}
                          {detail.snapshot.contextAfter.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-wide text-label-muted">
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
                        <div className="rounded-md border border-border bg-surface-panel p-3 space-y-2">
                          <p className="text-sm font-semibold text-white">Captured profile snapshot</p>
                          <p className="text-sm text-white">
                            {detail.snapshot.targetUsername ?? detail.snapshot.targetUserId}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Captured {safeFmt(detail.snapshot.capturedAt)}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-md border border-border bg-surface-panel p-3">
                          <p className="text-sm text-muted-foreground">
                            No snapshot data was captured for this report.
                          </p>
                        </div>
                      )}

                      <div className="rounded-md border border-border bg-surface-panel p-3 space-y-3">
                        <p className="text-sm font-semibold text-white">Linked report context</p>
                        {detail.linkedChannels.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-label-muted">Channels</p>
                            {detail.linkedChannels.map((channel) => (
                              <p key={channel.channelId} className="text-sm text-banner">
                                {channel.channelName ?? channel.channelId}
                              </p>
                            ))}
                          </div>
                        )}
                        {detail.linkedMessages.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-label-muted">
                              Linked Messages
                            </p>
                            {detail.linkedMessages.map((message) => (
                              <p key={message.messageId} className="text-sm text-banner">
                                {message.channelName ? `${message.channelName} - ` : ''}
                                {message.messageId}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-md border border-border bg-surface-panel p-3 space-y-3">
                        <p className="text-sm font-semibold text-white">Internal notes</p>
                        {detail.internalNotes.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No internal notes yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {detail.internalNotes.map((note) => (
                              <div
                                key={note.id}
                                className="rounded-md border border-border bg-surface-inset p-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-white">
                                    {note.authorDisplayName ?? note.authorUserId}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{safeFmt(note.createdAt)}</p>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-banner">
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
                            className="min-h-[96px] border-border bg-surface-inset text-white"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="border-border bg-surface-inset text-white"
                            disabled={busy || internalNoteDraft.trim().length === 0}
                            onClick={() => {
                              void runAction(
                                async () => {
                                  await core.moderation.addNote(detail.reportId, internalNoteDraft);
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
        <AlertDialogContent className="border-border bg-surface-legal text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionConfirm?.kind === 'delete_message'
                ? 'Delete reported message?'
                : actionConfirm?.kind === 'kick_user'
                  ? 'Kick reported user?'
                  : 'Ban reported user?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
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
            <AlertDialogCancel className="border-border bg-muted text-white hover:bg-secondary">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-white hover:bg-primary-hover"
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
                      await core.moderation.updateStatus(actionConfirm.reportId, 'resolved');
                      setActionConfirm(null);
                      return;
                    }

                    await onBanUserFromServer({
                      targetUserId: actionConfirm.targetUserId,
                      communityId: actionConfirm.communityId,
                      reason: `Actioned from server report ${actionConfirm.reportId}.`,
                    });
                    await core.moderation.updateStatus(actionConfirm.reportId, 'resolved');
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
        <AlertDialogContent className="border-border bg-surface-legal text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Share with Haven Moderation Staff</AlertDialogTitle>
            <div className="space-y-3 text-sm text-muted-foreground">
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
            <AlertDialogCancel className="border-border bg-muted text-white hover:bg-secondary">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-white hover:bg-primary-hover"
              onClick={(event) => {
                event.preventDefault();
                if (!detail) return;

                void runAction(
                  async () => {
                    await core.moderation.escalate(detail.reportId);
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
    </Dialog>
  );
}
