import { Match, Switch } from "solid-js";
import { Navigate } from "@solidjs/router";
import { requireHavenSolidCore } from "@solid-client/core";
import { myCommunities } from "@shared/collections/communities/selectors";
import { CommunityAccessView } from "./CommunityAccessView";

/**
 * The "/" landing surface: back where the person was (the session's place,
 * kept on the device), else their first community, else the way in.
 */
export function CommunityHome() {
  const core = requireHavenSolidCore();
  const place = () => core.stores.session.place;
  const first = () => myCommunities(core.stores.communities)[0];

  return (
    <Switch fallback={<CommunityAccessView />}>
      <Match when={place()?.kind === "conversation" && place()}>
        {(at) => <Navigate href={`/direct-messages/${at().channel_id}`} />}
      </Match>
      <Match
        when={
          place()?.kind === "community" &&
          core.stores.communities.byId[
            (place() as { community_id: string }).community_id
          ] &&
          place()
        }
      >
        {(at) => {
          const here = at() as {
            community_id: string;
            channel_id: string | null;
          };
          return (
            <Navigate
              href={
                here.channel_id
                  ? `/community/${here.community_id}/channel/${here.channel_id}`
                  : `/community/${here.community_id}`
              }
            />
          );
        }}
      </Match>
      <Match when={first()}>
        {(community) => <Navigate href={`/community/${community().id}`} />}
      </Match>
    </Switch>
  );
}
