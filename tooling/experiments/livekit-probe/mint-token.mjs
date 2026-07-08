// Zero-dependency LiveKit token minter (Node built-ins only — no npm install).
// A LiveKit join token is just an HS256 JWT with a `video` grant claim.
//
// Usage:
//   LK_KEY=<api key> LK_SECRET=<api secret> node mint-token.mjs
//   (optional: LK_ROOM=probe LK_IDENTITY=probe)
//
// Where to get LK_KEY / LK_SECRET / the wss URL:
//   LiveKit Cloud dashboard → your project → Settings → Keys.
//   (Same values as the Supabase secrets LIVEKIT_API_KEY / LIVEKIT_API_SECRET /
//    LIVEKIT_URL that the voice-token edge function uses.)
//
// Then:
//   export LIVEKIT_URL="wss://<host>"
//   export LIVEKIT_TOKEN="$(LK_KEY=... LK_SECRET=... node mint-token.mjs)"
//   cargo run

import crypto from "node:crypto";

const key = process.env.LK_KEY;
const secret = process.env.LK_SECRET;
const room = process.env.LK_ROOM || "probe";
const identity = process.env.LK_IDENTITY || "probe";

if (!key || !secret) {
  console.error("set LK_KEY and LK_SECRET (from the LiveKit Cloud dashboard → Keys)");
  process.exit(1);
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const now = Math.floor(Date.now() / 1000);

const header = { alg: "HS256", typ: "JWT" };
const payload = {
  iss: key, // api key
  sub: identity, // participant identity
  name: identity,
  nbf: now,
  exp: now + 3600, // 1h
  video: {
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  },
};

const signingInput = `${b64(header)}.${b64(payload)}`;
const signature = crypto
  .createHmac("sha256", secret)
  .update(signingInput)
  .digest("base64url");

// Print ONLY the token so it's safe to capture with $(...).
process.stdout.write(`${signingInput}.${signature}\n`);
