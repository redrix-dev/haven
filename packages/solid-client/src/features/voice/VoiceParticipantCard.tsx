import { Show, createSignal } from "solid-js";
import * as Popover from "@kobalte/core/popover";
import { MoreHorizontal, MicOff } from "lucide-solid";
import { Avatar, Button, ConfirmDialog } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";
import { useVoice } from "@solid-client/contexts/VoiceProvider";
import type { VoiceParticipant } from "@shared/features/voice/types";
import type { VoiceMemberAction } from "@shared/features/voice/utils/memberControls";
import { isVoiceTargetBelowViewer } from "@shared/features/voice/utils/memberHierarchy";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

export function VoiceParticipantCard(props: {
  participant: VoiceParticipant;
  full?: boolean;
  self?: boolean;
}) {
  const core = requireHavenSolidCore();
  const { voice, setMemberVolume } = useVoice();
  const communityId = () => voice.activeChannel?.communityId ?? "";
  const members = core.admin.members(communityId);
  const roles = core.admin.roleSnapshot(communityId);
  const member = () =>
    members().find((item) => item.userId === props.participant.userId);
  const eligible = () =>
    !!member() &&
    !props.self &&
    isVoiceTargetBelowViewer(
      roles(),
      core.authStore.getState().user?.id ?? "",
      props.participant.userId,
    );
  const canManage = () =>
    eligible() &&
    core.permissions.getPermissions(communityId()).canManageMembers;
  const canBan = () =>
    eligible() && core.permissions.getPermissions(communityId()).canManageBans;
  const volume = () => voice.memberVolumes[props.participant.userId] ?? 100;
  const [error, setError] = createSignal<string | null>(null);
  const [pending, setPending] = createSignal<"kick" | "ban" | null>(null);
  const [working, setWorking] = createSignal(false);
  let previousVolume = 100;
  const control = async (action: VoiceMemberAction) => {
    setError(null);
    try {
      await core.voice.controlParticipant(
        props.participant.userId,
        voice.activeChannel!.channelId,
        action,
      );
    } catch (error) {
      setError(getErrorMessage(error, "Could not update this participant."));
    }
  };
  const communityAction = async (reason: string) => {
    setWorking(true);
    try {
      const input = {
        communityId: communityId(),
        targetUserId: props.participant.userId,
      };
      if (pending() === "ban") await core.admin.banMember({ ...input, reason });
      else await core.admin.kickMember(input);
      setPending(null);
    } catch (error) {
      setError(getErrorMessage(error, "Could not update this member."));
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <div
        class={
          props.full
            ? "group relative flex min-h-48 flex-col items-center justify-center gap-4 rounded-xl bg-surface-panel p-5"
            : "group relative flex items-center gap-3 rounded-lg px-2 py-2"
        }
      >
        <span
          class="rounded-full"
          classList={{
            "ring-2 ring-accent-success ring-offset-2 ring-offset-surface-panel":
              !!props.participant.isSpeaking && !props.participant.muted,
          }}
        >
          <Avatar
            name={props.participant.displayName}
            src={props.participant.avatarUrl}
            size={props.full ? "lg" : "sm"}
            class={props.full ? "h-20 w-20 text-2xl" : ""}
          />
        </span>
        <div
          class={
            props.full ? "min-w-0 max-w-full text-center" : "min-w-0 flex-1"
          }
        >
          <span class="block truncate text-sm text-foreground">
            {props.participant.displayName}
          </span>
          <Show when={props.self}>
            <span class="text-xs text-muted-foreground">You</span>
          </Show>
        </div>
        <Show when={props.participant.muted}>
          <MicOff
            size={13}
            class="text-muted-foreground"
            aria-label="Microphone muted"
          />
        </Show>
        <Show when={!props.self}>
          <Popover.Root placement="top-end">
            <Popover.Trigger
              class={
                props.full
                  ? "absolute right-2 top-2 rounded p-2 text-muted-foreground hover:bg-surface-hover"
                  : "rounded p-1 text-muted-foreground opacity-0 hover:bg-surface-hover group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100"
              }
              aria-label={`Actions for ${props.participant.displayName}`}
            >
              <MoreHorizontal size={16} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content class="z-[120] w-64 rounded-lg border border-border bg-card p-3 text-sm text-foreground shadow-xl">
                <Popover.Title class="mb-3 truncate font-medium">
                  {props.participant.displayName}
                </Popover.Title>
                <label class="block text-xs">
                  Volume for you · {volume()}%
                  <input
                    aria-label={`Volume for ${props.participant.displayName}`}
                    class="my-2 w-full accent-primary"
                    type="range"
                    min="0"
                    max="100"
                    value={volume()}
                    onInput={(event) =>
                      setMemberVolume(
                        props.participant.userId,
                        event.currentTarget.valueAsNumber,
                      )
                    }
                  />
                </label>
                <label class="mb-2 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={volume() === 0}
                    onChange={(event) => {
                      if (event.currentTarget.checked) {
                        previousVolume = volume() || 100;
                        setMemberVolume(props.participant.userId, 0);
                      } else
                        setMemberVolume(
                          props.participant.userId,
                          previousVolume,
                        );
                    }}
                  />
                  Mute for me
                </label>
                <Show when={canManage() && props.participant.sessionId}>
                  <div class="my-2 border-t border-border pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="w-full justify-start text-xs"
                      onClick={() => void control("remove")}
                    >
                      Remove from channel
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="w-full justify-start text-xs"
                      onClick={() =>
                        void control(
                          props.participant.muted ? "unmute" : "mute",
                        )
                      }
                    >
                      {props.participant.muted
                        ? "Unmute microphone"
                        : "Mute microphone"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="w-full justify-start text-xs"
                      onClick={() =>
                        void control(
                          props.participant.deafened ? "undeafen" : "deafen",
                        )
                      }
                    >
                      {props.participant.deafened ? "Undeafen" : "Deafen"}
                    </Button>
                  </div>
                </Show>
                <Show when={canManage() || canBan()}>
                  <details class="border-t border-border pt-2 text-xs">
                    <summary class="cursor-pointer py-2">
                      Community actions
                    </summary>
                    <Show when={canManage()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="w-full justify-start text-xs"
                        onClick={() => setPending("kick")}
                      >
                        Kick from community…
                      </Button>
                    </Show>
                    <Show when={canBan()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="w-full justify-start text-xs text-destructive"
                        onClick={() => setPending("ban")}
                      >
                        Ban from community…
                      </Button>
                    </Show>
                  </details>
                </Show>
                <Show when={error()}>
                  <p role="alert" class="mt-2 text-xs text-destructive">
                    {error()}
                  </p>
                </Show>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </Show>
      </div>
      <ConfirmDialog
        open={pending() !== null}
        title={`${pending() === "ban" ? "Ban" : "Kick"} ${props.participant.displayName}?`}
        description={error() ?? "This affects their community membership."}
        confirmLabel={pending() === "ban" ? "Ban member" : "Kick member"}
        danger
        reason={
          pending() === "ban" ? { label: "Reason", required: true } : undefined
        }
        pending={working()}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => void communityAction(reason)}
      />
    </>
  );
}
