// Attachment links: asked for once while they work, again before they stop,
// and never written after sign-out. And what a message offers whom.
import { describe, expect, it, vi } from "vitest";
import type { MediaRecord } from "@shared/lib/backend/records";
import {
  Attachments,
  createAttachmentsState,
  LINK_LIFETIME_MS,
} from "../attachments/attachments";
import { createPlainStatePort } from "../kit/statePort";
import { messageActions } from "../messages/selectors";
import { deferred } from "./fixtures";

const file = (id: string): MediaRecord => ({
  id,
  bucket: "attachments",
  object_path: `m/${id}`,
  filename: `${id}.png`,
  mime_type: "image/png",
  size_bytes: 10,
  width: null,
  height: null,
});

function setup() {
  let now = 1_000;
  const media = {
    signedUrls: vi.fn(
      async (files: MediaRecord[]) =>
        new Map(files.map((f) => [f.id, `https://signed/${f.id}?t=${now}`])),
    ),
  };
  const port = createPlainStatePort(createAttachmentsState());
  const attachments = new Attachments(port, media, () => now);
  return { media, attachments, later: (ms: number) => (now += ms) };
}

describe("attachment links", () => {
  it("asks once for the files it holds no link for", async () => {
    const { media, attachments } = setup();
    await attachments.ensure([file("a"), file("b")]);
    await attachments.ensure([file("a"), file("b")]);
    expect(media.signedUrls).toHaveBeenCalledTimes(1);
    expect(attachments.url("a")).toBe("https://signed/a?t=1000");
  });

  it("does not ask twice for a file already being asked for", async () => {
    const { media, attachments } = setup();
    const held = deferred<Map<string, string>>();
    media.signedUrls.mockReturnValueOnce(held.promise);
    const first = attachments.ensure([file("a")]);
    await attachments.ensure([file("a")]);
    expect(media.signedUrls).toHaveBeenCalledTimes(1);
    held.resolve(new Map([["a", "https://signed/a"]]));
    await first;
    expect(attachments.url("a")).toBe("https://signed/a");
  });

  it("asks again before a link stops working", async () => {
    const { media, attachments, later } = setup();
    await attachments.ensure([file("a")]);
    later(LINK_LIFETIME_MS + 1);
    expect(attachments.url("a")).toBeNull();
    await attachments.ensure([file("a")]);
    expect(media.signedUrls).toHaveBeenCalledTimes(2);
    expect(attachments.url("a")).not.toBeNull();
  });

  it("asks again after a failure", async () => {
    const { media, attachments } = setup();
    media.signedUrls.mockRejectedValueOnce(new Error("offline"));
    await expect(attachments.ensure([file("a")])).rejects.toThrow("offline");
    await attachments.ensure([file("a")]);
    expect(attachments.url("a")).not.toBeNull();
  });

  it("writes nothing from an answer that arrives after sign-out", async () => {
    const { media, attachments } = setup();
    const held = deferred<Map<string, string>>();
    media.signedUrls.mockReturnValueOnce(held.promise);
    const asked = attachments.ensure([file("a")]);
    attachments.clear();
    held.resolve(new Map([["a", "https://signed/a"]]));
    await asked;
    expect(attachments.url("a")).toBeNull();
  });
});

describe("what a message offers", () => {
  const can =
    (...held: string[]) =>
    (permission: string) =>
      held.includes(permission);
  const inCommunity = { author_id: "ana", community_id: "hearth" };
  const inConversation = { author_id: "ana", community_id: null };

  it("the author edits and deletes their own, and does not report it", () => {
    expect(messageActions(inCommunity, "ana", can("send_messages"))).toEqual({
      reply: true,
      edit: true,
      delete: true,
      report: false,
    });
  });

  it("someone else deletes only with manage_messages", () => {
    expect(messageActions(inCommunity, "ben", can()).delete).toBe(false);
    expect(
      messageActions(inCommunity, "ben", can("manage_messages")).delete,
    ).toBe(true);
    expect(messageActions(inCommunity, "ben", can()).edit).toBe(false);
  });

  it("replies need send_messages in a community, never in a conversation", () => {
    expect(messageActions(inCommunity, "ben", can()).reply).toBe(false);
    expect(messageActions(inConversation, "ben", can()).reply).toBe(true);
  });

  it("in a conversation nobody deletes the other's message", () => {
    expect(
      messageActions(inConversation, "ben", can("manage_messages")).delete,
    ).toBe(false);
    expect(messageActions(inConversation, "ben", can()).report).toBe(true);
  });
});
