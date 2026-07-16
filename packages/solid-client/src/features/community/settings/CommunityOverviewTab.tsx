import { Show, createEffect, createSignal, untrack } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { ServerSettingsSnapshot } from "@shared/lib/backend/types";
import { Button, ConfirmDialog, TextField } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";
import { useToast } from "@solid-client/contexts/ToastProvider";

export function CommunityOverviewTab(props: {
  communityId: string;
  canManageServer: boolean;
  isOwner: boolean;
}) {
  const core = requireHavenSolidCore();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = core.admin.serverSettings(() => props.communityId);
  const loading = core.admin.serverSettingsLoading(() => props.communityId);
  const loadError = core.admin.serverSettingsError(() => props.communityId);
  const [confirmation, setConfirmation] = createSignal<
    "leave" | "delete" | null
  >(null);
  const [actionPending, setActionPending] = createSignal(false);
  const [actionError, setActionError] = createSignal<string | null>(null);

  const load = (communityId = props.communityId) => {
    if (!communityId || !props.canManageServer) return;
    void core.admin.loadServerSettings(communityId).catch(() => {});
  };

  createEffect(() => {
    const communityId = props.communityId;
    const canManageServer = props.canManageServer;
    if (!canManageServer) return;
    untrack(() => load(communityId));
  });

  const removeCommunity = async () => {
    const action = confirmation();
    if (!action) return;
    setActionPending(true);
    setActionError(null);
    try {
      if (action === "delete") {
        await core.deleteCommunity(props.communityId);
      } else {
        await core.leaveCommunity(props.communityId);
      }
      core.uiStore.getState().setShowServerSettingsModal(false);
      navigate("/");
    } catch (cause) {
      setConfirmation(null);
      setActionError(
        cause instanceof Error
          ? cause.message
          : `Couldn't ${action} the community.`,
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

        <Show when={props.canManageServer}>
          <Show
            when={settings()}
            keyed
            fallback={
              <Show
                when={!loading() && loadError()}
                fallback={
                  <div class="rounded-xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
                    Loading community settings…
                  </div>
                }
              >
                {(message) => (
                  <div class="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">
                    <p>{message()}</p>
                    <Button class="mt-4" size="sm" onClick={() => load()}>
                      Try again
                    </Button>
                  </div>
                )}
              </Show>
            }
          >
            {(snapshot) => (
              <>
                <GeneralSettingsForm
                  communityId={props.communityId}
                  settings={snapshot}
                  onSaved={() =>
                    toast.show({ title: "Community settings saved" })
                  }
                />
                <RenameCommunityForm
                  communityId={props.communityId}
                  currentName={snapshot.name}
                  onRenamed={() => toast.show({ title: "Community renamed" })}
                />
              </>
            )}
          </Show>
        </Show>

        <section class="rounded-xl border border-destructive/40 bg-card p-5">
          <h3 class="font-semibold text-foreground">
            {props.isOwner ? "Delete community" : "Leave community"}
          </h3>
          <p class="mt-1 text-sm text-muted-foreground">
            {props.isOwner
              ? "Permanently remove this community and its content for everyone."
              : "Remove this community from your list. You’ll need another invite to return."}
          </p>
          <Button
            class="mt-4"
            variant="destructive"
            onClick={() => setConfirmation(props.isOwner ? "delete" : "leave")}
          >
            {props.isOwner ? "Delete community" : "Leave community"}
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

function GeneralSettingsForm(props: {
  communityId: string;
  settings: ServerSettingsSnapshot;
  onSaved: () => void;
}) {
  const core = requireHavenSolidCore();
  const [description, setDescription] = createSignal(
    props.settings.description ?? "",
  );
  const [allowPublicInvites, setAllowPublicInvites] = createSignal(
    props.settings.allowPublicInvites,
  );
  const [requireReportReason, setRequireReportReason] = createSignal(
    props.settings.requireReportReason,
  );
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await core.saveCommunitySettings({
        communityId: props.communityId,
        values: {
          name: props.settings.name,
          description: description().trim() || null,
          allowPublicInvites: allowPublicInvites(),
          requireReportReason: requireReportReason(),
        },
      });
      props.onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't save community settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="rounded-xl border border-border bg-card p-5">
      <h3 class="font-semibold text-foreground">General settings</h3>
      <p class="mt-1 text-sm text-muted-foreground">
        Set the community description and invitation and reporting defaults.
      </p>
      <Show when={error()}>
        {(message) => <ErrorBanner message={message()} />}
      </Show>
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
        checked={allowPublicInvites()}
        onChange={setAllowPublicInvites}
        disabled={saving()}
        label="Allow public invites"
        description="Members with invite access can create links others may redeem."
      />
      <SettingToggle
        checked={requireReportReason()}
        onChange={setRequireReportReason}
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

function RenameCommunityForm(props: {
  communityId: string;
  currentName: string;
  onRenamed: () => void;
}) {
  const core = requireHavenSolidCore();
  const [name, setName] = createSignal(props.currentName);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const rename = async () => {
    const nextName = name().trim();
    if (!nextName) {
      setError("Community name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await core.renameCommunity(props.communityId, nextName);
      props.onRenamed();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't rename community.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="rounded-xl border border-border bg-card p-5">
      <h3 class="font-semibold text-foreground">Community name</h3>
      <p class="mt-1 text-sm text-muted-foreground">
        Choose a short name members will recognize in their community list.
      </p>
      <TextField
        class="mt-4"
        value={name()}
        onChange={setName}
        label="Name"
        error={error()}
        disabled={saving()}
        required
      />
      <Button
        class="mt-4"
        disabled={saving() || name().trim() === props.currentName}
        onClick={() => void rename()}
      >
        {saving() ? "Renaming…" : "Rename community"}
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
