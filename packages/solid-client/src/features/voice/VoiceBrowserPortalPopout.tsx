import {
  batch,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js";
import { delegateEvents, render } from "solid-js/web";
import type { VoiceMirrorState } from "@solid-client/contexts/voiceSync";
import { useSession } from "@solid-client/contexts/SessionProvider";
import { useVoice } from "@solid-client/contexts/VoiceProvider";
import { requireHavenSolidCore } from "@solid-client/core";
import { VoicePopoutPanel } from "./VoicePopoutPanel";
import {
  openVoicePortalWindow,
  type VoicePortalWindowTarget,
} from "./voiceBrowserPortalWindow";

const VOICE_POPOUT_ROUTE = "/popout/voice";

export function VoiceBrowserPortalPopout(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFallback?: () => void;
}) {
  const { voice, toggleMute, toggleDeafen, leave } = useVoice();
  const core = requireHavenSolidCore();
  const { session } = useSession();
  const userId = () => session()?.user.id ?? null;
  const viewerProfile = core.profiles.viewerProfile(userId);
  const [target, setTarget] = createSignal<VoicePortalWindowTarget | null>(
    null,
  );
  let disposePanel: (() => void) | null = null;

  const unmountPanel = () => {
    disposePanel?.();
    disposePanel = null;
  };

  const closeTarget = () => {
    const current = target();
    if (!current) return;
    unmountPanel();
    setTarget(null);
    current.close();
  };

  const fallbackToRoute = (
    current: VoicePortalWindowTarget | null,
    reason: string,
  ) => {
    console.warn(`[voice] browser portal popout fallback: ${reason}`);
    unmountPanel();
    batch(() => {
      if (target() === current) setTarget(null);
      props.onOpenChange(false);
    });

    if (current?.isOpen()) {
      current.navigateToRoute(VOICE_POPOUT_ROUTE);
    } else {
      props.onFallback?.();
    }
  };

  const openTarget = () => {
    const current = target();
    if (current?.isOpen()) {
      current.focus();
      return;
    }

    closeTarget();

    const nextTarget = openVoicePortalWindow({
      onClosed: () => {
        batch(() => {
          props.onOpenChange(false);
          setTarget(null);
        });
      },
    });
    if (!nextTarget) {
      props.onOpenChange(false);
      props.onFallback?.();
      return;
    }

    setTarget(nextTarget);
  };

  createEffect(() => {
    if (props.open && voice.activeChannel) {
      openTarget();
      return;
    }
    closeTarget();
  });

  const mirror = (): VoiceMirrorState => ({
    activeChannel: voice.activeChannel
      ? {
          communityId: voice.activeChannel.communityId,
          channelId: voice.activeChannel.channelId,
          channelName: voice.activeChannel.channelName,
        }
      : null,
    joined: voice.joined,
    joining: voice.joining,
    isMuted: voice.isMuted,
    isDeafened: voice.isDeafened,
    participants: voice.participants.map((participant) => ({
      userId: participant.userId,
      displayName: participant.displayName,
      avatarUrl: participant.avatarUrl ?? null,
      isSpeaking: participant.isSpeaking ?? false,
      muted: participant.muted,
      deafened: participant.deafened,
    })),
    selfDisplayName: viewerProfile()?.username ?? "You",
    selfAvatarUrl: viewerProfile()?.avatarUrl ?? null,
    error: voice.error,
    notice: voice.notice,
  });

  const handleCommand = (command: "toggleMute" | "toggleDeafen" | "leave") => {
    if (command === "toggleMute") toggleMute();
    if (command === "toggleDeafen") toggleDeafen();
    if (command === "leave") void leave();
  };

  createEffect(() => {
    const current = target();
    unmountPanel();
    if (!current) return;

    // Solid delegates events on the MAIN window's document; the panel renders
    // into the popout window's document, so its onClick handlers never fire
    // there unless we also enable click delegation on the child document.
    delegateEvents(["click"], current.win.document);

    try {
      disposePanel = untrack(() =>
        render(
          () => (
            <VoicePopoutPanel mirror={mirror()} onCommand={handleCommand} />
          ),
          current.root,
        ),
      );
    } catch (error) {
      fallbackToRoute(
        current,
        error instanceof Error ? error.message : String(error),
      );
    }

    queueMicrotask(() => {
      if (target() !== current || !current.isOpen()) return;
      if (current.root.childElementCount > 0) return;
      fallbackToRoute(current, "rendered empty root");
    });
  });

  onCleanup(() => {
    const current = target();
    unmountPanel();
    current?.close();
  });

  return null;
}
