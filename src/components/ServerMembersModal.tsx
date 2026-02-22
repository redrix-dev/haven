import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { BanEligibleServer, CommunityMemberListItem } from '@/lib/backend/types';
import { ProfileContextMenu } from '@/components/ProfileContextMenu';
import { getErrorMessage } from '@/shared/lib/errors';

interface ServerMembersModalProps {
  open: boolean;
  serverName: string;
  loading: boolean;
  error: string | null;
  members: CommunityMemberListItem[];
  canReportProfiles: boolean;
  canBanProfiles: boolean;
  onResolveBanServers: (targetUserId: string) => Promise<BanEligibleServer[]>;
  onDirectMessage: (targetUserId: string) => void;
  onReportUser: (targetUserId: string, reason: string) => Promise<void> | void;
  onBanUser: (targetUserId: string, communityId: string, reason: string) => Promise<void> | void;
  onClose: () => void;
}

export function ServerMembersModal({
  open,
  serverName,
  loading,
  error,
  members,
  canReportProfiles,
  canBanProfiles,
  onResolveBanServers,
  onDirectMessage,
  onReportUser,
  onBanUser,
  onClose,
}: ServerMembersModalProps) {
  const [search, setSearch] = React.useState('');
  const [reportDraft, setReportDraft] = React.useState<{
    targetUserId: string;
    username: string;
  } | null>(null);
  const [reportReason, setReportReason] = React.useState('');
  const [reportSubmitting, setReportSubmitting] = React.useState(false);
  const [banDraft, setBanDraft] = React.useState<{
    targetUserId: string;
    communityId: string;
    username: string;
  } | null>(null);
  const [banReason, setBanReason] = React.useState('');
  const [banSubmitting, setBanSubmitting] = React.useState(false);
  const [banConfirmOpen, setBanConfirmOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      setReportDraft(null);
      setReportReason('');
      setReportSubmitting(false);
      setBanDraft(null);
      setBanReason('');
      setBanSubmitting(false);
      setBanConfirmOpen(false);
      setActionError(null);
    }
  }, [open]);

  const filteredMembers = React.useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) => member.displayName.toLowerCase().includes(normalized));
  }, [members, search]);

  const membersByUserId = React.useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members]
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent size="lg" className="bg-[#18243a] border-[#304867] text-white">
        <DialogHeader>
          <DialogTitle>Members - {serverName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search members..."
            className="bg-[#142033] border-[#304867] text-white"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          {actionError && <p className="text-xs text-red-400">{actionError}</p>}
          {loading ? (
            <p className="text-sm text-[#a9b8cf]">Loading members...</p>
          ) : (
            <ScrollArea className="h-[420px] rounded-md border border-[#304867] bg-[#142033]">
              <div className="p-2 space-y-1">
                {filteredMembers.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-[#a9b8cf]">No members found.</p>
                ) : (
                  filteredMembers.map((member) => {
                    const avatarInitial = member.displayName.trim().charAt(0).toUpperCase() || 'U';

                    return (
                      <ProfileContextMenu
                        key={member.memberId}
                        userId={member.userId}
                        username={member.displayName}
                        avatarUrl={member.avatarUrl}
                        canReport={canReportProfiles}
                        canBan={canBanProfiles}
                        onDirectMessage={onDirectMessage}
                        onReport={(targetUserId) => {
                          const targetMember = membersByUserId.get(targetUserId);
                          setReportDraft({
                            targetUserId,
                            username: targetMember?.displayName ?? targetUserId.substring(0, 12),
                          });
                          setReportReason('');
                          setActionError(null);
                        }}
                        onBan={(targetUserId, communityId) => {
                          const targetMember = membersByUserId.get(targetUserId);
                          setBanDraft({
                            targetUserId,
                            communityId,
                            username: targetMember?.displayName ?? targetUserId.substring(0, 12),
                          });
                          setBanReason('');
                          setBanConfirmOpen(false);
                          setActionError(null);
                        }}
                        resolveBanServers={onResolveBanServers}
                      >
                        <div className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-[#1a2a43]">
                          <div className="min-w-0 flex items-center gap-2">
                            <Avatar size="sm">
                              {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.displayName} />}
                              <AvatarFallback>{avatarInitial}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-white">{member.displayName}</p>
                              <p className="truncate text-[11px] text-[#8ea4c7]">{member.userId}</p>
                            </div>
                          </div>
                          <div className="shrink-0">
                            {member.isOwner && <Badge variant="outline">Owner</Badge>}
                          </div>
                        </div>
                      </ProfileContextMenu>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>

      <Dialog
        open={Boolean(reportDraft)}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          setReportDraft(null);
          setReportReason('');
          setReportSubmitting(false);
        }}
      >
        <DialogContent className="bg-[#18243a] border-[#304867] text-white">
          <DialogHeader>
            <DialogTitle>Report Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-[#c7d5ea]">
              Target:{' '}
              <span className="font-semibold text-white">
                {reportDraft?.username ?? 'Unknown user'}
              </span>
            </p>
            <label className="text-xs uppercase tracking-wide text-[#a9b8cf]">Reason (required)</label>
            <Textarea
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              maxLength={1000}
              className="bg-[#142033] border-[#304867] text-white"
              placeholder="Describe why this profile should be reviewed."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setReportDraft(null);
                setReportReason('');
                setReportSubmitting(false);
              }}
              disabled={reportSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!reportDraft) return;
                const normalizedReason = reportReason.trim();
                if (!normalizedReason) {
                  setActionError('Report reason is required.');
                  return;
                }

                setReportSubmitting(true);
                setActionError(null);
                Promise.resolve(onReportUser(reportDraft.targetUserId, normalizedReason))
                  .then(() => {
                    setReportDraft(null);
                    setReportReason('');
                  })
                  .catch((reportError: unknown) => {
                    setActionError(getErrorMessage(reportError, 'Failed to submit profile report.'));
                  })
                  .finally(() => {
                    setReportSubmitting(false);
                  });
              }}
              disabled={reportSubmitting}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {reportSubmitting ? 'Submitting...' : 'Submit Report'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(banDraft)}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          setBanDraft(null);
          setBanReason('');
          setBanSubmitting(false);
          setBanConfirmOpen(false);
        }}
      >
        <DialogContent className="bg-[#18243a] border-[#304867] text-white">
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-[#c7d5ea]">
              Target:{' '}
              <span className="font-semibold text-white">
                {banDraft?.username ?? 'Unknown user'}
              </span>
            </p>
            <label className="text-xs uppercase tracking-wide text-[#a9b8cf]">Reason (required)</label>
            <Textarea
              value={banReason}
              onChange={(event) => setBanReason(event.target.value)}
              maxLength={1000}
              className="bg-[#142033] border-[#304867] text-white"
              placeholder="Describe why this user is being banned."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setBanDraft(null);
                setBanReason('');
                setBanSubmitting(false);
                setBanConfirmOpen(false);
              }}
              disabled={banSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!banReason.trim()) {
                  setActionError('Ban reason is required.');
                  return;
                }
                setBanConfirmOpen(true);
              }}
              disabled={banSubmitting || !banDraft}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={banConfirmOpen} onOpenChange={setBanConfirmOpen}>
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Ban</AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              This action is immediate. Confirm banning this user from the selected server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={banSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              disabled={banSubmitting || !banDraft}
              onClick={() => {
                if (!banDraft) return;
                const normalizedReason = banReason.trim();
                if (!normalizedReason) {
                  setActionError('Ban reason is required.');
                  return;
                }

                setBanSubmitting(true);
                setActionError(null);
                Promise.resolve(onBanUser(banDraft.targetUserId, banDraft.communityId, normalizedReason))
                  .then(() => {
                    setBanConfirmOpen(false);
                    setBanDraft(null);
                    setBanReason('');
                  })
                  .catch((banError: unknown) => {
                    setActionError(getErrorMessage(banError, 'Failed to ban user.'));
                  })
                  .finally(() => {
                    setBanSubmitting(false);
                  });
              }}
            >
              {banSubmitting ? 'Banning...' : 'Ban User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
