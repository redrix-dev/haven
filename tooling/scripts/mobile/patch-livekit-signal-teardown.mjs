import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Temporary compatibility patch for livekit-client 2.23.0. See HAV-7 and
// https://github.com/livekit/client-sdk-js/pull/2192 (expected-close logging)
// https://github.com/livekit/client-sdk-js/pull/2239 (post-close ping timer).
// Patch both shipped entry points: Metro can resolve the minified UMD build.
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const sdk = path.join(root, "apps/mobile/node_modules/livekit-client");
const version = JSON.parse(
  fs.readFileSync(path.join(sdk, "package.json"), "utf8"),
).version;
if (version !== "2.23.0") {
  throw new Error(
    `Review/remove the HAV-7 signal patch for livekit-client ${version}; expected 2.23.0.`,
  );
}

function replaceOnce(text, before, after, marker) {
  if (text.includes(marker)) {
    if (!text.includes(after))
      throw new Error(`Incomplete LiveKit patch: ${marker}`);
    return text;
  }
  if (text.split(before).length !== 2)
    throw new Error(`LiveKit patch target changed: ${marker}`);
  return text.replace(before, after);
}

const edits = [];
for (const [file, kind] of [
  ["src/api/SignalClient.ts", "source"],
  ["src/room/RTCEngine.ts", "engine"],
  ["dist/livekit-client.esm.mjs", "esm"],
  ["dist/livekit-client.umd.js", "umd"],
]) {
  const target = path.join(sdk, file);
  let text = fs.readFileSync(target, "utf8");
  if (kind === "umd") {
    text = replaceOnce(
      text,
      'catch(n){this.log.error("error reading from signal stream",{error:n}),yield this.handleOnClose("error in reading loop",t);break}',
      'catch(n){/* HAV-7 signal-read */if(t!==this.attemptId||"disconnecting"===this.lifecycleState||"closed"===this.lifecycleState){this.log.debug("signal stream ended after close",{error:n});break}this.log.error("error reading from signal stream",{error:n}),yield this.handleOnClose("error in reading loop",t);break}',
      "HAV-7 signal-read",
    );
    text = replaceOnce(
      text,
      "this.cleanupLossyDataStats(),yield this.cleanupPeerConnections(),yield this.cleanupClient(t)",
      "this.cleanupLossyDataStats();/* HAV-7 signal-first */try{yield this.cleanupClient(t)}finally{yield this.cleanupPeerConnections()}",
      "HAV-7 signal-first",
    );
    text = replaceOnce(
      text,
      "resetPingTimeout(){this.clearPingTimeout(),this.pingTimeoutDuration?",
      "resetPingTimeout(){/* HAV-7 ping-stop */this.clearPingTimeout();if(this.isDisconnected)return;this.pingTimeoutDuration?",
      "HAV-7 ping-stop",
    );
  } else {
    if (kind !== "engine") {
      const original =
        kind === "source"
          ? "        this.log.error(`error reading from signal stream`, { error: e });"
          : '          this.log.error("error reading from signal stream", {';
      const indent = kind === "source" ? "        " : "          ";
      const guard = `${indent}/* HAV-7 signal-read */\n${indent}if (attemptId !== this.attemptId || this.lifecycleState === 'disconnecting' || this.lifecycleState === 'closed') {\n${indent}  this.log.debug('signal stream ended after close', { error: e });\n${indent}  break;\n${indent}}\n${original}`;
      text = replaceOnce(text, original, guard, "HAV-7 signal-read");
      const before =
        "    this.clearPingTimeout();\n    if (!this.pingTimeoutDuration)";
      text = replaceOnce(
        text,
        before,
        "    this.clearPingTimeout();\n    /* HAV-7 ping-stop */\n    if (this.isDisconnected) return;\n    if (!this.pingTimeoutDuration)",
        "HAV-7 ping-stop",
      );
    }
    if (kind !== "source") {
      const indent = kind === "engine" ? "      " : "        ";
      const wait = kind === "engine" ? "await" : "yield";
      const before = `${indent}this.cleanupLossyDataStats();\n${indent}${wait} this.cleanupPeerConnections();\n${indent}${wait} this.cleanupClient(reason);`;
      const after = `${indent}this.cleanupLossyDataStats();\n${indent}/* HAV-7 signal-first */\n${indent}try {\n${indent}  ${wait} this.cleanupClient(reason);\n${indent}} finally {\n${indent}  ${wait} this.cleanupPeerConnections();\n${indent}}`;
      text = replaceOnce(text, before, after, "HAV-7 signal-first");
    }
  }
  edits.push([target, text]);
}
// Validate all targets before writing any of them.
for (const [file, text] of edits) fs.writeFileSync(file, text);
console.log(
  "[mobile:patch-livekit] Applied/verified HAV-7 signal teardown patch (2.23.0; source, ESM, UMD).",
);
