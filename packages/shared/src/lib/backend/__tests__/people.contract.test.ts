import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  actor,
  eventually,
  signOutAll,
} from "@test-support/setup/supabaseLocal";
import { friendOf, type HavenEvent } from "@shared/lib/backend";

describe.sequential(
  "people, friends and notifications (contract)",
  { timeout: 20_000 },
  () => {
    afterAll(signOutAll);

    it("a friend request becomes a friendship and a conversation", async () => {
      const memberA = await actor("member_a");
      const memberB = await actor("member_b");

      const found = await memberA.backend.people.findUser(memberB.username);
      expect(found?.id).toBe(memberB.id);
      // Nobody takes requests until they choose to, and the card says so.
      await memberB.backend.people.updateMySettings({
        friend_requests_from: "nobody",
      });
      expect(
        (await memberA.backend.people.getProfileCard(memberB.id))
          .can_friend_request,
      ).toBe(false);
      await expect(
        memberA.backend.social.sendFriendRequest(memberB.id),
      ).rejects.toMatchObject({ reason: "requests_closed" });
      await memberB.backend.people.updateMySettings({
        friend_requests_from: "community",
      });
      expect(
        (await memberA.backend.people.getProfileCard(memberB.id))
          .can_friend_request,
      ).toBe(true);
      const request = await memberA.backend.social.sendFriendRequest(
        memberB.id,
      );
      expect(request?.recipient_id).toBe(memberB.id);

      const [notification] =
        await memberB.backend.notifications.listNotifications({ limit: 1 });
      expect(notification.kind).toBe("friend_request");
      expect(notification.actor_id).toBe(memberA.id);

      await memberB.backend.social.answerFriendRequest(request!.id, true);
      const social = await memberA.backend.social.loadSocial();
      expect(social.requests).toEqual([]);
      expect(social.friendships.map((f) => friendOf(f, memberA.id))).toEqual([
        memberB.id,
      ]);

      const conversation = await memberA.backend.channels.openConversation(
        memberB.id,
      );
      expect(conversation.kind).toBe("dm");
      await memberA.backend.messages.sendMessage(conversation.id, {
        nonce: randomUUID(),
        body: "hi",
      });
      const { channels, participants } =
        await memberB.backend.channels.listConversations();
      expect(channels.map((c) => c.id)).toContain(conversation.id);
      expect(
        participants
          .filter((p) => p.channel_id === conversation.id)
          .map((p) => p.user_id)
          .sort(),
      ).toEqual([memberA.id, memberB.id].sort());

      // memberA was told the request was accepted, then got memberB's reply.
      await memberB.backend.messages.sendMessage(conversation.id, {
        nonce: randomUUID(),
        body: "hi back",
      });
      const inbox = await memberA.backend.notifications.listNotifications();
      expect(inbox.map((n) => n.kind)).toEqual([
        "direct_message",
        "friend_accepted",
      ]);
      await memberA.backend.notifications.markNotifications("dismissed", [
        inbox[0].id,
      ]);
      expect(
        (await memberA.backend.notifications.listNotifications()).map(
          (n) => n.kind,
        ),
      ).toEqual(["friend_accepted"]);

      const marked =
        await memberB.backend.notifications.markNotifications("read");
      expect(marked).toBeGreaterThan(0);
      expect(await memberB.backend.notifications.countUnseen()).toBe(0);
    });

    it("a profile change reaches the people who share a community", async () => {
      const memberA = await actor("member_a");
      const memberB = await actor("member_b");
      const heard: HavenEvent[] = [];
      let connected = false;
      const stop = memberB.backend.realtime.subscribeToMyEvents(memberB.id, {
        onEvent: (event) => heard.push(event),
        onConnected: () => {
          connected = true;
        },
      });
      try {
        await eventually(() => connected);
        // A new name is part of what everyone sees, so it is announced.
        const renamed = `rls_member_a_${Date.now() % 100000}`;
        await memberA.backend.people.updateMyProfile({ username: renamed });
        const event = await eventually(() =>
          heard.find(
            (e) => e.event === "profile.updated" && e.payload.id === memberA.id,
          ),
        );
        expect(event.payload).toMatchObject({ username: renamed });

        // A bio is a detail: shown on the card only as its owner allows.
        const bio = `bio ${Date.now()}`;
        await memberA.backend.people.updateMyProfile({ bio });
        await memberA.backend.people.updateMySettings({
          details_visible_to: "nobody",
        });
        expect(
          (await memberB.backend.people.getProfileCard(memberA.id)).bio,
        ).toBeNull();
        await memberA.backend.people.updateMySettings({
          details_visible_to: "everyone",
        });
        const card = await memberB.backend.people.getProfileCard(memberA.id);
        expect(card.bio).toBe(bio);
        expect(card.mutual_community_names).toContain("TEST: Hearth");
      } finally {
        stop();
        await memberA.backend.people.updateMyProfile({
          username: memberA.username,
          bio: "",
        });
        await memberA.backend.people.updateMySettings({
          details_visible_to: "friends",
        });
      }
    });

    it("the person's own account loads at once, and their devices hear it change", async () => {
      const memberA = await actor("member_a");
      const account = await memberA.backend.people.loadMyAccount({
        platform: "web",
      });
      expect(account.settings?.user_id).toBe(memberA.id);
      expect(account.profile).not.toBeNull();
      expect(account.settings?.dms_from).toBeDefined();
      expect(account.terms_versions.length).toBeGreaterThan(0);
      const theme = account.settings!.theme;

      const heard: HavenEvent[] = [];
      let connected = false;
      const stop = memberA.backend.realtime.subscribeToMyEvents(memberA.id, {
        onEvent: (event) => heard.push(event),
        onConnected: () => {
          connected = true;
        },
      });
      try {
        await eventually(() => connected);
        const changed = await memberA.backend.people.updateMySettings({
          theme: "contract-test",
        });
        expect(changed.theme).toBe("contract-test");
        await eventually(() =>
          heard.find((e) => e.event === "account.changed"),
        );
        // A setting left out is kept.
        expect((await memberA.backend.people.updateMySettings({})).theme).toBe(
          "contract-test",
        );
      } finally {
        stop();
        await memberA.backend.people.updateMySettings({ theme });
      }
    });

    it("a friend link shows who it is from, and only answering it does anything", async () => {
      const owner = await actor("community_owner");
      const memberB = await actor("member_b");
      const link = await owner.backend.social.createFriendLink();
      try {
        expect(link.max_uses).toBe(1);
        const from = await memberB.backend.social.getFriendLink(
          ` ${link.code.toLowerCase()} `,
        );
        expect(from).toMatchObject({
          owner_id: owner.id,
          username: owner.username,
          already_friends: false,
        });

        await memberB.backend.social.answerFriendLink(link.code, false);
        const [declined] = await owner.backend.notifications.listNotifications({
          limit: 1,
        });
        expect(declined).toMatchObject({ kind: "friend_link", actor_id: null });

        await memberB.backend.social.answerFriendLink(link.code, true);
        const social = await owner.backend.social.loadSocial();
        expect(social.friendships.map((f) => friendOf(f, owner.id))).toContain(
          memberB.id,
        );
        expect(social.links.find((l) => l.id === link.id)?.uses).toBe(1);
        await expect(
          memberB.backend.social.getFriendLink(link.code),
        ).rejects.toMatchObject({ kind: "not_found", reason: "link_invalid" });
      } finally {
        await owner.backend.social.removeFriend(memberB.id);
        await owner.backend.social.revokeFriendLink(link.id);
      }
    });
  },
);
