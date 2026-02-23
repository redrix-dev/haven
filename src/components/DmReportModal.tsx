import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { DirectMessageReportKind } from '@/lib/backend/types';

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
      <DialogContent className="border-[#304867] bg-[#111a2b] text-white">
        <DialogHeader>
          <DialogTitle>Report Direct Message</DialogTitle>
          <DialogDescription className="text-[#a9b8cf]">
            Reports are sent to Haven for review. This is separate from server-based moderation reports.
          </DialogDescription>
        </DialogHeader>

        {!submitted ? (
          <div className="space-y-4">
            <div className="rounded-md border border-[#304867] bg-[#142033] p-3">
              <p className="text-xs uppercase tracking-wide text-[#9fb2cf]">Reported Message</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {target?.authorUsername?.trim() || 'Unknown User'}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#cddcf2]">
                {target ? previewMessage(target.messagePreview) : 'No message selected.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dm-report-kind" className="text-[#dce8fb]">
                Report Type
              </Label>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as DirectMessageReportKind)}
                disabled={submitting}
              >
                <SelectTrigger id="dm-report-kind" className="w-full bg-[#142033] border-[#304867] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#142033] border-[#304867] text-white">
                  <SelectItem value="content_abuse">Content abuse</SelectItem>
                  <SelectItem value="bug">Bug / incorrect behavior</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dm-report-comment" className="text-[#dce8fb]">
                Reason
              </Label>
              <Textarea
                id="dm-report-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Briefly describe why you are reporting this DM."
                className="min-h-[120px] resize-y bg-[#142033] border-[#304867] text-white placeholder:text-[#89a1c3]"
                disabled={submitting}
              />
              <div className="flex items-center justify-between text-xs text-[#93a8c8]">
                <span>Required. 1-2000 characters.</span>
                <span>{comment.trim().length}/2000</span>
              </div>
            </div>

            {submitError && (
              <div className="rounded-md border border-[#5a2d3d] bg-[#2a1821] px-3 py-2 text-sm text-[#ffd4df]">
                {submitError}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-[#355077] bg-[#142033] p-4">
            <p className="text-sm font-semibold text-white">Report submitted</p>
            <p className="mt-1 text-sm text-[#a9b8cf]">
              Haven received your DM report and can review it in the DM moderation workflow.
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
