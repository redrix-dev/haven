import { onCleanup, onMount } from "solid-js";
import { requireHavenSolidCore } from "@solid-client/core";
import { useToast } from "@solid-client/contexts/ToastProvider";
import { useVoice } from "@solid-client/contexts/VoiceProvider";

/**
 * Renders nothing — tells the viewer when they lose access to a community
 * (kicked, banned, or it was deleted) and leaves its voice channel. The core
 * has already forgotten the community; CommunityView's route guard moves off
 * it. The platform's single subscriber, so it also receives losses found at
 * sign-in (kicked while the app was closed).
 *
 * Mounted once in the authed layout.
 */
export function CommunityAccessLossHost() {
  const core = requireHavenSolidCore();
  const toast = useToast();
  const voice = useVoice();

  onMount(() => {
    const unsubscribe = core.subscribeCommunityAccessLost((loss) => {
      if (loss.inVoice) void voice.leave();
      toast.show({
        title: "Removed from community",
        body: `You no longer have access to ${loss.communityName}.`,
      });
    });
    onCleanup(unsubscribe);
  });

  return null;
}
