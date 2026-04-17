import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/app/ui/dialog";
import { Input } from "@shared/app/ui/input";
import { ScrollArea } from "@shared/app/ui/scroll-area";
import { Badge } from "@shared/app/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/app/ui/avatar";
import { Button } from "@shared/app/ui/button";
import { Skeleton } from "@shared/app/ui/skeleton";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@shared/app/ui/hover-card";
import { Textarea } from "@shared/app/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/app/ui/alert-dialog";
import type {
  BanEligibleServer,
  CommunityMemberListItem,
} from "@shared/lib/backend/types";
import {
  resolveLiveAvatarUrl,
  resolveLiveUsername,
} from "@shared/lib/liveProfiles";
import { ProfileContextMenu } from "@shared/app/components/ProfileContextMenu";
import { getErrorMessage } from "@platform/lib/errors";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import { useSocialStore } from "@shared/stores/socialStore";

interface ServerMembersModalProps {
  open: boolean;
  currentUserId: string | null;
  serverName: string;
  loading: boolean;
  error: string | null;
  members: CommunityMemberListItem[];
  isElevatedViewer: boolean;
  canReportProfiles: boolean;
  canBanProfiles: boolean;
  canKickProfiles: boolean;
  onResolveBanServers: (targetUserId: string) => Promise<BanEligibleServer[]>;
  onDirectMessage: (targetUserId: string) => void;
  onReportUser: (targetUserId: string, reason: string) => Promise<void> | void;
  onBanUser: (
    targetUserId: string,
    communityId: string,
    reason: string,
  ) => Promise<void> | void;
  onKickUser: (targetUserId: string, username: string) => Promise<void> | void;
  onClose: () => void;
}

export function ServerMembersModal({
  open,
  currentUserId,
  serverName,
  loading,
  error,
  members,
  isElevatedViewer,
  canReportProfiles,
  canBanProfiles,
  canKickProfiles,
  onResolveBanServers,
  onDirectMessage,
  onReportUser,
  onBanUser,
  onKickUser,
  onClose,
}: ServerMembersModalProps) {
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);
  const blockedUserIds = useSocialStore((state) => state.blockedUserIds);
  const [search, setSearch] = React.useState("");
  const [reportDraft, setReportDraft] = React.useState<{
    targetUserId: string;
    username: string;
  } | null>(null);
  const [reportReason, setReportReason] = React.useState("");
  const [reportSubmitting, setReportSubmitting] = React.useState(false);
  const [banDraft, setBanDraft] = React.useState<{
    targetUserId: string;
    communityId: string;
    username: string;
  } | null>(null);
  const [kickDraft, setKickDraft] = React.useState<{
    targetUserId: string;
    username: string;
  } | null>(null);
  const [banReason, setBanReason] = React.useState("");
  const [banSubmitting, setBanSubmitting] = React.useState(false);
  const [banConfirmOpen, setBanConfirmOpen] = React.useState(false);
  const [kickSubmitting, setKickSubmitting] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSearch("");
      setReportDraft(null);
      setReportReason("");
      setReportSubmitting(false);
      setBanDraft(null);
      setKickDraft(null);
      setBanReason("");
      setBanSubmitting(false);
      setBanConfirmOpen(false);
      setKickSubmitting(false);
      setActionError(null);
    }
  }, [open]);

  const filteredMembers = React.useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const visibleMembers = isElevatedViewer
      ? members
      : members.filter((member) => !blockedUserIds.has(member.userId));
    if (!normalized) return visibleMembers;
    return visibleMembers.filter((member) => {
      const liveUsername = resolveLiveUsername(
        liveProfiles,
        member.userId,
        null,
      )?.toLowerCase();
      return (
        member.displayName.toLowerCase().includes(normalized) ||
        (typeof liveUsername === "string" && liveUsername.includes(normalized))
      );
    });
  }, [blockedUserIds, isElevatedViewer, liveProfiles, members, search]); // CHECKPOINT 8 COMPLETE

  const membersByUserId = React.useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        size="lg"
        className="bg-surface-legal border-border text-white"
      >
        <DialogHeader>
          <DialogTitle>Members - {serverName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search members..."
            className="bg-surface-panel border-border text-white"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          {actionError && <p className="text-xs text-red-400">{actionError}</p>}
          {loading ? (
            <div className="rounded-md border border-border bg-surface-panel p-2 space-y-1">
              {Array.from({ length: 5 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-2"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <Skeleton className="size-8 rounded-full bg-surface-hover" />
                    <div className="min-w-0 space-y-2">
                      <Skeleton className="h-4 w-28 bg-surface-hover" />
                      <Skeleton className="h-3 w-40 bg-surface-skeleton" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-12 rounded-full bg-surface-hover" />
                </div>
              ))}
            </div>
          ) : (
            <ScrollArea className="h-[420px] rounded-md border border-border bg-surface-panel">
              <div className="p-2 space-y-1">
                {filteredMembers.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    No members found.
                  </p>
                ) : (
                  filteredMembers.map((member) => {
                    const avatarInitial =
                      member.displayName.trim().charAt(0).toUpperCase() || "U";
                    const liveAvatarUrl = resolveLiveAvatarUrl(
                      liveProfiles,
                      member.userId,
                      member.avatarUrl,
                    );
                    const liveUsername =
                      resolveLiveUsername(
                        liveProfiles,
                        member.userId,
                        member.displayName,
                      ) ?? member.displayName;

                    return (
                      <ProfileContextMenu
                        key={member.memberId}
                        userId={member.userId}
                        username={liveUsername}
                        avatarUrl={liveAvatarUrl}
                        canDirectMessage={member.userId !== currentUserId}
                        canReport={canReportProfiles}
                        canBan={canBanProfiles}
                        canKick={canKickProfiles}
                        onDirectMessage={onDirectMessage}
                        onReport={(targetUserId) => {
                          const targetMember =
                            membersByUserId.get(targetUserId);
                          setReportDraft({
                            targetUserId,
                            username:
                              targetMember?.displayName ??
                              targetUserId.substring(0, 12),
                          });
                          setReportReason("");
                          setActionError(null);
                        }}
                        onBan={(targetUserId, communityId) => {
                          const targetMember =
                            membersByUserId.get(targetUserId);
                          setBanDraft({
                            targetUserId,
                            communityId,
                            username:
                              targetMember?.displayName ??
                              targetUserId.substring(0, 12),
                          });
                          setBanReason("");
                          setBanConfirmOpen(false);
                          setActionError(null);
                        }}
                        onKick={(targetUserId) => {
                          const targetMember =
                            membersByUserId.get(targetUserId);
                          setKickDraft({
                            targetUserId,
                            username:
                              targetMember?.displayName ??
                              targetUserId.substring(0, 12),
                          });
                          setKickSubmitting(false);
                          setActionError(null);
                        }}
                        resolveBanServers={onResolveBanServers}
                      >
                        <HoverCard openDelay={120} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <div className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-surface-row-selected">
                              <div className="min-w-0 flex items-center gap-2">
                                <Avatar size="sm">
                                  {liveAvatarUrl && (
                                    <AvatarImage
                                      src={liveAvatarUrl}
                                      alt={member.displayName}
                                    />
                                  )}
                                  <AvatarFallback>
                                    {avatarInitial}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-white">
                                    {member.displayName}
                                  </p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {member.userId}
                                  </p>
                                </div>
                              </div>
                              <div className="shrink-0">
                                {member.isOwner && (
                                  <Badge variant="outline">Owner</Badge>
                                )}
                              </div>
                            </div>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-72 border-border bg-surface-legal text-white">
                            <div className="space-y-2">
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {member.displayName}
                                </p>
                                <p className="text-xs text-muted-foreground break-all">
                                  {member.userId}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {member.isOwner && (
                                  <Badge
                                    variant="outline"
                                    className="border-border-cta text-nav-strong"
                                  >
                                    Owner
                                  </Badge>
                                )}
                                <span>
                                  Right-click or press Enter for profile
                                  actions.
                                </span>
                              </div>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
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
          setReportReason("");
          setReportSubmitting(false);
        }}
      >
        <DialogContent className="bg-surface-legal border-border text-white">
          <DialogHeader>
            <DialogTitle>Report Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-settings-body">
              Target:{" "}
              <span className="font-semibold text-white">
                {reportDraft?.username ?? "Unknown user"}
              </span>
            </p>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Reason (required)
            </label>
            <Textarea
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              maxLength={1000}
              className="bg-surface-panel border-border text-white"
              placeholder="Describe why this profile should be reviewed."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setReportDraft(null);
                setReportReason("");
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
                  setActionError("Report reason is required.");
                  return;
                }

                setReportSubmitting(true);
                setActionError(null);
                Promise.resolve(
                  onReportUser(reportDraft.targetUserId, normalizedReason),
                )
                  .then(() => {
                    setReportDraft(null);
                    setReportReason("");
                  })
                  .catch((reportError: unknown) => {
                    setActionError(
                      getErrorMessage(
                        reportError,
                        "Failed to submit profile report.",
                      ),
                    );
                  })
                  .finally(() => {
                    setReportSubmitting(false);
                  });
              }}
              disabled={reportSubmitting}
              className="bg-primary hover:bg-primary-hover text-white"
            >
              {reportSubmitting ? "Submitting..." : "Submit Report"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(banDraft)}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          setBanDraft(null);
          setBanReason("");
          setBanSubmitting(false);
          setBanConfirmOpen(false);
        }}
      >
        <DialogContent className="bg-surface-legal border-border text-white">
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-settings-body">
              Target:{" "}
              <span className="font-semibold text-white">
                {banDraft?.username ?? "Unknown user"}
              </span>
            </p>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Reason (required)
            </label>
            <Textarea
              value={banReason}
              onChange={(event) => setBanReason(event.target.value)}
              maxLength={1000}
              className="bg-surface-panel border-border text-white"
              placeholder="Describe why this user is being banned."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setBanDraft(null);
                setBanReason("");
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
                  setActionError("Ban reason is required.");
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
        <AlertDialogContent className="bg-surface-legal border-border text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Ban</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This action is immediate. Confirm banning this user from the
              selected server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={banSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              disabled={banSubmitting || !banDraft}
              onClick={() => {
                if (!banDraft) return;
                const normalizedReason = banReason.trim();
                if (!normalizedReason) {
                  setActionError("Ban reason is required.");
                  return;
                }

                setBanSubmitting(true);
                setActionError(null);
                Promise.resolve(
                  onBanUser(
                    banDraft.targetUserId,
                    banDraft.communityId,
                    normalizedReason,
                  ),
                )
                  .then(() => {
                    setBanConfirmOpen(false);
                    setBanDraft(null);
                    setBanReason("");
                  })
                  .catch((banError: unknown) => {
                    setActionError(
                      getErrorMessage(banError, "Failed to ban user."),
                    );
                  })
                  .finally(() => {
                    setBanSubmitting(false);
                  });
              }}
            >
              {banSubmitting ? "Banning..." : "Ban User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(kickDraft)}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          setKickDraft(null);
          setKickSubmitting(false);
        }}
      >
        <AlertDialogContent className="bg-surface-legal border-border text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Removal</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Remove this user from the server now. They can rejoin later if
              they still have a valid invite.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={kickSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              disabled={kickSubmitting || !kickDraft}
              onClick={() => {
                if (!kickDraft) return;
                setKickSubmitting(true);
                setActionError(null);
                Promise.resolve(
                  onKickUser(kickDraft.targetUserId, kickDraft.username),
                )
                  .then(() => {
                    setKickDraft(null);
                  })
                  .catch((kickError: unknown) => {
                    setActionError(
                      getErrorMessage(
                        kickError,
                        "Failed to remove user from the server.",
                      ),
                    );
                  })
                  .finally(() => {
                    setKickSubmitting(false);
                  });
              }}
            >
              {kickSubmitting ? "Removing..." : "Remove from Server"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
