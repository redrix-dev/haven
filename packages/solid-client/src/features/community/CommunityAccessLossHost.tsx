import { createEffect } from "solid-js";
import { requireHavenSolidCore } from "@solid-client/core";
import { useToast } from "@solid-client/contexts/ToastProvider";
import { useVoice } from "@solid-client/contexts/VoiceProvider";

/**
 * Renders nothing. Tells the person when a community is gone for them (they
 * left, here or on another device, were removed or banned, or it was
 * deleted) and leaves its voice channel. The core has already forgotten the
 * community, so its name is remembered here; CommunityView's route guard
 * moves off it.
 *
 * Mounted once in the authed layout.
 */
export function CommunityAccessLossHost() {
  const core = requireHavenSolidCore();
  const toast = useToast();
  const voice = useVoice();
  const names = new Map<string, string>();

  createEffect(() => {
    for (const community of Object.values(core.stores.communities.byId)) {
      names.set(community.id, community.name);
    }
  });

  core.listen({
    communityGone: (communityId) => {
      if (voice.voice.activeChannel?.communityId === communityId) {
        void voice.leave();
      }
      const name = names.get(communityId);
      names.delete(communityId);
      toast.show({
        title: "No longer in a community",
        body: name ? `You're no longer in ${name}.` : undefined,
      });
    },
  });

  return null;
}
