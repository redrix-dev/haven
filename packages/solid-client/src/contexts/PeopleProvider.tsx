import {
  Show,
  createContext,
  createEffect,
  createSignal,
  untrack,
  useContext,
  type JSX,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { X } from "lucide-solid";
import { requireHavenSolidCore } from "@solid-client/core";
import {
  Button,
  ProfileCard,
  ReportDialog,
  type ReportDialogResult,
} from "@solid-client/components/ui";
import { useToast } from "@solid-client/contexts/ToastProvider";
import {
  isBlocked,
  outgoingRequests,
} from "@shared/collections/social/selectors";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

/** What is being reported, and where it was seen. */
export type ReportRequest =
  | {
      subject: "message";
      messageId: string;
      /** Null in a conversation: only Haven staff can be told. */
      communityId: string | null;
      preview: string;
    }
  | {
      subject: "person";
      userId: string;
      communityId: string | null;
      name: string;
    };

type PeopleValue = {
  /** Someone's card. In a community it shows their name there. */
  openProfile: (userId: string, communityId?: string | null) => void;
  report: (request: ReportRequest) => void;
};

const PeopleContext = createContext<PeopleValue>();

/**
 * The profile dialog and the report dialog, once for the whole app: any
 * screen that shows a person or a message opens them from here. What a card
 * offers is what the database answered for this viewer (`can_message`,
 * `can_friend_request`); every action is decided again by the database.
 */
export function PeopleProvider(props: { children: JSX.Element }) {
  const core = requireHavenSolidCore();
  const toast = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = createSignal<{
    userId: string;
    communityId: string | null;
  } | null>(null);
  const [reporting, setReporting] = createSignal<ReportRequest | null>(null);
  const [cardError, setCardError] = createSignal<string | null>(null);
  const [working, setWorking] = createSignal(false);

  // Track the person only; loading reads and writes the profiles store.
  createEffect(() => {
    const open = profile();
    if (!open) return;
    setCardError(null);
    untrack(() => {
      core.profiles.loadCard(open.userId).catch((error: unknown) => {
        setCardError(getErrorMessage(error, "This profile isn't available."));
      });
    });
  });

  const close = () => {
    const open = profile();
    if (open) core.profiles.closeCard(open.userId);
    setProfile(null);
  };

  const act = async (work: () => Promise<unknown>, done?: string) => {
    setWorking(true);
    try {
      await work();
      if (done) toast.show({ title: done });
      const open = profile();
      if (open) await core.profiles.loadCard(open.userId);
    } catch (error) {
      toast.show({
        title: "That didn't work",
        body: getErrorMessage(error, "Try again in a moment."),
      });
    } finally {
      setWorking(false);
    }
  };

  const message = async (userId: string) => {
    setWorking(true);
    try {
      const channelId = await core.openConversationWith(userId);
      close();
      navigate(`/direct-messages/${channelId}`);
    } catch (error) {
      toast.show({
        title: "Couldn't start a conversation",
        body: getErrorMessage(error, "Try again in a moment."),
      });
    } finally {
      setWorking(false);
    }
  };

  const community = () => {
    const id = reporting()?.communityId;
    return id ? core.stores.communities.byId[id] : undefined;
  };
  const canTellCommunity = () => {
    const id = reporting()?.communityId;
    return !!id && core.communities.can(id, "create_reports");
  };

  const submitReport = async (result: ReportDialogResult) => {
    const request = reporting();
    if (!request) return;
    const reason = result.reason || undefined;
    if (result.target === "community" && request.communityId) {
      await core.reports.fileCommunityReport(
        request.communityId,
        request.subject === "message"
          ? { kind: "message", id: request.messageId }
          : { kind: "member", id: request.userId },
        reason,
      );
    } else {
      await core.reports.fileHavenReport(
        request.subject === "message"
          ? { kind: "message", id: request.messageId }
          : { kind: "profile", id: request.userId },
        reason,
      );
    }
    setReporting(null);
    toast.show({
      title: "Report sent",
      body:
        result.target === "community"
          ? "Thanks. The community's moderators will look at it."
          : "Thanks. Haven staff will look at it.",
    });
  };

  const value: PeopleValue = {
    openProfile: (userId, communityId = null) =>
      setProfile({ userId, communityId }),
    report: (request) => setReporting(request),
  };

  return (
    <PeopleContext.Provider value={value}>
      {props.children}

      <Show when={profile()} keyed>
        {(open) => {
          const card = () => core.stores.profiles.cards[open.userId];
          const me = () => core.userId;
          const asked = () =>
            outgoingRequests(core.stores.social, me() ?? "").some(
              (request) => request.recipient_id === open.userId,
            );
          const blocked = () => isBlocked(core.stores.social, open.userId);
          return (
            <div
              class="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
              onClick={close}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`${core.nameOf(open.userId, open.communityId)} profile`}
                class="w-full max-w-sm"
                onClick={(event) => event.stopPropagation()}
              >
                <div class="mb-2 flex justify-end">
                  <button
                    type="button"
                    title="Close profile"
                    onClick={close}
                    class="rounded-full bg-card p-2 text-muted-foreground shadow hover:text-foreground"
                  >
                    <X size={16} />
                  </button>
                </div>
                <Show
                  when={card()}
                  fallback={
                    <div class="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                      {cardError() ?? "Loading profile…"}
                    </div>
                  }
                >
                  {(shown) => (
                    <ProfileCard
                      card={shown()}
                      name={core.nameOf(open.userId, open.communityId)}
                      avatarUrl={core.avatarUrl(open.userId)}
                    >
                      <Show when={open.userId !== me() && !shown().deleted}>
                        <Show when={shown().can_message}>
                          <Button
                            size="sm"
                            disabled={working()}
                            onClick={() => void message(open.userId)}
                          >
                            Message
                          </Button>
                        </Show>
                        <Show when={shown().can_friend_request && !asked()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={working()}
                            onClick={() =>
                              void act(
                                () => core.social.sendRequest(open.userId),
                                "Friend request sent",
                              )
                            }
                          >
                            Add friend
                          </Button>
                        </Show>
                        <Show when={asked()}>
                          <span class="self-center text-xs text-muted-foreground">
                            Friend request sent
                          </span>
                        </Show>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={working()}
                          onClick={() =>
                            void act(() =>
                              blocked()
                                ? core.social.unblock(open.userId)
                                : core.social.block(open.userId),
                            )
                          }
                        >
                          {blocked() ? "Unblock" : "Block"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          class="text-destructive"
                          onClick={() => {
                            const name = core.nameOf(
                              open.userId,
                              open.communityId,
                            );
                            close();
                            setReporting({
                              subject: "person",
                              userId: open.userId,
                              communityId: open.communityId,
                              name,
                            });
                          }}
                        >
                          Report
                        </Button>
                      </Show>
                    </ProfileCard>
                  )}
                </Show>
              </div>
            </div>
          );
        }}
      </Show>

      <ReportDialog
        open={reporting() !== null}
        title={
          reporting()?.subject === "message"
            ? "Report message"
            : `Report ${(reporting() as { name?: string } | null)?.name ?? "user"}`
        }
        subjectLabel={
          reporting()?.subject === "message"
            ? "Reported message"
            : "Reported user"
        }
        subjectPreview={(() => {
          const request = reporting();
          if (!request) return undefined;
          return request.subject === "message" ? request.preview : request.name;
        })()}
        showTarget={canTellCommunity()}
        reasonRequired={community()?.report_reason_required ?? false}
        onClose={() => setReporting(null)}
        onSubmit={submitReport}
      />
    </PeopleContext.Provider>
  );
}

export function usePeople(): PeopleValue {
  const ctx = useContext(PeopleContext);
  if (!ctx) throw new Error("usePeople must be used within <PeopleProvider>");
  return ctx;
}
