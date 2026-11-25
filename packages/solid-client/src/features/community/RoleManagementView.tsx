import { onMount } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { openCommunitySettings } from "@solid-client/data/screen";

/** Deep link: /community/:id/roles opens the settings panel on the Roles tab. */
export function RoleManagementView() {
  const params = useParams();
  const navigate = useNavigate();

  onMount(() => {
    const id = params.communityId ?? "";
    openCommunitySettings(id, "roles");
    navigate(`/community/${id}`, { replace: true });
  });

  return null;
}
