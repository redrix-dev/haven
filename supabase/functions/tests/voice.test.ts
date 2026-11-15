// The two voice functions. The database decides who may do what (called for
// real, as each fixture person); LiveKit is stood in for by a local server so
// the test can see exactly what Haven would ask it to do.

import { handle as voiceControl } from "../voice-control/handler.ts";
import { handle as voiceToken } from "../voice-token/handler.ts";
import {
  type Actor,
  actor,
  assert,
  assertEquals,
  channelId,
  type Fake,
  fakeService,
  quietQueue,
  sql,
  test,
  tokenClaims,
} from "./_support.ts";

const API_KEY = "fn-test-key";
const API_SECRET = "fn-test-secret-that-is-long-enough-to-sign";

function ask(who: Actor | null, body: unknown): Request {
  return new Request("http://voice.test/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(who ? { authorization: `Bearer ${who.token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function withVoice(
  liveKitAnswers: () => Response,
  run: (liveKit: Fake) => Promise<void>,
): Promise<void> {
  await quietQueue();
  const liveKit = fakeService(liveKitAnswers);
  Deno.env.set("LIVEKIT_URL", liveKit.url.replace("http", "ws"));
  Deno.env.set("LIVEKIT_API_KEY", API_KEY);
  Deno.env.set("LIVEKIT_API_SECRET", API_SECRET);
  try {
    await run(liveKit);
  } finally {
    await liveKit.close();
  }
}

const twirpOk = () => Response.json({});

test("a member gets a token for a voice channel they can see, in their own name", async () => {
  await withVoice(twirpOk, async (liveKit) => {
    const memberA = await actor("member_a");
    const lounge = await channelId("Lounge");
    const response = await voiceToken(ask(memberA, { channelId: lounge }));
    assertEquals(response.status, 200, "they are let in");
    const { token, serverUrl } = await response.json();
    assertEquals(
      serverUrl,
      liveKit.url.replace("http", "ws"),
      "told where to connect",
    );

    const claims = tokenClaims(token) as {
      sub: string;
      name: string;
      iss: string;
      exp: number;
      nbf: number;
      video: Record<string, unknown>;
    };
    assertEquals(claims.sub, memberA.id, "the token is for them");
    assertEquals(
      claims.name,
      "rls_member_a",
      "under the name the database gave",
    );
    assertEquals(claims.iss, API_KEY, "signed as Haven");
    assertEquals(claims.video.room, lounge, "for that channel's room only");
    assertEquals(claims.video.roomJoin, true, "to join it");
    assertEquals(claims.video.roomAdmin, undefined, "not to run it");
    const lifetime = claims.exp - Math.floor(Date.now() / 1000);
    assert(
      lifetime > 500 && lifetime <= 600,
      `it lasts ten minutes (${lifetime}s)`,
    );
  });
});

test("nobody gets a voice token they should not have", async () => {
  await withVoice(twirpOk, async () => {
    const memberA = await actor("member_a");
    const memberB = await actor("member_b");
    const lounge = await channelId("Lounge");
    const refusedWith = async (request: Request) => {
      const response = await voiceToken(request);
      const body = await response.json();
      return [response.status, body.reason, "token" in body];
    };

    assertEquals(
      await refusedWith(ask(null, { channelId: lounge })),
      [401, "not_signed_in", false],
      "someone not signed in",
    );
    assertEquals(
      await refusedWith(ask(await actor("non_member"), { channelId: lounge })),
      [404, "channel_not_found", false],
      "someone outside the community (and they are not told it exists)",
    );
    assertEquals(
      await refusedWith(
        ask(memberA, { channelId: await channelId("general") }),
      ),
      [404, "channel_not_found", false],
      "a text channel",
    );
    assertEquals(
      await refusedWith(ask(memberA, { channelId: "not-an-id" })),
      [400, "channel_invalid", false],
      "a malformed channel",
    );

    await sql`insert into public.account_restrictions (user_id) values (${memberB.id})`;
    try {
      assertEquals(
        await refusedWith(ask(memberB, { channelId: lounge })),
        [403, "account_restricted", false],
        "a restricted account",
      );
    } finally {
      await sql`delete from public.account_restrictions where user_id = ${memberB.id} and case_id is null`;
    }

    Deno.env.delete("LIVEKIT_API_SECRET");
    assertEquals(
      await refusedWith(ask(memberA, { channelId: lounge })),
      [503, "voice_not_configured", false],
      "anyone, when voice is not set up",
    );
  });
});

test("removing someone from voice is checked by the database, then enforced at the voice service", async () => {
  await withVoice(twirpOk, async (liveKit) => {
    const owner = await actor("owner");
    const memberA = await actor("member_a");
    const memberB = await actor("member_b");
    const lounge = await channelId("Lounge");
    const remove = (who: Actor, target: Actor) =>
      voiceControl(
        ask(who, {
          channelId: lounge,
          userId: target.id,
          sessionId: "session-1",
          action: "remove",
        }),
      );

    const denied = await remove(memberA, memberB);
    assertEquals(
      [denied.status, (await denied.json()).reason],
      [403, "missing_permission"],
      "an ordinary member cannot remove someone",
    );
    assertEquals(
      liveKit.requests.length,
      0,
      "and the voice service is not touched",
    );

    await sql`delete from realtime.messages where event = 'voice.control'`;
    const allowed = await remove(owner, memberA);
    assertEquals(
      [allowed.status, await allowed.json()],
      [200, { ok: true, enforced: true }],
      "the owner can",
    );
    const told = await sql`
      select payload from realtime.messages
      where topic = ${"user:" + memberA.id} and event = 'voice.control'`;
    assertEquals(told.length, 1, "the person's app is told");
    assertEquals(told[0].payload.action, "remove", "what happened");

    assertEquals(liveKit.requests.length, 1, "the voice service is asked once");
    const [request] = liveKit.requests;
    assertEquals(
      request.method + " " + request.path,
      "POST /twirp/livekit.RoomService/RemoveParticipant",
      "to remove a participant",
    );
    const sent = request.json as { room: string; identity: string };
    assertEquals(
      [sent.room, sent.identity],
      [lounge, memberA.id],
      "that person, from that channel's room",
    );
    const admin = tokenClaims(
      (request.headers.get("authorization") ?? "").replace(/^Bearer /, ""),
    ) as { iss: string; video: Record<string, unknown> };
    assertEquals(admin.iss, API_KEY, "signed as Haven");
    assertEquals(
      [admin.video.roomAdmin, admin.video.room],
      [true, lounge],
      "with authority over that room only",
    );
  });
});

test("muting your own session is only a message; nothing is enforced", async () => {
  await withVoice(twirpOk, async (liveKit) => {
    const memberA = await actor("member_a");
    const response = await voiceControl(
      ask(memberA, {
        channelId: await channelId("Lounge"),
        userId: memberA.id,
        sessionId: "session-1",
        action: "mute",
      }),
    );
    assertEquals(
      [response.status, await response.json()],
      [200, { ok: true, enforced: null }],
      "it goes through",
    );
    assertEquals(liveKit.requests.length, 0, "without the voice service");

    const bad = await voiceControl(
      ask(memberA, {
        channelId: await channelId("Lounge"),
        userId: memberA.id,
        sessionId: "session-1",
        action: "explode",
      }),
    );
    assertEquals(bad.status, 400, "an unknown action is refused");
  });
});

test("the app is told when the voice service could not enforce a removal", async () => {
  const owner = await actor("owner");
  const memberA = await actor("member_a");
  const request = async () =>
    ask(owner, {
      channelId: await channelId("Lounge"),
      userId: memberA.id,
      sessionId: "session-1",
      action: "remove",
    });

  await withVoice(
    () =>
      Response.json(
        { code: "not_found", msg: "participant does not exist" },
        { status: 404 },
      ),
    async () => {
      assertEquals(
        (await (await voiceControl(await request())).json()).enforced,
        true,
        "someone who already left counts as removed",
      );
    },
  );
  await withVoice(
    () => Response.json({ code: "internal", msg: "down" }, { status: 500 }),
    async () => {
      const response = await voiceControl(await request());
      assertEquals(
        [response.status, (await response.json()).enforced],
        [200, false],
        "a voice service that is down is reported as not enforced",
      );
    },
  );
});
