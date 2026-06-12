import { For, Show, createEffect } from "solid-js";
import { Crown } from "lucide-solid";
import { requireHavenSolidCore } from "@solid-client/core";
import { Avatar } from "@solid-client/components/ui";
import {
  createCommunityMembers,
  createCommunityMembersLoading,
} from "@solid-client/data/community-management";

export function MembersPanel(props: { communityId: string }) {
  const core = requireHavenSolidCore();
  const members = createCommunityMembers(core.admin, () => props.communityId);
  const loading = createCommunityMembersLoading(
    core.admin,
    () => props.communityId,
  );

  createEffect(() => {
    void core.admin.ensureMembersLoaded(props.communityId);
  });

  return (
    <aside class="flex w-60 shrink-0 flex-col overflow-y-auto bg-surface-panel px-3 py-3">
      <p class="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Members
        <Show when={members().length > 0}> — {members().length}</Show>
      </p>
      <Show
        when={!loading() || members().length > 0}
        fallback={<p class="px-1 text-sm text-muted-foreground">Loading…</p>}
      >
        <For each={members()}>
          {(member) => (
            <div class="flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-list-hover">
              <Avatar src={member.avatarUrl} name={member.displayName} />
              <span class="min-w-0 truncate text-sm text-body-soft">
                {member.displayName}
              </span>
              <Show when={member.isOwner}>
                <Crown size={14} class="shrink-0 text-accent-amber" />
              </Show>
            </div>
          )}
        </For>
      </Show>
    </aside>
  );
}
