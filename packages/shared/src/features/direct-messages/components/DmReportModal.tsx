import React from 'react';
import { Button } from '@shared/app/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/app/ui/dialog';
import { Label } from '@shared/app/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/app/ui/select';
import { Textarea } from '@shared/app/ui/textarea';
import type { DirectMessageReportKind } from '@shared/lib/backend/types';

type DmReportTarget = {
  messageId: string;
  authorUsername: string;
  messagePreview: string;
};

type DmReportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DmReportTarget | null;
  onSubmit: (input: { messageId: string; kind: DirectMessageReportKind; comment: string }) => Promise<void>;
};

const previewMessage = (value: string) =>
  value.length > 220 ? `${value.slice(0, 220).trimEnd()}...` : value;

export function DmReportModal({ open, onOpenChange, target, onSubmit }: DmReportModalProps) {
  const [kind, setKind] = React.useState<DirectMessageReportKind>('content_abuse');
  const [comment, setComment] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setKind('content_abuse');
      setComment('');
      setSubmitting(false);
      setSubmitError(null);
      setSubmitted(false);
      return;
    }

    setSubmitError(null);
    setSubmitted(false);
  }, [open, target?.messageId]);

  const handleSubmit = async () => {
    if (!target) return;
    const trimmedComment = comment.trim();
    if (!trimmedComment) {
      setSubmitError('Please add a brief reason for this report.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        messageId: target.messageId,
        kind,
        comment: trimmedComment,
      });
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit DM report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-surface-app text-white">
        <DialogHeader>
          <DialogTitle>Report Direct Message</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Reports are sent to the Haven Moderation Team for review. This is separate from server-based moderation reports.
          </DialogDescription>
        </DialogHeader>

        {!submitted ? (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-surface-panel p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Reported Message</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {target?.authorUsername?.trim() || 'Unknown User'}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-report-body">
                {target ? previewMessage(target.messagePreview) : 'No message selected.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dm-report-kind" className="text-form-label">
                Report Type
              </Label>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as DirectMessageReportKind)}
                disabled={submitting}
              >
                <SelectTrigger id="dm-report-kind" className="w-full bg-surface-panel border-border text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-panel border-border text-white">
                  <SelectItem value="content_abuse">Content abuse</SelectItem>
                  <SelectItem value="bug">Bug / incorrect behavior</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dm-report-comment" className="text-form-label">
                Reason
              </Label>
              <Textarea
                id="dm-report-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Briefly describe why you are reporting this DM."
                className="min-h-[120px] resize-y bg-surface-panel border-border text-white placeholder:text-muted-foreground"
                disabled={submitting}
              />
              <div className="flex items-center justify-between text-xs text-report-meta">
                <span>Required. 1-2000 characters.</span>
                <span>{comment.trim().length}/2000</span>
              </div>
            </div>

            {submitError && (
              <div className="rounded-md border border-border-destructive-panel bg-surface-destructive-panel px-3 py-2 text-sm text-destructive-banner">
                {submitError}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-border-badge bg-surface-panel p-4">
            <p className="text-sm font-semibold text-white">Report submitted</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The Haven Moderation Team received your DM report and can review it in the DM moderation workflow.
            </p>
          </div>
        )}

        <DialogFooter>
          {!submitted && (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
          )}
          {submitted ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || !target}
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { DmReportTarget };
