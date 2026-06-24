import { onMount } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { requireHavenSolidCore } from "@solid-client/core";

/** Deep link: /community/:id/roles opens the settings panel on the Roles tab. */
export function RoleManagementView() {
  const core = requireHavenSolidCore();
  const params = useParams();
  const navigate = useNavigate();

  onMount(() => {
    const id = params.communityId ?? "";
    const ui = core.uiStore.getState();
    ui.setServerSettingsTab("roles");
    ui.setShowServerSettingsModal(true);
    navigate(`/community/${id}`, { replace: true });
  });

  return null;
}
