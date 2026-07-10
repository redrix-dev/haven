import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { requireHavenSolidCore } from "@solid-client/core";
import { SidePanel } from "@solid-client/components/ui/SidePanel";
import type { CommunitySettingsTab } from "@shared/core/sessionStorePorts";
import { CommunityRoleEditor } from "./CommunityRoleEditor";
import { CommunityInvitesTab } from "./CommunityInvitesTab";
import {
  COMMUNITY_SETTINGS_TAB_LABELS,
  canOpenCommunitySettingsPanel,
  defaultCommunitySettingsTab,
  visibleCommunitySettingsTabs,
} from "./communitySettingsAccess";

function CommunityOverviewTab(props: {
  communityId: string;
  communityName: string;
}) {
  return (
    <div class="overflow-y-auto p-6">
      <div class="mx-auto max-w-lg space-y-4">
        <div>
          <p class="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Community name
          </p>
          <p class="text-base font-medium text-foreground">
            {props.communityName}
          </p>
        </div>
        <p class="text-sm text-muted-foreground">
          General community settings (description, invite policy, and related
          options) will land here in the next pass. Role and invite management
          use the tabs above.
        </p>
      </div>
    </div>
  );
}

/**
 * Slide-over community settings panel. Opened from the sidebar community
 * header (and deep links that set `showServerSettingsModal` on the UI store).
 */
export function CommunitySettingsPanel() {
  const core = requireHavenSolidCore();
  // The UI store proxy, read in tracking scope — reads below stay reactive.
  const ui = () => core.uiStore.getState();

  const communityId = () => core.communities.activeCommunityId() ?? "";
  const communities = core.communities.orderedCommunities();
  const communityName = createMemo(
    () => communities().find((c) => c.id === communityId())?.name ?? "",
  );

  const perms = createMemo(() =>
    communityId() ? core.permissions.getPermissions(communityId()) : null,
  );

  const tabs = createMemo(() => {
    const current = perms();
    return current ? visibleCommunitySettingsTabs(current) : [];
  });

  const [activeTab, setActiveTab] = createSignal<CommunitySettingsTab | null>(
    null,
  );

  const open = () => ui().showServerSettingsModal;
  const canOpen = () => {
    const current = perms();
    return Boolean(
      communityId() && current && canOpenCommunitySettingsPanel(current),
    );
  };

  createEffect(() => {
    if (!open() || !canOpen()) return;

    const requested = ui().serverSettingsTab;
    const allowed = tabs();
    if (requested && allowed.includes(requested)) {
      setActiveTab(requested);
      return;
    }
    setActiveTab(defaultCommunitySettingsTab(perms()!) ?? allowed[0] ?? null);
  });

  createEffect(() => {
    if (!open()) setActiveTab(null);
  });

  createEffect(() => {
    const id = communityId();
    if (open() && id) void core.ensureCommunityPermissions(id);
  });

  createEffect(() => {
    if (!open()) return;
    communityId();
    const allowed = tabs();
    const current = activeTab();
    if (current && allowed.includes(current)) return;
    setActiveTab(defaultCommunitySettingsTab(perms()!) ?? allowed[0] ?? null);
  });

  const close = () => {
    ui().setShowServerSettingsModal(false);
    ui().setServerSettingsTab(null);
  };

  return (
    <Show when={open() && canOpen()}>
      <SidePanel
        open
        title={communityName() || "Community settings"}
        onClose={close}
        tabs={
          <div class="flex gap-1 py-2">
            <For each={tabs()}>
              {(tab) => (
                <button
                  type="button"
                  onClick={() => setActiveTab(tab)}
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
          <CommunityOverviewTab
            communityId={communityId()}
            communityName={communityName()}
          />
        </Show>
        <Show when={activeTab() === "roles"}>
          <CommunityRoleEditor communityId={communityId()} />
        </Show>
        <Show when={activeTab() === "invites"}>
          <CommunityInvitesTab communityId={communityId()} />
        </Show>
      </SidePanel>
    </Show>
  );
}

/** Open community settings for the active community, optionally on a tab. */
export function openCommunitySettings(tab?: CommunitySettingsTab) {
  const ui = requireHavenSolidCore().uiStore.getState();
  if (tab) ui.setServerSettingsTab(tab);
  ui.setShowServerSettingsModal(true);
}
