import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  actor,
  hearthChannelId,
  signOutAll,
} from "@test-support/setup/supabaseLocal";

// The smallest valid PNG: one transparent pixel.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);
const picture = {
  body: PNG,
  mime_type: "image/png",
  size_bytes: PNG.byteLength,
  filename: "pixel.png",
  width: 1,
  height: 1,
};

describe.sequential("media (contract)", { timeout: 20_000 }, () => {
  afterAll(signOutAll);

  it("a file sent with a message can be read by members and nobody else", async () => {
    const memberA = await actor("member_a");
    const memberB = await actor("member_b");
    const stranger = await actor("non_member");

    const upload = await memberA.backend.media.uploadFile(
      "attachment",
      picture,
    );
    const sent = await memberA.backend.messages.sendMessage(
      hearthChannelId("general"),
      { nonce: randomUUID(), body: "", attachment_ids: [upload.id] },
    );
    expect(sent.attachments.map((file) => file.id)).toEqual([upload.id]);

    const links = await memberB.backend.media.signedUrls(sent.attachments);
    const response = await fetch(links.get(upload.id)!);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);

    const strangerLinks = await stranger.backend.media
      .signedUrls(sent.attachments)
      .catch(() => new Map<string, string>());
    expect(strangerLinks.get(upload.id)).toBeUndefined();
  });

  it("a type storage does not accept is refused before anything is uploaded", async () => {
    const memberA = await actor("member_a");
    await expect(
      memberA.backend.media.uploadFile("attachment", {
        ...picture,
        mime_type: "application/x-msdownload",
      }),
    ).rejects.toMatchObject({
      kind: "invalid",
      reason: "file_type_not_allowed",
    });
  });

  it("an avatar is public at the address the client works out", async () => {
    const memberA = await actor("member_a");
    const profile = await memberA.backend.media.setMyAvatar(picture);
    const url = memberA.backend.media.avatarUrl(profile);
    expect(url).not.toBeNull();
    const response = await fetch(url!);
    expect(response.status).toBe(200);

    const cleared = await memberA.backend.media.removeMyAvatar();
    expect(cleared.avatar_media_id).toBeNull();
    expect(memberA.backend.media.avatarUrl(cleared)).toBeNull();
  });
});
