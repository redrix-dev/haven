// The push worker: what it sends to Expo for a real notification row, and what
// it does with Expo's answers. Expo is stood in for by a local server.

import { handle } from "../push-worker/handler.ts";
import {
  actor,
  assert,
  assertEquals,
  type Captured,
  channelId,
  fakeService,
  jobFor,
  quietQueue,
  random,
  rpc,
  sql,
  test,
  wake,
} from "./_support.ts";

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound?: string;
  priority?: string;
  channelId?: string;
};

type Notification = { id: string; title: string; body: string };

const TOKEN_PREFIX = "ExponentPushToken[fn-test-";

/** member_a mentions member_b in #general; returns member_b's notification. */
async function mention(): Promise<Notification> {
  const memberA = await actor("member_a");
  const memberB = await actor("member_b");
  const message = await rpc<{ id: string }>(memberA, "send_message", {
    p_channel_id: await channelId("general"),
    p_body: `@rls_member_b look at this ${random()}`,
  });
  const [row] = await sql<Notification[]>`
    select id, title, body from public.notifications
    where recipient_id = ${memberB.id} and message_id = ${message.id}`;
  assert(row, "a mention makes a notification");
  return row;
}

async function withPhones(
  run: (tokens: { ios: string; android: string }) => Promise<void>,
): Promise<void> {
  await quietQueue();
  const memberB = await actor("member_b");
  const tokens = {
    ios: `${TOKEN_PREFIX}ios-${random()}]`,
    android: `${TOKEN_PREFIX}android-${random()}]`,
  };
  await sql`delete from public.push_devices where token like ${TOKEN_PREFIX + "%"}`;
  await rpc(memberB, "register_push_device", {
    p_token: tokens.ios,
    p_platform: "ios",
    p_installation_id: `fn-test-ios`,
  });
  await rpc(memberB, "register_push_device", {
    p_token: tokens.android,
    p_platform: "android",
    p_installation_id: `fn-test-android`,
  });
  try {
    await run(tokens);
  } finally {
    Deno.env.delete("EXPO_PUSH_URL");
    Deno.env.delete("EXPO_ACCESS_TOKEN");
    await rpc(memberB, "set_notification_preference", {
      p_kind: "mention",
      p_in_app: true,
      p_sound: true,
      p_push: true,
    });
    await sql`delete from public.push_devices where token like ${TOKEN_PREFIX + "%"}`;
  }
}

const sentMessages = (request: Captured) => request.json as ExpoMessage[];
const ticketsFor = (
  request: Captured,
  ticket: (message: ExpoMessage) => unknown,
) => Response.json({ data: sentMessages(request).map(ticket) });

test("a notification is sent to each phone in the row's own words", async () => {
  await withPhones(async (tokens) => {
    const expo = fakeService((request) =>
      ticketsFor(request, () => ({ status: "ok", id: random() })),
    );
    Deno.env.set("EXPO_PUSH_URL", `${expo.url}/push/send`);
    Deno.env.set("EXPO_ACCESS_TOKEN", "expo-test-token");
    try {
      const notification = await mention();
      assertEquals((await handle(wake())).status, 200, "the worker runs");

      assertEquals(expo.requests.length, 1, "one request to Expo");
      const [request] = expo.requests;
      assertEquals(request.path, "/push/send", "to the configured address");
      assertEquals(
        request.headers.get("authorization"),
        "Bearer expo-test-token",
        "with the Expo access token",
      );
      const messages = sentMessages(request);
      assertEquals(messages.length, 2, "one message per phone");
      const ios = messages.find((message) => message.to === tokens.ios);
      const android = messages.find((message) => message.to === tokens.android);
      assert(ios && android, "addressed to both tokens");
      assertEquals(
        [ios.title, ios.body],
        [notification.title, notification.body],
        "the words are the notification's",
      );
      assertEquals(
        ios.data.notification_id,
        notification.id,
        "it says which one",
      );
      assertEquals(ios.data.kind, "mention", "and what kind");
      assertEquals(ios.sound, "default", "it makes a sound");
      assertEquals(ios.priority, "high", "and is delivered at once");
      assertEquals(ios.channelId, undefined, "iOS has no Android channel");
      assertEquals(android.channelId, "default", "Android gets its channel");

      const job = await jobFor("push_send", "notification_id", notification.id);
      assertEquals(job?.status, "done", "the job is finished");
    } finally {
      await expo.close();
    }
  });
});

test("a phone the app was removed from is forgotten; the others still get it", async () => {
  await withPhones(async (tokens) => {
    const expo = fakeService((request) =>
      ticketsFor(request, (message) =>
        message.to === tokens.android
          ? {
              status: "error",
              message: "not a registered push notification recipient",
              details: { error: "DeviceNotRegistered" },
            }
          : { status: "ok", id: random() },
      ),
    );
    Deno.env.set("EXPO_PUSH_URL", expo.url);
    try {
      const notification = await mention();
      await handle(wake());
      const left = await sql`
        select token from public.push_devices where token like ${TOKEN_PREFIX + "%"}`;
      assertEquals(
        left.map((row) => row.token),
        [tokens.ios],
        "only the dead token is removed",
      );
      assertEquals(
        expo.requests[0].headers.get("authorization"),
        null,
        "no access token configured, none sent",
      );
      const job = await jobFor("push_send", "notification_id", notification.id);
      assertEquals(job?.status, "done", "the job is finished, not retried");
    } finally {
      await expo.close();
    }
  });
});

test("a notification already read is not pushed", async () => {
  await withPhones(async () => {
    const expo = fakeService((request) =>
      ticketsFor(request, () => ({ status: "ok" })),
    );
    Deno.env.set("EXPO_PUSH_URL", expo.url);
    try {
      const notification = await mention();
      await rpc(await actor("member_b"), "mark_notifications", {
        p_mark: "read",
        p_ids: [notification.id],
      });
      await handle(wake());
      assertEquals(expo.requests.length, 0, "nothing is sent");
      const job = await jobFor("push_send", "notification_id", notification.id);
      assertEquals(job?.status, "done", "and the job is closed");
    } finally {
      await expo.close();
    }
  });
});

test("someone who turned the sound off gets a silent push", async () => {
  await withPhones(async () => {
    const expo = fakeService((request) =>
      ticketsFor(request, () => ({ status: "ok" })),
    );
    Deno.env.set("EXPO_PUSH_URL", expo.url);
    try {
      await rpc(await actor("member_b"), "set_notification_preference", {
        p_kind: "mention",
        p_in_app: true,
        p_sound: false,
        p_push: true,
      });
      await mention();
      await handle(wake());
      const messages = sentMessages(expo.requests[0]);
      assertEquals(messages.length, 2, "it is still pushed");
      assert(
        messages.every((message) => !("sound" in message)),
        "but without a sound",
      );
    } finally {
      await expo.close();
    }
  });
});

test("when Expo is down the notification is tried again later", async () => {
  await withPhones(async (tokens) => {
    const expo = fakeService(
      () => new Response('{"errors":[{"message":"down"}]}', { status: 503 }),
    );
    Deno.env.set("EXPO_PUSH_URL", expo.url);
    try {
      const notification = await mention();
      const totals = await (await handle(wake())).json();
      assertEquals(totals.failed, 1, "the run reports the failure");
      const job = await jobFor("push_send", "notification_id", notification.id);
      assertEquals(job?.status, "pending", "the job waits to be retried");
      assert(job?.last_error?.includes("503"), "with the reason kept");
      const devices = await sql`
        select 1 from public.push_devices where token in ${sql([tokens.ios, tokens.android])}`;
      assertEquals(
        devices.length,
        2,
        "no phone is forgotten because Expo was down",
      );
    } finally {
      await expo.close();
    }
  });
});

test("a push Expo refuses for every phone is retried, not dropped", async () => {
  await withPhones(async () => {
    const expo = fakeService((request) =>
      ticketsFor(request, () => ({
        status: "error",
        message: "credentials",
        details: { error: "InvalidCredentials" },
      })),
    );
    Deno.env.set("EXPO_PUSH_URL", expo.url);
    try {
      const notification = await mention();
      await handle(wake());
      const job = await jobFor("push_send", "notification_id", notification.id);
      assertEquals(job?.status, "pending", "it waits to be retried");
      assert(
        job?.last_error?.includes("InvalidCredentials"),
        "and says what Expo said",
      );
    } finally {
      await expo.close();
    }
  });
});
