import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getModerationBackend } from '@/lib/backend';
import type {
  DmMessageReportAction,
  DmMessageReportContextMessage,
  DmMessageReportDetail,
  DmMessageReportStatus,
  DmMessageReportSummary,
} from '@/lib/backend/types';
import { getErrorMessage } from '@/shared/lib/errors';
import { RefreshCcw, ShieldAlert } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  currentUserDisplayName: string;
};

const moderationBackend = getModerationBackend();

const STATUS_OPTIONS: Array<{ value: DmMessageReportStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'triaged', label: 'Triaged' },
  { value: 'in_review', label: 'In Review' },
  { value: 'resolved_actioned', label: 'Resolved (Actioned)' },
  { value: 'resolved_no_action', label: 'Resolved (No Action)' },
  { value: 'dismissed', label: 'Dismissed' },
];

const fmt = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

const statusLabel = (status: DmMessageReportStatus) =>
  STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;

const statusBadgeClass = (status: DmMessageReportStatus) => {
  switch (status) {
    case 'open':
      return 'border-[#6a9bff] text-[#d5e6ff]';
    case 'triaged':
      return 'border-[#6f8ed6] text-[#c9dbff]';
    case 'in_review':
      return 'border-[#c4a35f] text-[#ffe7b7]';
    case 'resolved_actioned':
    case 'resolved_no_action':
      return 'border-[#5ea779] text-[#c8f2d7]';
    case 'dismissed':
      return 'border-[#7f7f93] text-[#d2d2e3]';
    default:
      return 'border-[#304867] text-[#cfe0ff]';
  }
};

export function DmReportReviewPanel({
  open,
  onOpenChange,
  currentUserId,
  currentUserDisplayName,
}: Props) {
  const [filter, setFilter] = React.useState<'all' | DmMessageReportStatus>('all');
  const [reports, setReports] = React.useState<DmMessageReportSummary[]>([]);
  const [selectedReportId, setSelectedReportId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<DmMessageReportDetail | null>(null);
  const [context, setContext] = React.useState<DmMessageReportContextMessage[]>([]);
  const [actions, setActions] = React.useState<DmMessageReportAction[]>([]);
  const [loadingReports, setLoadingReports] = React.useState(false);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [statusDraft, setStatusDraft] = React.useState<DmMessageReportStatus>('open');
  const [statusNote, setStatusNote] = React.useState('');
  const [internalNote, setInternalNote] = React.useState('');

  const refreshReports = React.useCallback(async () => {
    if (!open) return;
    setLoadingReports(true);
    setError(null);
    try {
      const nextReports = await moderationBackend.listDmMessageReportsForReview({
        statuses: filter === 'all' ? undefined : [filter],
        limit: 100,
      });
      setReports(nextReports);
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to load DM reports.'));
    } finally {
      setLoadingReports(false);
    }
  }, [filter, open]);

  const refreshDetail = React.useCallback(
    async (reportId: string) => {
      if (!open || !reportId) return;
      setLoadingDetail(true);
      setError(null);
      try {
        const [nextDetail, nextActions] = await Promise.all([
          moderationBackend.getDmMessageReportDetail(reportId),
          moderationBackend.listDmMessageReportActions(reportId),
        ]);
        setDetail(nextDetail);
        setActions(nextActions);
        if (!nextDetail) {
          setContext([]);
          return;
        }
        setStatusDraft(nextDetail.status);
        const nextContext = await moderationBackend.listDmMessageContext({
          messageId: nextDetail.messageId,
          before: 20,
          after: 20,
        });
        setContext(nextContext);
      } catch (e) {
        setError(getErrorMessage(e, 'Failed to load DM report detail.'));
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
      setContext([]);
      setActions([]);
      setError(null);
      setNotice(null);
      setStatusNote('');
      setInternalNote('');
      return;
    }
    void refreshReports();
  }, [open, refreshReports]);

  React.useEffect(() => {
    if (!open) return;
    if (reports.length === 0) {
      setSelectedReportId(null);
      setDetail(null);
      setContext([]);
      setActions([]);
      return;
    }
    if (!selectedReportId || !reports.some((row) => row.reportId === selectedReportId)) {
      setSelectedReportId(reports[0].reportId);
    }
  }, [open, reports, selectedReportId]);

  React.useEffect(() => {
    if (!open || !selectedReportId) return;
    void refreshDetail(selectedReportId);
  }, [open, refreshDetail, selectedReportId]);

  const runAction = async (task: () => Promise<void>, successMessage: string) => {
    if (!detail) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task();
      await Promise.all([refreshReports(), refreshDetail(detail.reportId)]);
      setNotice(successMessage);
    } catch (e) {
      setError(getErrorMessage(e, 'Failed moderation action.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="app" className="border-[#304867] bg-[#111a2b] text-white p-0 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="px-5 py-4 border-b border-[#263a58]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <ShieldAlert className="size-5 text-[#ffcf82]" />
                  DM Report Review
                </DialogTitle>
                <DialogDescription className="text-[#a9b8cf]">
                  Staff-only DM moderation workflow. Separate from server support reports.
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
                  <RefreshCcw className={`size-4 ${(loadingReports || loadingDetail) ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[0.95fr_1.45fr]">
            <div className="min-h-0 border-b xl:border-b-0 xl:border-r border-[#263a58]">
              <div className="px-4 py-3 border-b border-[#263a58] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">Report Inbox</span>
                  <Badge variant="outline" className="border-[#304867] text-[#cfe0ff]">
                    {reports.length}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-[#a9b8cf]">Filter</Label>
                  <Select
                    value={filter}
                    onValueChange={(value) => {
                      setFilter(value as 'all' | DmMessageReportStatus);
                      setSelectedReportId(null);
                    }}
                  >
                    <SelectTrigger className="w-full bg-[#142033] border-[#304867] text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#142033] border-[#304867] text-white">
                      <SelectItem value="all">All</SelectItem>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <ScrollArea className="h-full max-h-[40dvh] xl:max-h-none">
                <div className="p-3 space-y-2">
                  {loadingReports ? (
                    Array.from({ length: 4 }, (_, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-[#304867] bg-[#142033] px-3 py-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-4 w-32 bg-[#22334f]" />
                            <Skeleton className="h-5 w-20 rounded-full bg-[#22334f]" />
                          </div>
                          <Skeleton className="h-3 w-40 bg-[#1b2a42]" />
                          <Skeleton className="h-3 w-44 bg-[#1b2a42]" />
                          <Skeleton className="h-3 w-full bg-[#1b2a42]" />
                        </div>
                      </div>
                    ))
                  ) : reports.length === 0 ? (
                    <p className="text-sm text-[#a9b8cf]">No reports in this filter.</p>
                  ) : (
                    reports.map((row) => (
                      <button
                        key={row.reportId}
                        type="button"
                        onClick={() => setSelectedReportId(row.reportId)}
                        className={`w-full rounded-md border px-3 py-3 text-left ${
                          row.reportId === selectedReportId
                            ? 'border-[#5b92e8] bg-[#13233c]'
                            : 'border-[#304867] bg-[#142033] hover:bg-[#182841]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white break-all">
                            {row.reportedUsername || row.reportedUserId}
                          </p>
                          <Badge variant="outline" className={statusBadgeClass(row.status)}>
                            {statusLabel(row.status)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-[#a9b8cf]">
                          Reporter: {row.reporterUsername || row.reporterUserId}
                        </p>
                        <p className="mt-1 text-xs text-[#8ea4c7]">
                          {fmt(row.createdAt)} | {row.assignedToUsername ? `Assigned: ${row.assignedToUsername}` : 'Unassigned'}
                        </p>
                        <p className="mt-2 text-xs text-[#dbe7f8] whitespace-pre-wrap break-words">
                          {row.comment}
                        </p>
                        <p className="mt-1 text-xs text-[#9fb2cf] line-clamp-2">
                          Message: {row.messagePreview || '(No preview)'}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="min-h-0">
              <ScrollArea className="h-full max-h-[40dvh] xl:max-h-none">
                <div className="p-4 space-y-4">
                  {loadingDetail && !detail ? (
                    <div className="space-y-4">
                      {Array.from({ length: 3 }, (_, index) => (
                        <div
                          key={index}
                          className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-4 w-32 bg-[#22334f]" />
                            <Skeleton className="h-5 w-20 rounded-full bg-[#22334f]" />
                          </div>
                          <Skeleton className="h-3 w-2/3 bg-[#1b2a42]" />
                          <Skeleton className="h-3 w-full bg-[#1b2a42]" />
                          <Skeleton className="h-16 w-full bg-[#1b2a42]" />
                        </div>
                      ))}
                    </div>
                  ) : !detail ? (
                    <p className="text-sm text-[#a9b8cf]">Select a report to review.</p>
                  ) : (
                    <>
                      <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white">Report Detail</p>
                          <Badge variant="outline" className={statusBadgeClass(detail.status)}>
                            {statusLabel(detail.status)}
                          </Badge>
                        </div>
                        <p className="text-xs text-[#a9b8cf]">
                          Reporter: {detail.reporterUsername || detail.reporterUserId} | Reported: {detail.reportedUsername || detail.reportedUserId}
                        </p>
                        <p className="text-xs text-[#a9b8cf]">
                          Assigned: {detail.assignedToUsername || 'Unassigned'} | Updated: {fmt(detail.updatedAt)}
                        </p>
                        <div className="rounded border border-[#2a3f60] bg-[#101a2b] p-2">
                          <p className="text-xs uppercase tracking-wide text-[#97acd0]">Report Comment</p>
                          <p className="mt-1 text-sm text-[#dbe7f8] whitespace-pre-wrap break-words">{detail.comment}</p>
                        </div>
                        {detail.resolutionNotes && (
                          <div className="rounded border border-[#2a3f60] bg-[#101a2b] p-2">
                            <p className="text-xs uppercase tracking-wide text-[#97acd0]">Resolution Notes</p>
                            <p className="mt-1 text-sm text-[#dbe7f8] whitespace-pre-wrap break-words">{detail.resolutionNotes}</p>
                          </div>
                        )}
                      </div>

                      <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-2">
                        <p className="text-sm font-semibold text-white">Reported Message + Context</p>
                        <p className="text-xs text-[#a9b8cf]">
                          Author: {detail.messageAuthorUsername || detail.messageAuthorUserId} | {fmt(detail.messageCreatedAt)}
                        </p>
                        <div className="rounded border border-[#2a3f60] bg-[#101a2b] p-2">
                          <p className="whitespace-pre-wrap break-words text-sm text-[#dbe7f8]">{detail.messageContent}</p>
                        </div>
                        <div className="space-y-2">
                          {context.map((message) => (
                            <div
                              key={message.messageId}
                              className={`rounded border px-2 py-2 ${
                                message.isTarget ? 'border-[#5b92e8] bg-[#13233c]' : 'border-[#2a3f60] bg-[#101a2b]'
                              }`}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold text-white">
                                  {message.authorUsername || message.authorUserId}
                                </span>
                                <span className="text-[11px] text-[#8ea4c7]">{fmt(message.createdAt)}</span>
                                {message.isTarget && (
                                  <Badge variant="outline" className="border-[#5b92e8] text-[#cce0ff]">
                                    Reported
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 whitespace-pre-wrap break-words text-xs text-[#dbe7f8]">
                                {message.content}
                              </p>
                            </div>
                          ))}
                          {context.length === 0 && <p className="text-sm text-[#a9b8cf]">No context available.</p>}
                        </div>
                      </div>

                      <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3">
                        <p className="text-sm font-semibold text-white">Moderation Actions</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              void runAction(
                                () =>
                                  moderationBackend.assignDmMessageReport({
                                    reportId: detail.reportId,
                                    assigneeUserId: currentUserId,
                                  }).then(() => undefined),
                                'Assigned report to yourself.'
                              );
                            }}
                          >
                            Assign to me
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => {
                              void runAction(
                                () =>
                                  moderationBackend.assignDmMessageReport({
                                    reportId: detail.reportId,
                                    assigneeUserId: null,
                                  }).then(() => undefined),
                                'Unassigned report.'
                              );
                            }}
                          >
                            Unassign
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-xs text-[#a9b8cf]">Status</Label>
                            <Select
                              value={statusDraft}
                              onValueChange={(value) => setStatusDraft(value as DmMessageReportStatus)}
                            >
                              <SelectTrigger className="w-full bg-[#142033] border-[#304867] text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-[#142033] border-[#304867] text-white">
                                {STATUS_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Textarea
                              value={statusNote}
                              onChange={(event) => setStatusNote(event.target.value)}
                              placeholder="Optional status note / resolution note"
                              className="min-h-[80px] resize-y bg-[#142033] border-[#304867] text-white placeholder:text-[#89a1c3]"
                              disabled={busy}
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                const nextNote = statusNote.trim();
                                void runAction(
                                  () =>
                                    moderationBackend.updateDmMessageReportStatus({
                                      reportId: detail.reportId,
                                      status: statusDraft,
                                      notes: nextNote || null,
                                    }).then(() => undefined),
                                  'Updated report status.'
                                );
                                setStatusNote('');
                              }}
                            >
                              Update Status
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs text-[#a9b8cf]">Internal Note</Label>
                            <Textarea
                              value={internalNote}
                              onChange={(event) => setInternalNote(event.target.value)}
                              placeholder="Private note for Haven staff"
                              className="min-h-[120px] resize-y bg-[#142033] border-[#304867] text-white placeholder:text-[#89a1c3]"
                              disabled={busy}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busy || internalNote.trim().length === 0}
                              onClick={() => {
                                const nextNote = internalNote.trim();
                                if (!nextNote) return;
                                void runAction(
                                  () =>
                                    moderationBackend.addDmMessageReportAction({
                                      reportId: detail.reportId,
                                      actionType: 'note',
                                      notes: nextNote,
                                    }).then(() => undefined),
                                  'Added moderation note.'
                                );
                                setInternalNote('');
                              }}
                            >
                              Add Note
                            </Button>
                          </div>
                        </div>

                        {notice && (
                          <div className="rounded-md border border-[#315848] bg-[#14261f] px-3 py-2 text-sm text-[#c8f2d7]">
                            {notice}
                          </div>
                        )}
                      </div>

                      <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-2">
                        <p className="text-sm font-semibold text-white">Audit Trail</p>
                        {actions.length === 0 ? (
                          <p className="text-sm text-[#a9b8cf]">No moderation actions recorded yet.</p>
                        ) : (
                          actions.map((action) => (
                            <div key={action.actionId} className="rounded border border-[#2a3f60] bg-[#101a2b] px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="border-[#304867] text-[#cfe0ff]">
                                  {action.actionType}
                                </Badge>
                                <span className="text-xs text-[#dbe7f8]">
                                  {action.actedByUsername || action.actedByUserId}
                                </span>
                                <span className="text-[11px] text-[#8ea4c7]">{fmt(action.createdAt)}</span>
                              </div>
                              {action.notes && (
                                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#dbe7f8]">
                                  {action.notes}
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}

                  {error && (
                    <div className="rounded-md border border-[#5a2d3d] bg-[#2a1821] px-3 py-2 text-sm text-[#ffd4df]">
                      {error}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
