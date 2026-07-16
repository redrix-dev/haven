import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Pencil, Plus, Trash2 } from "lucide-solid";
import type { HavenChannel } from "@shared/nexus/community/channelTypes";
import type { ChannelKind } from "@shared/lib/backend/types";
import { Button, ConfirmDialog, TextField } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";

type ChannelEditorTarget =
  | { mode: "create"; kind: ChannelKind }
  | { mode: "edit"; channel: HavenChannel };

export function CommunityChannelsTab(props: { communityId: string }) {
  const core = requireHavenSolidCore();
  const navigate = useNavigate();
  const channels = core.channels.channels(() => props.communityId);
  const loading = core.channels.loading(() => props.communityId);
  const permissions = createMemo(() =>
    core.permissions.getPermissions(props.communityId),
  );
  const [editor, setEditor] = createSignal<ChannelEditorTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = createSignal<HavenChannel | null>(
    null,
  );
  const [deleting, setDeleting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    const communityId = props.communityId;
    if (!communityId) return;
    void core.channels.ensureLoaded(communityId).catch((cause) => {
      setError(
        cause instanceof Error ? cause.message : "Couldn't load channels.",
      );
    });
  });

  const navigateToChannel = (channelId: string) => {
    navigate(`/community/${props.communityId}/channel/${channelId}`);
  };

  const deleteChannel = async () => {
    const channel = deleteTarget();
    if (!channel) return;
    setDeleting(true);
    setError(null);
    try {
      await core.channels.deleteChannel({
        communityId: props.communityId,
        channelId: channel.id,
      });
      setDeleteTarget(null);
      const nextChannelId = core.channels.activeChannelId();
      if (nextChannelId) navigateToChannel(nextChannelId);
    } catch (cause) {
      setDeleteTarget(null);
      setError(
        cause instanceof Error ? cause.message : "Couldn't delete the channel.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div class="h-full overflow-y-auto p-6">
      <div class="mx-auto max-w-2xl space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="font-semibold text-foreground">Channels</h3>
            <p class="mt-1 text-sm text-muted-foreground">
              Create spaces for conversation and keep their names and topics
              clear.
            </p>
          </div>
          <Show when={permissions().canCreateChannels}>
            <Button
              size="sm"
              onClick={() => setEditor({ mode: "create", kind: "text" })}
            >
              <Plus size={15} />
              Add channel
            </Button>
          </Show>
        </div>

        <Show when={error()}>
          {(message) => (
            <p class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {message()}
            </p>
          )}
        </Show>

        <Show
          when={!loading()}
          fallback={
            <p class="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              Loading channels…
            </p>
          }
        >
          <Show
            when={channels().length > 0}
            fallback={
              <div class="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <p class="text-sm font-medium text-foreground">
                  No channels yet
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  Create a text or voice channel to get started.
                </p>
              </div>
            }
          >
            <div class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              <For each={channels()}>
                {(channel) => (
                  <div class="flex items-center gap-3 px-4 py-3">
                    <span class="text-muted-foreground">
                      {channel.kind === "voice" ? "♪" : "#"}
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-foreground">
                        {channel.name}
                      </p>
                      <Show when={channel.topic}>
                        <p class="truncate text-xs text-muted-foreground">
                          {channel.topic}
                        </p>
                      </Show>
                    </div>
                    <Show when={permissions().canManageChannelStructure}>
                      <button
                        type="button"
                        title={`Edit ${channel.name}`}
                        onClick={() => setEditor({ mode: "edit", channel })}
                        class="rounded p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        title={`Delete ${channel.name}`}
                        onClick={() => setDeleteTarget(channel)}
                        class="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 size={15} />
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      <ChannelEditorDialog
        communityId={props.communityId}
        target={editor()}
        onClose={() => setEditor(null)}
        onCreated={navigateToChannel}
      />
      <ConfirmDialog
        open={deleteTarget() !== null}
        title={`Delete #${deleteTarget()?.name ?? "channel"}?`}
        description="Messages in this channel will no longer be available. This can't be undone."
        confirmLabel="Delete channel"
        danger
        pending={deleting()}
        onConfirm={() => void deleteChannel()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function ChannelEditorDialog(props: {
  communityId: string;
  target: ChannelEditorTarget | null;
  onClose: () => void;
  onCreated: (channelId: string) => void;
}) {
  return (
    <Show when={props.target} keyed>
      {(target) => <ChannelEditorBody {...props} target={target} />}
    </Show>
  );
}

function ChannelEditorBody(props: {
  communityId: string;
  target: ChannelEditorTarget;
  onClose: () => void;
  onCreated: (channelId: string) => void;
}) {
  const core = requireHavenSolidCore();
  const editing = () => props.target.mode === "edit";
  const [name, setName] = createSignal(
    props.target.mode === "edit" ? props.target.channel.name : "",
  );
  const [topic, setTopic] = createSignal(
    props.target.mode === "edit" ? (props.target.channel.topic ?? "") : "",
  );
  const [kind, setKind] = createSignal<ChannelKind>(
    props.target.mode === "edit"
      ? props.target.channel.kind
      : props.target.kind,
  );
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const save = async () => {
    const channelName = name().trim();
    if (!channelName) {
      setError("Enter a channel name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (props.target.mode === "create") {
        const created = await core.channels.createChannel({
          communityId: props.communityId,
          name: channelName,
          topic: topic().trim() || null,
          kind: kind(),
        });
        props.onClose();
        props.onCreated(created.id);
      } else {
        await core.channels.updateChannel({
          communityId: props.communityId,
          channelId: props.target.channel.id,
          name: channelName,
          topic: topic().trim() || null,
        });
        props.onClose();
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't save the channel.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={() => !pending() && props.onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing() ? "Edit channel" : "Create channel"}
        class="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 class="text-base font-semibold text-foreground">
          {editing() ? "Edit channel" : "Create a channel"}
        </h2>
        <div class="mt-4 space-y-4">
          <TextField
            value={name()}
            onChange={setName}
            label="Channel name"
            placeholder="announcements"
            error={error()}
            disabled={pending()}
            required
          />
          <TextField
            value={topic()}
            onChange={setTopic}
            label="Topic (optional)"
            placeholder="What belongs in this channel?"
            disabled={pending()}
          />
          <Show when={!editing()}>
            <label class="flex flex-col gap-1 text-sm font-medium text-form-label">
              Channel type
              <select
                value={kind()}
                onChange={(event) =>
                  setKind(event.currentTarget.value as ChannelKind)
                }
                disabled={pending()}
                class="rounded-lg border border-input bg-surface-input px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden disabled:opacity-50"
              >
                <option value="text">Text</option>
                <option value="voice">Voice</option>
              </select>
            </label>
          </Show>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="ghost" disabled={pending()} onClick={props.onClose}>
            Cancel
          </Button>
          <Button disabled={pending()} onClick={() => void save()}>
            {pending() ? "Saving…" : editing() ? "Save changes" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
