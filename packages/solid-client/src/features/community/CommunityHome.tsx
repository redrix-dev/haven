import { Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { requireHavenSolidCore } from "@solid-client/core";
import { CommunityAccessView } from "./CommunityAccessView";

/**
 * The "/" landing surface: bounce to the first community once the bootstrap
 * has loaded any, otherwise show the empty state. (DM/home surface replaces
 * the redirect when that feature lands.)
 */
export function CommunityHome() {
  const core = requireHavenSolidCore();
  const communities = core.communities.orderedCommunities();

  return (
    <Show when={communities()[0]} fallback={<CommunityAccessView />}>
      {(first) => <Navigate href={`/community/${first().id}`} />}
    </Show>
  );
}
