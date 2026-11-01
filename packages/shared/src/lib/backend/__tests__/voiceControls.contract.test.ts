import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createVoiceTokenBackend } from "../voiceTokenBackend";
import {
  createScratchCommunity,
  type ScratchCommunity,
} from "@test-support/setup/scratchCommunity";
import { loadBootstrappedTestUsers } from "@test-support/fixtures/users";
import {
  localSupabaseEnv,
  signInAsTestUser,
  signOutTestUser,
  supabase,
  testBackends,
} from "@test-support/setup/supabaseLocal";

describe.sequential("Voice controls (contract)", () => {
  let scratch: ScratchCommunity;
  let channelId: string;
  const users = loadBootstrappedTestUsers();
  const receiver = createClient(
    localSupabaseEnv.url,
    localSupabaseEnv.anonKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const backend = createVoiceTokenBackend(supabase);
  beforeAll(async () => {
    scratch = await createScratchCommunity("voice controls", [
      "member_a",
      "member_b",
    ]);
    channelId = (
      await testBackends.communityData.createChannel({
        communityId: scratch.communityId,
        name: "Game room",
        kind: "voice",
        topic: null,
        position: 1,
      })
    ).id;
    const { error } = await receiver.auth.signInWithPassword({
      email: users.member_b.email,
      password: users.member_b.password,
    });
    if (error) throw error;
  });
  afterAll(async () => {
    await receiver.removeAllChannels();
    await receiver.auth.signOut();
    await scratch?.dispose();
    await signOutTestUser();
  });
  it("refuses a plain member and delivers the owner's attributed command on the recipient's private channel", async () => {
    const input = {
      communityId: scratch.communityId,
      channelId,
      targetUserId: users.member_b.id,
      targetSessionId: "recipient-current-call",
      action: "mute" as const,
    };
    await signInAsTestUser("member_a");
    await expect(backend.sendControl!(input)).rejects.toMatchObject({
      code: "42501",
    });
    let received!: (payload: Record<string, unknown>) => void;
    const delivery = new Promise<Record<string, unknown>>((resolve) => {
      received = resolve;
    });
    const channel = receiver
      .channel(`private_user:${users.member_b.id}`, {
        config: { private: true },
      })
      .on("broadcast", { event: "VOICE_CONTROL" }, ({ payload }) =>
        received(payload),
      );
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Private voice channel subscription timed out")),
        8000,
      );
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          reject(new Error(status));
        }
      });
    });
    await signInAsTestUser("community_owner");
    await backend.sendControl!(input);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const payload = await Promise.race([
        delivery,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Voice command was not delivered")),
            8000,
          );
        }),
      ]);
      expect(payload).toMatchObject({
        actor_user_id: users.community_owner.id,
        target_user_id: users.member_b.id,
        target_session_id: input.targetSessionId,
        channel_name: "Game room",
        action: "mute",
      });
      expect(payload.actor_name).toBeTruthy();
    } finally {
      clearTimeout(timer);
      await receiver.removeChannel(channel);
    }
  }, 20000);
});
