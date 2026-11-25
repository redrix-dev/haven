// Sends a notification to the person's phones through Expo's push service.
//
// The words and the data come from the notification row (worker_push_delivery),
// so the phone says exactly what the inbox says. The worker adds only what
// Expo needs: the sound, the priority and the Android channel.

import { call, type Db, env } from "../_shared/common.ts";
import {
  type Job,
  type JobHandler,
  jobWorker,
  payloadText,
} from "../_shared/jobs.ts";

type Delivery = {
  token: string;
  platform: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
};

type ExpoTicket = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function expoMessage(delivery: Delivery) {
  return {
    to: delivery.token,
    title: delivery.title,
    body: delivery.body,
    data: delivery.data ?? {},
    // The person's own choice (notification preferences), decided in the row.
    ...(delivery.data?.sound === false ? {} : { sound: "default" }),
    priority: "high",
    ...(delivery.platform === "android" ? { channelId: "default" } : {}),
  };
}

export const sendPush: JobHandler = async (db: Db, job: Job) => {
  const deliveries =
    (await call<Delivery[] | null>(db, "worker_push_delivery", {
      p_notification_id: payloadText(job, "notification_id"),
    })) ?? [];
  // Already read, dismissed, or the person has no phone any more.
  if (deliveries.length === 0) return;

  const accessToken = env("EXPO_ACCESS_TOKEN");
  const response = await fetch(env("EXPO_PUSH_URL") ?? EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(deliveries.map(expoMessage)),
  });
  const answer = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Expo answered ${response.status}: ${JSON.stringify(answer).slice(0, 300)}`,
    );
  }

  // One ticket per message, in the order sent.
  const tickets: ExpoTicket[] = Array.isArray(answer?.data) ? answer.data : [];
  let reached = 0;
  const problems: string[] = [];
  for (const [index, delivery] of deliveries.entries()) {
    const ticket = tickets[index] ?? {};
    if (ticket.status === "ok") {
      reached += 1;
    } else if (ticket.details?.error === "DeviceNotRegistered") {
      // The app was removed from that phone. Forget the token.
      await call(db, "worker_push_token_invalid", { p_token: delivery.token });
    } else {
      problems.push(ticket.details?.error ?? ticket.message ?? "no ticket");
    }
  }
  // Retrying would send again to the phones that did get it, so only a
  // notification that reached nobody is tried again.
  if (problems.length > 0) {
    const summary = `Expo refused ${problems.length} of ${deliveries.length}: ${problems.join(", ")}`;
    if (reached === 0) throw new Error(summary);
    console.error(`[push_send] job ${job.id}: ${summary}`);
  }
};

export const handle = jobWorker({ push_send: sendPush });
