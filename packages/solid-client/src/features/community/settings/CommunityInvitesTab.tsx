import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  untrack,
} from "solid-js";
import { Check, Copy, Link2, Plus, Trash2 } from "lucide-solid";
import { buildHavenLink } from "@shared/features/links";
import { requireHavenSolidCore } from "@solid-client/core";
import { ConfirmDialog } from "@solid-client/components/ui";
import { useToast } from "@solid-client/contexts/ToastProvider";
import type { Invite } from "@shared/lib/backend/records";
import { invitesOf } from "@shared/collections/communities/selectors";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

/** Expiry choices, in hours; null = never. */
const EXPIRY_OPTIONS: { label: string; hours: number | null }[] = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "12 hours", hours: 12 },
  { label: "1 day", hours: 24 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
  { label: "Never", hours: null },
];

/** Max-use choices; null = unlimited. */
const MAX_USES_OPTIONS: { label: string; value: number | null }[] = [
  { label: "No limit", value: null },
  { label: "1 use", value: 1 },
  { label: "5 uses", value: 5 },
  { label: "10 uses", value: 10 },
  { label: "25 uses", value: 25 },
  { label: "50 uses", value: 50 },
  { label: "100 uses", value: 100 },
];

/**
 * The shareable invite link: always the canonical web URL, whatever shell this
 * runs in. It opens in any browser, is clickable in any chat app, and the apps
 * pick it up from there. Building it from `window.location.origin` produced
 * dead `localhost` links on desktop (RED-57).
 */
function inviteReference(code: string): string {
  return buildHavenLink({ kind: "invite", code });
}

function formatExpiry(invite: Invite): string {
  if (!invite.expires_at) return "Never expires";
  const when = new Date(invite.expires_at);
  if (Number.isNaN(when.getTime())) return "Never expires";
  return `Expires ${when.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function formatUses(invite: Invite): string {
  const max = invite.max_uses;
  return max == null ? `${invite.uses} uses` : `${invite.uses} / ${max} uses`;
}

/** Active-invite management for the community settings panel's Invites tab. */
export function CommunityInvitesTab(props: { communityId: string }) {
  const core = requireHavenSolidCore();
  const toast = useToast();
  const communityId = () => props.communityId;

  const invites = createMemo(() =>
    invitesOf(core.stores.communities, communityId()),
  );
  const status = () =>
    core.stores.communities.requests[`invites:${communityId()}`];
  const loading = () => status()?.running ?? true;
  const error = () =>
    status()?.error
      ? getErrorMessage(status()!.error, "Couldn't load invites.")
      : null;
  const canManageInvites = () =>
    core.communities.can(communityId(), "manage_invites");

  const [maxUses, setMaxUses] = createSignal<number | null>(null);
  const [expiresInHours, setExpiresInHours] = createSignal<number | null>(168);
  const [creating, setCreating] = createSignal(false);
  const [copiedId, setCopiedId] = createSignal<string | null>(null);
  const [revokeTarget, setRevokeTarget] = createSignal<Invite | null>(null);
  const [revoking, setRevoking] = createSignal(false);

  // Track the community only; loading reads the store it writes.
  createEffect(() => {
    const id = communityId();
    untrack(() => void core.communities.loadInvites(id));
  });

  const copy = async (invite: Invite) => {
    const ref = inviteReference(invite.code);
    try {
      await navigator.clipboard.writeText(ref);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.show({ title: "Couldn't copy", body: ref });
    }
  };

  const create = async () => {
    setCreating(true);
    try {
      const invite = await core.communities.createInvite(communityId(), {
        max_uses: maxUses(),
        expires_in_hours: expiresInHours(),
      });
      const ref = inviteReference(invite.code);
      try {
        await navigator.clipboard.writeText(ref);
        toast.show({ title: "Invite created & copied", body: ref });
      } catch {
        toast.show({ title: "Invite created", body: ref });
      }
    } catch (e) {
      toast.show({
        title: "Couldn't create invite",
        body: getErrorMessage(e, "Please try again."),
      });
    } finally {
      setCreating(false);
    }
  };

  const doRevoke = async () => {
    const target = revokeTarget();
    if (!target) return;
    setRevoking(true);
    try {
      await core.communities.revokeInvite(communityId(), target.id);
      setRevokeTarget(null);
    } catch (e) {
      toast.show({
        title: "Couldn't revoke invite",
        body: getErrorMessage(e, "Please try again."),
      });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Show
      when={canManageInvites()}
      fallback={
        <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
          You don't have permission to manage invites.
        </div>
      }
    >
      <div class="overflow-y-auto p-6">
        <div class="mx-auto max-w-lg space-y-6">
          {/* Create */}
          <div class="space-y-3 rounded-lg border border-border bg-surface-panel p-4">
            <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Create an invite
            </p>
            <div class="flex flex-wrap gap-3">
              <label class="flex-1 space-y-1">
                <span class="block text-xs text-muted-foreground">
                  Expire after
                </span>
                <select
                  value={String(expiresInHours())}
                  disabled={creating()}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    setExpiresInHours(v === "null" ? null : Number(v));
                  }}
                  class="w-full rounded border border-input bg-surface-input px-2 py-2 text-sm text-foreground outline-hidden focus:border-primary"
                >
                  <For each={EXPIRY_OPTIONS}>
                    {(opt) => (
                      <option value={String(opt.hours)}>{opt.label}</option>
                    )}
                  </For>
                </select>
              </label>
              <label class="flex-1 space-y-1">
                <span class="block text-xs text-muted-foreground">
                  Max uses
                </span>
                <select
                  value={String(maxUses())}
                  disabled={creating()}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    setMaxUses(v === "null" ? null : Number(v));
                  }}
                  class="w-full rounded border border-input bg-surface-input px-2 py-2 text-sm text-foreground outline-hidden focus:border-primary"
                >
                  <For each={MAX_USES_OPTIONS}>
                    {(opt) => (
                      <option value={String(opt.value)}>{opt.label}</option>
                    )}
                  </For>
                </select>
              </label>
            </div>
            <button
              type="button"
              disabled={creating()}
              onClick={() => void create()}
              class="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Plus size={15} />
              {creating() ? "Creating…" : "Create invite link"}
            </button>
          </div>

          {/* Active invites */}
          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active invites
            </p>

            <Show when={error()}>
              <p class="text-sm text-destructive">{error()}</p>
            </Show>

            <Show
              when={!loading() || invites().length > 0}
              fallback={<p class="text-sm text-muted-foreground">Loading…</p>}
            >
              <Show
                when={invites().length > 0}
                fallback={
                  <p class="text-sm text-muted-foreground">
                    No active invites yet. Create one above to let people join.
                  </p>
                }
              >
                <ul class="space-y-2">
                  <For each={invites()}>
                    {(invite) => (
                      <li class="flex items-center gap-3 rounded-lg border border-border bg-surface-panel px-3 py-2.5">
                        <Link2
                          size={16}
                          class="shrink-0 text-muted-foreground"
                        />
                        <div class="min-w-0 flex-1">
                          <p class="truncate font-mono text-sm text-foreground">
                            {invite.code}
                          </p>
                          <p class="text-xs text-muted-foreground">
                            {formatUses(invite)} · {formatExpiry(invite)}
                          </p>
                        </div>
                        <button
                          type="button"
                          title="Copy invite link"
                          onClick={() => void copy(invite)}
                          class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                        >
                          <Show
                            when={copiedId() === invite.id}
                            fallback={<Copy size={16} />}
                          >
                            <Check size={16} class="text-primary" />
                          </Show>
                        </button>
                        <button
                          type="button"
                          title="Revoke invite"
                          onClick={() => setRevokeTarget(invite)}
                          class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-destructive"
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={revokeTarget() !== null}
        title="Revoke this invite?"
        description="The link stops working immediately. Anyone who already joined stays."
        confirmLabel="Revoke"
        danger
        pending={revoking()}
        onConfirm={() => void doRevoke()}
        onCancel={() => setRevokeTarget(null)}
      />
    </Show>
  );
}
