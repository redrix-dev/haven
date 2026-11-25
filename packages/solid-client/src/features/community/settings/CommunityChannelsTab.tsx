import { For, Show, createMemo, createSignal } from "solid-js";
import {
  ArrowDown,
  ArrowUp,
  FolderPlus,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-solid";
import type { Channel, ChannelCategory } from "@shared/lib/backend/records";
import { communityChannels } from "@shared/collections/channels/selectors";
import { categoriesOf } from "@shared/collections/categories/selectors";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { Button, ConfirmDialog, TextField } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";
import { ChannelPermissionsDialog } from "./ChannelPermissionsDialog";

type Group = { category: ChannelCategory | null; channels: Channel[] };

type ChannelEditor =
  | { mode: "create"; kind: "text" | "voice"; categoryId: string | null }
  | { mode: "edit"; channel: Channel };

type CategoryEditor =
  | { mode: "create" }
  | { mode: "edit"; category: ChannelCategory };

type DeleteTarget =
  | { kind: "channel"; channel: Channel }
  | { kind: "category"; category: ChannelCategory };

/**
 * A community's channels and categories, for those with `manage_channels`.
 * Every change goes to the database; its answer, and any other channel it
 * touched, come back through the channels and categories collections.
 */
export function CommunityChannelsTab(props: { communityId: string }) {
  const core = requireHavenSolidCore();
  const groups = createMemo<Group[]>(() => {
    const channels = communityChannels(core.stores.channels, props.communityId);
    const categories = categoriesOf(core.stores.categories, props.communityId);
    const known = new Set(categories.map((c) => c.id));
    return [
      {
        category: null,
        channels: channels.filter(
          (c) => c.category_id === null || !known.has(c.category_id),
        ),
      },
      ...categories.map((category) => ({
        category,
        channels: channels.filter((c) => c.category_id === category.id),
      })),
    ];
  });
  const canSetPermissions = () =>
    core.communities.can(props.communityId, "manage_channel_permissions");

  const [editor, setEditor] = createSignal<ChannelEditor | null>(null);
  const [categoryEditor, setCategoryEditor] =
    createSignal<CategoryEditor | null>(null);
  const [deleteTarget, setDeleteTarget] = createSignal<DeleteTarget | null>(
    null,
  );
  const [permissionsTarget, setPermissionsTarget] =
    createSignal<Channel | null>(null);
  const [working, setWorking] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const run = async (work: () => Promise<unknown>, failure: string) => {
    setWorking(true);
    setError(null);
    try {
      await work();
      return true;
    } catch (cause) {
      setError(getErrorMessage(cause, failure));
      return false;
    } finally {
      setWorking(false);
    }
  };

  /**
   * Puts the group in this order: positions 0, 1, 2… Only channels whose
   * position or category changes are sent.
   */
  const placeInOrder = (categoryId: string | null, ordered: Channel[]) =>
    run(async () => {
      for (const [position, channel] of ordered.entries()) {
        if (
          channel.position !== position ||
          channel.category_id !== categoryId
        ) {
          await core.channels.move(channel.id, categoryId, position);
        }
      }
    }, "Couldn't move the channel.");

  const shift = (group: Group, index: number, by: -1 | 1) => {
    const ordered = [...group.channels];
    const [moving] = ordered.splice(index, 1);
    ordered.splice(index + by, 0, moving);
    void placeInOrder(group.category?.id ?? null, ordered);
  };

  const moveTo = (channel: Channel, categoryId: string | null) => {
    const target = groups().find(
      (g) => (g.category?.id ?? null) === categoryId,
    );
    void placeInOrder(categoryId, [
      ...(target?.channels.filter((c) => c.id !== channel.id) ?? []),
      channel,
    ]);
  };

  const confirmDelete = async () => {
    const target = deleteTarget();
    if (!target) return;
    await run(
      () =>
        target.kind === "channel"
          ? core.deleteChannel(target.channel.id)
          : core.categories.remove(target.category.id),
      "Couldn't delete it.",
    );
    setDeleteTarget(null);
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
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setCategoryEditor({ mode: "create" })}
            >
              <FolderPlus size={15} />
              Add category
            </Button>
            <Button
              size="sm"
              onClick={() =>
                setEditor({ mode: "create", kind: "text", categoryId: null })
              }
            >
              <Plus size={15} />
              Add channel
            </Button>
          </div>
        </div>

        <Show when={error()}>
          <p class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error()}
          </p>
        </Show>

        <For each={groups()}>
          {(group) => (
            <section class="rounded-xl border border-border bg-card">
              <header class="flex items-center gap-2 border-b border-border px-4 py-2">
                <span class="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.category?.name ?? "Not in a category"}
                </span>
                <Show when={group.category}>
                  {(category) => (
                    <>
                      <IconButton
                        title="Rename category"
                        onClick={() =>
                          setCategoryEditor({
                            mode: "edit",
                            category: category(),
                          })
                        }
                      >
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton
                        title="Delete category"
                        danger
                        onClick={() =>
                          setDeleteTarget({
                            kind: "category",
                            category: category(),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </>
                  )}
                </Show>
              </header>
              <Show
                when={group.channels.length > 0}
                fallback={
                  <p class="px-4 py-3 text-sm text-muted-foreground">
                    No channels here.
                  </p>
                }
              >
                <For each={group.channels}>
                  {(channel, index) => (
                    <div class="flex items-center gap-2 border-b border-border px-4 py-2 last:border-b-0">
                      <span class="w-4 text-muted-foreground">
                        {channel.kind === "voice" ? "♪" : "#"}
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm text-foreground">
                          {channel.name}
                        </p>
                        <Show when={channel.topic}>
                          <p class="truncate text-xs text-muted-foreground">
                            {channel.topic}
                          </p>
                        </Show>
                      </div>
                      <select
                        aria-label="Category"
                        value={channel.category_id ?? ""}
                        disabled={working()}
                        onChange={(e) =>
                          moveTo(channel, e.currentTarget.value || null)
                        }
                        class="rounded border border-border-control bg-surface-input px-2 py-1 text-xs text-foreground"
                      >
                        <option value="">No category</option>
                        <For each={groups().filter((g) => g.category)}>
                          {(g) => (
                            <option value={g.category!.id}>
                              {g.category!.name}
                            </option>
                          )}
                        </For>
                      </select>
                      <IconButton
                        title="Move up"
                        disabled={working() || index() === 0}
                        onClick={() => shift(group, index(), -1)}
                      >
                        <ArrowUp size={14} />
                      </IconButton>
                      <IconButton
                        title="Move down"
                        disabled={
                          working() || index() === group.channels.length - 1
                        }
                        onClick={() => shift(group, index(), 1)}
                      >
                        <ArrowDown size={14} />
                      </IconButton>
                      <IconButton
                        title="Edit channel"
                        onClick={() => setEditor({ mode: "edit", channel })}
                      >
                        <Pencil size={14} />
                      </IconButton>
                      <Show when={canSetPermissions()}>
                        <IconButton
                          title="Channel permissions"
                          onClick={() => setPermissionsTarget(channel)}
                        >
                          <ShieldCheck size={14} />
                        </IconButton>
                      </Show>
                      <IconButton
                        title="Delete channel"
                        danger
                        onClick={() =>
                          setDeleteTarget({ kind: "channel", channel })
                        }
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  )}
                </For>
              </Show>
            </section>
          )}
        </For>
      </div>

      <Show when={editor()} keyed>
        {(open) => (
          <ChannelEditorDialog
            communityId={props.communityId}
            editor={open}
            categories={groups().flatMap((g) =>
              g.category ? [g.category] : [],
            )}
            onClose={() => setEditor(null)}
          />
        )}
      </Show>
      <Show when={categoryEditor()} keyed>
        {(open) => (
          <CategoryEditorDialog
            communityId={props.communityId}
            editor={open}
            onClose={() => setCategoryEditor(null)}
          />
        )}
      </Show>
      <Show when={permissionsTarget()} keyed>
        {(channel) => (
          <ChannelPermissionsDialog
            communityId={props.communityId}
            channel={channel}
            onClose={() => setPermissionsTarget(null)}
          />
        )}
      </Show>
      <ConfirmDialog
        open={deleteTarget() !== null}
        title={
          deleteTarget()?.kind === "category"
            ? "Delete this category?"
            : "Delete this channel?"
        }
        description={
          deleteTarget()?.kind === "category"
            ? "Its channels stay, outside any category."
            : "Its messages are deleted for everyone. This can't be undone."
        }
        confirmLabel="Delete"
        danger
        pending={working()}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function IconButton(props: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: import("solid-js").JSX.Element;
}) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      disabled={props.disabled}
      onClick={() => props.onClick()}
      class="rounded p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
      classList={{ "hover:text-destructive": props.danger }}
    >
      {props.children}
    </button>
  );
}

function Dialog(props: {
  title: string;
  onClose: () => void;
  children: import("solid-js").JSX.Element;
}) {
  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={() => props.onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        class="w-full max-w-md rounded-lg border border-border-dialog bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="text-base font-semibold text-foreground">{props.title}</h2>
        {props.children}
      </section>
    </div>
  );
}

function ChannelEditorDialog(props: {
  communityId: string;
  editor: ChannelEditor;
  categories: ChannelCategory[];
  onClose: () => void;
}) {
  const core = requireHavenSolidCore();
  const editing = props.editor.mode === "edit" ? props.editor.channel : null;
  const [kind, setKind] = createSignal<"text" | "voice">(
    props.editor.mode === "create" ? props.editor.kind : "text",
  );
  const [name, setName] = createSignal(editing?.name ?? "");
  const [topic, setTopic] = createSignal(editing?.topic ?? "");
  const [categoryId, setCategoryId] = createSignal(
    props.editor.mode === "create" ? (props.editor.categoryId ?? "") : "",
  );
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const save = async () => {
    if (!name().trim()) {
      setError("A channel needs a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await core.channels.update(editing.id, {
          name: name().trim(),
          topic: topic().trim(),
        });
      } else {
        await core.channels.create(props.communityId, kind(), name().trim(), {
          topic: topic().trim() || undefined,
          category_id: categoryId() || undefined,
        });
      }
      props.onClose();
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't save the channel."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={editing ? `Edit #${editing.name}` : "New channel"}
      onClose={props.onClose}
    >
      <div class="mt-3 space-y-3">
        <Show when={!editing}>
          <div class="flex gap-2">
            <For each={["text", "voice"] as const}>
              {(option) => (
                <button
                  type="button"
                  class="flex-1 rounded border px-3 py-2 text-sm"
                  classList={{
                    "border-primary bg-surface-panel text-foreground":
                      kind() === option,
                    "border-border-control text-body-soft": kind() !== option,
                  }}
                  onClick={() => setKind(option)}
                >
                  {option === "text" ? "# Text" : "♪ Voice"}
                </button>
              )}
            </For>
          </div>
        </Show>
        <TextField value={name()} onChange={setName} label="Name" required />
        <TextField value={topic()} onChange={setTopic} label="Topic" />
        <Show when={!editing && props.categories.length > 0}>
          <label class="flex flex-col gap-1 text-sm font-medium text-form-label">
            Category
            <select
              value={categoryId()}
              onChange={(e) => setCategoryId(e.currentTarget.value)}
              class="rounded border border-border-control bg-surface-input px-2 py-2 text-sm text-foreground"
            >
              <option value="">No category</option>
              <For each={props.categories}>
                {(category) => (
                  <option value={category.id}>{category.name}</option>
                )}
              </For>
            </select>
          </label>
        </Show>
        <Show when={error()}>
          <p class="text-sm text-destructive">{error()}</p>
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" disabled={saving()} onClick={props.onClose}>
            Cancel
          </Button>
          <Button disabled={saving()} onClick={() => void save()}>
            {saving() ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CategoryEditorDialog(props: {
  communityId: string;
  editor: CategoryEditor;
  onClose: () => void;
}) {
  const core = requireHavenSolidCore();
  const editing = props.editor.mode === "edit" ? props.editor.category : null;
  const [name, setName] = createSignal(editing?.name ?? "");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const save = async () => {
    if (!name().trim()) {
      setError("A category needs a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await core.categories.save(
        props.communityId,
        name().trim(),
        editing
          ? { category_id: editing.id, position: editing.position }
          : undefined,
      );
      props.onClose();
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't save the category."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={editing ? "Rename category" : "New category"}
      onClose={props.onClose}
    >
      <div class="mt-3 space-y-3">
        <TextField value={name()} onChange={setName} label="Name" required />
        <Show when={error()}>
          <p class="text-sm text-destructive">{error()}</p>
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" disabled={saving()} onClick={props.onClose}>
            Cancel
          </Button>
          <Button disabled={saving()} onClick={() => void save()}>
            {saving() ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
