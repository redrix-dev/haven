import { For, Show, createMemo, createSignal } from "solid-js";
import { requireHavenSolidCore } from "@solid-client/core";
import { SidePanel } from "@solid-client/components/ui/SidePanel";
import {
  closeCommunitySettings,
  communitySettings,
  type CommunitySettingsTab,
} from "@solid-client/data/screen";
import { CommunityRoleEditor } from "./CommunityRoleEditor";
import { CommunityInvitesTab } from "./CommunityInvitesTab";
import { CommunityChannelsTab } from "./CommunityChannelsTab";
import { CommunityOverviewTab } from "./CommunityOverviewTab";
import {
  COMMUNITY_SETTINGS_TAB_LABELS,
  visibleCommunitySettingsTabs,
} from "./communitySettingsAccess";

/**
 * The slide-over community settings panel, opened from the sidebar's
 * community header or a deep link (`openCommunitySettings`). Its tabs are
 * the ones the database says the person may use; a tab asked for that they
 * may not use opens the first one instead.
 */
export function CommunitySettingsPanel() {
  const core = requireHavenSolidCore();
  const open = () => communitySettings();
  const communityId = () => open()?.communityId ?? "";
  const community = () => core.stores.communities.byId[communityId()];

  const tabs = createMemo(() =>
    open() ? visibleCommunitySettingsTabs(core, communityId()) : [],
  );
  const [picked, setPicked] = createSignal<CommunitySettingsTab | null>(null);
  const activeTab = () => {
    const allowed = tabs();
    const wanted = picked() ?? open()?.tab ?? null;
    return wanted && allowed.includes(wanted) ? wanted : (allowed[0] ?? null);
  };

  const close = () => {
    setPicked(null);
    closeCommunitySettings();
  };

  return (
    <Show when={open() && community()}>
      <SidePanel
        open
        title={community()?.name || "Community settings"}
        onClose={close}
        tabs={
          <div class="flex gap-1 py-2">
            <For each={tabs()}>
              {(tab) => (
                <button
                  type="button"
                  onClick={() => setPicked(tab)}
                  class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                  classList={{
                    "bg-surface-row-selected text-foreground":
                      activeTab() === tab,
                    "text-muted-foreground hover:bg-surface-hover hover:text-foreground":
                      activeTab() !== tab,
                  }}
                >
                  {COMMUNITY_SETTINGS_TAB_LABELS[tab]}
                </button>
              )}
            </For>
          </div>
        }
      >
        <Show when={activeTab() === "overview"}>
          <CommunityOverviewTab communityId={communityId()} onDone={close} />
        </Show>
        <Show when={activeTab() === "roles"}>
          <CommunityRoleEditor communityId={communityId()} />
        </Show>
        <Show when={activeTab() === "channels"}>
          <CommunityChannelsTab communityId={communityId()} />
        </Show>
        <Show when={activeTab() === "invites"}>
          <CommunityInvitesTab communityId={communityId()} />
        </Show>
      </SidePanel>
    </Show>
  );
}
