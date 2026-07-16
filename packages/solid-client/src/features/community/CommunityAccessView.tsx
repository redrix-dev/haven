import { Show, createSignal } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { LogIn, Plus } from "lucide-solid";
import { normalizeInviteCode } from "@shared/features/community/utils/inviteCode";
import { Button, TextField } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";

/** Create or join a community from one shell-agnostic Solid surface. */
export function CommunityAccessView() {
  const core = requireHavenSolidCore();
  const navigate = useNavigate();
  const params = useParams<{ inviteCode?: string }>();
  const [name, setName] = createSignal("");
  const [invite, setInvite] = createSignal(params.inviteCode ?? "");
  const [creating, setCreating] = createSignal(false);
  const [joining, setJoining] = createSignal(false);
  const [createError, setCreateError] = createSignal<string | null>(null);
  const [joinError, setJoinError] = createSignal<string | null>(null);

  const create = async () => {
    const communityName = name().trim();
    if (!communityName) {
      setCreateError("Enter a community name.");
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const community = await core.createCommunity(communityName);
      navigate(`/community/${community.id}`);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Couldn't create community.",
      );
    } finally {
      setCreating(false);
    }
  };

  const join = async () => {
    const code = normalizeInviteCode(invite());
    if (!code) {
      setJoinError("Enter an invite code or link.");
      return;
    }
    setJoinError(null);
    setJoining(true);
    try {
      const result = await core.joinCommunityByInvite(code);
      navigate(`/community/${result.communityId}`);
    } catch (error) {
      setJoinError(
        error instanceof Error ? error.message : "Couldn't join community.",
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <div class="h-full overflow-y-auto bg-surface-app px-6 py-10">
      <div class="mx-auto max-w-3xl">
        <h1 class="text-2xl font-bold text-foreground">Find your people</h1>
        <p class="mt-2 text-sm text-muted-foreground">
          Start a new community or redeem an invite from someone you trust.
        </p>

        <div class="mt-8 grid gap-5 md:grid-cols-2">
          <section class="rounded-xl border border-border bg-card p-5">
            <div class="mb-4 flex items-center gap-2">
              <Plus size={18} class="text-primary" />
              <h2 class="font-semibold text-foreground">Create a community</h2>
            </div>
            <TextField
              value={name()}
              onChange={setName}
              label="Community name"
              placeholder="Neighborhood book club"
              error={createError()}
              disabled={creating()}
              required
            />
            <Button
              class="mt-4 w-full"
              disabled={creating()}
              onClick={() => void create()}
            >
              {creating() ? "Creating…" : "Create community"}
            </Button>
          </section>

          <section class="rounded-xl border border-border bg-card p-5">
            <div class="mb-4 flex items-center gap-2">
              <LogIn size={18} class="text-primary" />
              <h2 class="font-semibold text-foreground">Join a community</h2>
            </div>
            <TextField
              value={invite()}
              onChange={setInvite}
              label="Invite code or link"
              placeholder="Paste an invite"
              error={joinError()}
              disabled={joining()}
              required
            />
            <Button
              class="mt-4 w-full"
              variant="secondary"
              disabled={joining()}
              onClick={() => void join()}
            >
              {joining() ? "Joining…" : "Join community"}
            </Button>
          </section>
        </div>

        <Show when={creating() || joining()}>
          <p class="mt-4 text-center text-xs text-muted-foreground">
            Updating your community list…
          </p>
        </Show>
      </div>
    </div>
  );
}
