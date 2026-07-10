// Zero-dependency LiveKit token minter (Node built-ins only) for standalone
// testing of haven-voice. In the real app the token comes from the voice-token
// edge function; this is just so you can `cargo run` the sidecar by hand.
//
//   export LIVEKIT_TOKEN="$(LK_KEY=$LIVEKIT_API_KEY LK_SECRET=$LIVEKIT_API_SECRET node mint-token.mjs)"
//   (optional: LK_ROOM=test LK_IDENTITY=me)

import crypto from "node:crypto";

const key = process.env.LK_KEY;
const secret = process.env.LK_SECRET;
const room = process.env.LK_ROOM || "test";
const identity = process.env.LK_IDENTITY || "me";

if (!key || !secret) {
  console.error("set LK_KEY and LK_SECRET (your LiveKit API key/secret)");
  process.exit(1);
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const payload = {
  iss: key,
  sub: identity,
  name: identity,
  nbf: now,
  exp: now + 3600,
  video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
};
const signingInput = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
const signature = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
process.stdout.write(`${signingInput}.${signature}\n`);
