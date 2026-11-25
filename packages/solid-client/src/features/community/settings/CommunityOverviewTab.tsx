import { Show, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { Community } from "@shared/lib/backend/records";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { Button, ConfirmDialog, TextField } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";
import { useToast } from "@solid-client/contexts/ToastProvider";

/**
 * The community's name, description and defaults, for those who may manage
 * it; and the way out for everyone: the owner deletes it, anyone else
 * leaves.
 */
export function CommunityOverviewTab(props: {
  communityId: string;
  onDone: () => void;
}) {
  const core = requireHavenSolidCore();
  const navigate = useNavigate();
  const community = () => core.stores.communities.byId[props.communityId];
  const isOwner = () => community()?.owner_id === core.userId;
  const canManage = () =>
    core.communities.can(props.communityId, "manage_community");

  const [confirmation, setConfirmation] = createSignal<
    "leave" | "delete" | null
  >(null);
  const [actionPending, setActionPending] = createSignal(false);
  const [actionError, setActionError] = createSignal<string | null>(null);

  const removeCommunity = async () => {
    const action = confirmation();
    if (!action) return;
    setActionPending(true);
    setActionError(null);
    try {
      if (action === "delete") {
        await core.communities.remove(props.communityId);
      } else {
        await core.communities.leave(props.communityId);
      }
      props.onDone();
      navigate("/");
    } catch (cause) {
      setConfirmation(null);
      setActionError(
        getErrorMessage(cause, `Couldn't ${action} the community.`),
      );
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div class="h-full overflow-y-auto p-6">
      <div class="mx-auto max-w-xl space-y-6">
        <Show when={actionError()}>
          {(message) => <ErrorBanner message={message()} />}
        </Show>

        <Show when={canManage() && community()} keyed>
          {(shown) => <GeneralSettingsForm community={shown} />}
        </Show>

        <section class="rounded-xl border border-destructive/40 bg-card p-5">
          <h3 class="font-semibold text-foreground">
            {isOwner() ? "Delete community" : "Leave community"}
          </h3>
          <p class="mt-1 text-sm text-muted-foreground">
            {isOwner()
              ? "Permanently remove this community and its content for everyone. To leave it instead, hand it to another member first."
              : "Remove this community from your list. You’ll need another invite to return."}
          </p>
          <Button
            class="mt-4"
            variant="destructive"
            onClick={() => setConfirmation(isOwner() ? "delete" : "leave")}
          >
            {isOwner() ? "Delete community" : "Leave community"}
          </Button>
        </section>
      </div>

      <ConfirmDialog
        open={confirmation() !== null}
        title={
          confirmation() === "delete"
            ? "Delete this community?"
            : "Leave this community?"
        }
        description={
          confirmation() === "delete"
            ? "This permanently removes the community for everyone and cannot be undone."
            : "You will lose access immediately and need a new invite to return."
        }
        confirmLabel={
          confirmation() === "delete" ? "Delete community" : "Leave community"
        }
        danger
        pending={actionPending()}
        onConfirm={() => void removeCommunity()}
        onCancel={() => setConfirmation(null)}
      />
    </div>
  );
}

function GeneralSettingsForm(props: { community: Community }) {
  const core = requireHavenSolidCore();
  const toast = useToast();
  const [name, setName] = createSignal(props.community.name);
  const [description, setDescription] = createSignal(
    props.community.description ?? "",
  );
  const [invitesEnabled, setInvitesEnabled] = createSignal(
    props.community.invites_enabled,
  );
  const [reasonRequired, setReasonRequired] = createSignal(
    props.community.report_reason_required,
  );
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const save = async () => {
    const nextName = name().trim();
    if (!nextName) {
      setError("Community name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await core.communities.update(props.community.id, {
        name: nextName,
        description: description().trim(),
        invites_enabled: invitesEnabled(),
        report_reason_required: reasonRequired(),
      });
      toast.show({ title: "Community settings saved" });
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't save community settings."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="rounded-xl border border-border bg-card p-5">
      <h3 class="font-semibold text-foreground">General settings</h3>
      <Show when={error()}>
        {(message) => <ErrorBanner message={message()} />}
      </Show>
      <TextField
        class="mt-4"
        value={name()}
        onChange={setName}
        label="Name"
        disabled={saving()}
        required
      />
      <label class="mt-4 flex flex-col gap-1 text-sm font-medium text-form-label">
        Description
        <textarea
          rows={4}
          value={description()}
          onInput={(event) => setDescription(event.currentTarget.value)}
          disabled={saving()}
          placeholder="What brings this community together?"
          class="resize-none rounded-lg border border-input bg-surface-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden disabled:opacity-50"
        />
      </label>
      <SettingToggle
        checked={invitesEnabled()}
        onChange={setInvitesEnabled}
        disabled={saving()}
        label="Invites work"
        description="Off: no invite to this community can be used, old or new."
      />
      <SettingToggle
        checked={reasonRequired()}
        onChange={setReasonRequired}
        disabled={saving()}
        label="Require a report reason"
        description="Ask reporters to explain what moderators should review."
      />
      <Button class="mt-5" disabled={saving()} onClick={() => void save()}>
        {saving() ? "Saving…" : "Save settings"}
      </Button>
    </section>
  );
}

function SettingToggle(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
  label: string;
  description: string;
}) {
  return (
    <label class="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-3">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        disabled={props.disabled}
        class="mt-0.5 h-4 w-4 accent-primary"
      />
      <span>
        <span class="block text-sm font-medium text-foreground">
          {props.label}
        </span>
        <span class="mt-0.5 block text-xs text-muted-foreground">
          {props.description}
        </span>
      </span>
    </label>
  );
}

function ErrorBanner(props: { message: string }) {
  return (
    <p class="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {props.message}
    </p>
  );
}
