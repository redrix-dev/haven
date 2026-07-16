import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-solid";
import type { HavenChannel } from "@shared/nexus/community/channelTypes";
import type { ChannelGroup, ChannelKind } from "@shared/lib/backend/types";
import { Button, ConfirmDialog, TextField } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";
import { useSession } from "@solid-client/contexts/SessionProvider";

type ChannelEditorTarget =
  | { mode: "create"; kind: ChannelKind }
  | { mode: "edit"; channel: HavenChannel };

type GroupEditorTarget =
  | { mode: "create" }
  | { mode: "edit"; group: ChannelGroup };

export function CommunityChannelsTab(props: { communityId: string }) {
  const core = requireHavenSolidCore();
  const { session } = useSession();
  const navigate = useNavigate();
  const channels = core.channels.channels(() => props.communityId);
  const groupState = core.channels.channelGroups(() => props.communityId);
  const loading = core.channels.loading(() => props.communityId);
  const permissions = createMemo(() =>
    core.permissions.getPermissions(props.communityId),
  );
  const [editor, setEditor] = createSignal<ChannelEditorTarget | null>(null);
  const [groupEditor, setGroupEditor] = createSignal<GroupEditorTarget | null>(
    null,
  );
  const [groupDeleteTarget, setGroupDeleteTarget] =
    createSignal<ChannelGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = createSignal<HavenChannel | null>(
    null,
  );
  const [deleting, setDeleting] = createSignal(false);
  const [groupDeleting, setGroupDeleting] = createSignal(false);
  const [structurePending, setStructurePending] = createSignal<string | null>(
    null,
  );
  const [error, setError] = createSignal<string | null>(null);
  const channelsById = createMemo(
    () => new Map(channels().map((channel) => [channel.id, channel])),
  );

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

  const updateChannelGroup = async (channelId: string, groupId: string) => {
    setStructurePending(channelId);
    setError(null);
    try {
      if (groupId) {
        await core.channels.assignChannelToGroup(
          props.communityId,
          channelId,
          groupId,
        );
      } else {
        await core.channels.removeChannelFromGroup(
          props.communityId,
          channelId,
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't move the channel.",
      );
    } finally {
      setStructurePending(null);
    }
  };

  const toggleGroup = async (group: ChannelGroup) => {
    const collapsed = groupState().collapsedGroupIds.includes(group.id);
    setStructurePending(group.id);
    setError(null);
    try {
      await core.channels.setChannelGroupCollapsed(
        props.communityId,
        group.id,
        !collapsed,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't update the channel group.",
      );
    } finally {
      setStructurePending(null);
    }
  };

  const deleteGroup = async () => {
    const group = groupDeleteTarget();
    if (!group) return;
    setGroupDeleting(true);
    setError(null);
    try {
      await core.channels.deleteChannelGroup(props.communityId, group.id);
      setGroupDeleteTarget(null);
    } catch (cause) {
      setGroupDeleteTarget(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't delete the channel group.",
      );
    } finally {
      setGroupDeleting(false);
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
          <div class="flex flex-wrap justify-end gap-2">
            <Show when={permissions().canManageChannelStructure}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setGroupEditor({ mode: "create" })}
              >
                <FolderPlus size={15} />
                Add group
              </Button>
            </Show>
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
            <div class="space-y-3">
              <For each={groupState().groups}>
                {(group) => {
                  const collapsed = () =>
                    groupState().collapsedGroupIds.includes(group.id);
                  return (
                    <section class="overflow-hidden rounded-lg border border-border bg-card">
                      <div class="flex items-center gap-2 border-b border-border px-3 py-2">
                        <button
                          type="button"
                          title={
                            collapsed() ? "Expand group" : "Collapse group"
                          }
                          disabled={structurePending() === group.id}
                          onClick={() => void toggleGroup(group)}
                          class="rounded p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
                        >
                          <Show
                            when={collapsed()}
                            fallback={<ChevronDown size={15} />}
                          >
                            <ChevronRight size={15} />
                          </Show>
                        </button>
                        <h4 class="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.name}
                        </h4>
                        <span class="text-xs text-muted-foreground">
                          {group.channelIds.length}
                        </span>
                        <Show when={permissions().canManageChannelStructure}>
                          <button
                            type="button"
                            title={`Rename ${group.name}`}
                            onClick={() =>
                              setGroupEditor({ mode: "edit", group })
                            }
                            class="rounded p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            title={`Delete ${group.name}`}
                            onClick={() => setGroupDeleteTarget(group)}
                            class="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 size={14} />
                          </button>
                        </Show>
                      </div>
                      <Show when={!collapsed()}>
                        <div class="divide-y divide-border">
                          <For
                            each={group.channelIds
                              .map((id) => channelsById().get(id))
                              .filter(
                                (channel): channel is HavenChannel => !!channel,
                              )}
                            fallback={
                              <p class="px-4 py-4 text-xs text-muted-foreground">
                                No channels in this group.
                              </p>
                            }
                          >
                            {(channel) => (
                              <ChannelRow
                                channel={channel}
                                groupId={group.id}
                                groups={groupState().groups}
                                canManage={
                                  permissions().canManageChannelStructure
                                }
                                pending={structurePending() === channel.id}
                                onGroupChange={updateChannelGroup}
                                onEdit={(target) =>
                                  setEditor({ mode: "edit", channel: target })
                                }
                                onDelete={setDeleteTarget}
                              />
                            )}
                          </For>
                        </div>
                      </Show>
                    </section>
                  );
                }}
              </For>

              <Show when={groupState().ungroupedChannelIds.length > 0}>
                <section class="overflow-hidden rounded-lg border border-border bg-card">
                  <Show when={groupState().groups.length > 0}>
                    <h4 class="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Ungrouped
                    </h4>
                  </Show>
                  <div class="divide-y divide-border">
                    <For
                      each={groupState()
                        .ungroupedChannelIds.map((id) => channelsById().get(id))
                        .filter(
                          (channel): channel is HavenChannel => !!channel,
                        )}
                    >
                      {(channel) => (
                        <ChannelRow
                          channel={channel}
                          groupId=""
                          groups={groupState().groups}
                          canManage={permissions().canManageChannelStructure}
                          pending={structurePending() === channel.id}
                          onGroupChange={updateChannelGroup}
                          onEdit={(target) =>
                            setEditor({ mode: "edit", channel: target })
                          }
                          onDelete={setDeleteTarget}
                        />
                      )}
                    </For>
                  </div>
                </section>
              </Show>
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
      <ChannelGroupEditorDialog
        communityId={props.communityId}
        userId={session()?.user.id ?? null}
        target={groupEditor()}
        onClose={() => setGroupEditor(null)}
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
      <ConfirmDialog
        open={groupDeleteTarget() !== null}
        title={`Delete ${groupDeleteTarget()?.name ?? "group"}?`}
        description="Channels in this group will become ungrouped. The channels and their messages will stay available."
        confirmLabel="Delete group"
        danger
        pending={groupDeleting()}
        onConfirm={() => void deleteGroup()}
        onCancel={() => setGroupDeleteTarget(null)}
      />
    </div>
  );
}

function ChannelRow(props: {
  channel: HavenChannel;
  groupId: string;
  groups: ChannelGroup[];
  canManage: boolean;
  pending: boolean;
  onGroupChange: (channelId: string, groupId: string) => Promise<void>;
  onEdit: (channel: HavenChannel) => void;
  onDelete: (channel: HavenChannel) => void;
}) {
  return (
    <div class="flex items-center gap-3 px-4 py-3">
      <span class="text-muted-foreground">
        {props.channel.kind === "voice" ? "♪" : "#"}
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-foreground">
          {props.channel.name}
        </p>
        <Show when={props.channel.topic}>
          <p class="truncate text-xs text-muted-foreground">
            {props.channel.topic}
          </p>
        </Show>
      </div>
      <Show when={props.canManage}>
        <select
          aria-label={`Group for ${props.channel.name}`}
          value={props.groupId}
          disabled={props.pending}
          onChange={(event) =>
            void props.onGroupChange(
              props.channel.id,
              event.currentTarget.value,
            )
          }
          class="max-w-36 rounded border border-input bg-surface-input px-2 py-1 text-xs text-foreground disabled:opacity-50"
        >
          <option value="">Ungrouped</option>
          <For each={props.groups}>
            {(group) => <option value={group.id}>{group.name}</option>}
          </For>
        </select>
        <button
          type="button"
          title={`Edit ${props.channel.name}`}
          onClick={() => props.onEdit(props.channel)}
          class="rounded p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          title={`Delete ${props.channel.name}`}
          onClick={() => props.onDelete(props.channel)}
          class="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={15} />
        </button>
      </Show>
    </div>
  );
}

function ChannelGroupEditorDialog(props: {
  communityId: string;
  userId: string | null;
  target: GroupEditorTarget | null;
  onClose: () => void;
}) {
  return (
    <Show when={props.target} keyed>
      {(target) => <ChannelGroupEditorBody {...props} target={target} />}
    </Show>
  );
}

function ChannelGroupEditorBody(props: {
  communityId: string;
  userId: string | null;
  target: GroupEditorTarget;
  onClose: () => void;
}) {
  const core = requireHavenSolidCore();
  const editing = () => props.target.mode === "edit";
  const [name, setName] = createSignal(
    props.target.mode === "edit" ? props.target.group.name : "",
  );
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const save = async () => {
    const groupName = name().trim();
    if (!groupName) {
      setError("Enter a group name.");
      return;
    }
    if (props.target.mode === "create" && !props.userId) {
      setError("Your session is still loading. Try again in a moment.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (props.target.mode === "create") {
        await core.channels.createChannelGroup(
          props.communityId,
          groupName,
          props.userId!,
        );
      } else {
        await core.channels.renameChannelGroup(
          props.communityId,
          props.target.group.id,
          groupName,
        );
      }
      props.onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't save the channel group.",
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
        aria-label={editing() ? "Rename channel group" : "Create channel group"}
        class="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 class="text-base font-semibold text-foreground">
          {editing() ? "Rename channel group" : "Create a channel group"}
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Groups keep related channels together in the sidebar.
        </p>
        <div class="mt-4">
          <TextField
            value={name()}
            onChange={setName}
            label="Group name"
            placeholder="Projects"
            error={error()}
            disabled={pending()}
            required
          />
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="ghost" disabled={pending()} onClick={props.onClose}>
            Cancel
          </Button>
          <Button disabled={pending()} onClick={() => void save()}>
            {pending() ? "Saving…" : editing() ? "Rename" : "Create group"}
          </Button>
        </div>
      </div>
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
