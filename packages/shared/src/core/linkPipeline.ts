import type { NexusPersistence } from "./persistence/NexusPersistence";
import { NEXUS_STORAGE_KEYS } from "./persistence/nexusStorageKeys";
import {
  parseHavenLink,
  type HavenLinkIntent,
  type ParseHavenLinkOptions,
} from "@shared/features/links";

/**
 * One pipeline for every incoming link, on every platform.
 *
 * Platforms feed raw URLs in (`receive`), report the session (`setSession`),
 * and handle the actions that come out (`setHandler`). The pipeline decides
 * everything in between: parse, drop duplicate deliveries, hold links until
 * the session is known, remember destinations clicked while signed out, and
 * open them once after sign-in or sign-up.
 *
 * It never joins, redeems, or signs anyone in itself — it only says what should
 * happen next. That keeps the side effects (and their server errors) in the
 * screens that own them.
 */

/** How long a link clicked while signed out is remembered (checklist D8). */
export const PENDING_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Identical deliveries inside this window are one click reaching the app by two paths. */
export const LINK_DEDUPE_WINDOW_MS = 5000;

type IntentOf<K extends HavenLinkIntent["kind"]> = Extract<
  HavenLinkIntent,
  { kind: K }
>;

/** Destinations that need a signed-in session. */
export type SessionLinkIntent = Exclude<
  HavenLinkIntent,
  { kind: "home" | "auth_confirm" | "unsupported" }
>;

export type LinkAction =
  /** Navigate there now. For an invite, that is the pre-filled invite screen — never a join. */
  | { type: "open"; intent: SessionLinkIntent | IntentOf<"home"> }
  /** Signed out: remembered, and opened after sign-in or sign-up. */
  | { type: "deferred"; intent: SessionLinkIntent }
  /** Exchange the auth link for a session. */
  | { type: "confirm_auth"; intent: IntentOf<"auth_confirm"> }
  /** An auth link arrived while someone is signed in — ask; never swap accounts silently. */
  | {
      type: "confirm_auth_while_signed_in";
      intent: IntentOf<"auth_confirm">;
      signedInUserId: string;
    }
  /** Nothing in this build can open it — e.g. "update Haven to open this link". */
  | { type: "unsupported"; input: string };

/**
 * `initial` — the link that launched the app (`getCurrent()`, `getInitialURL()`).
 * Those APIs keep returning the same URL, so an initial link runs at most once
 * per process. `event` — a link delivered while running.
 */
export type LinkSource = "initial" | "event";

export type LinkPipelineOptions = {
  persistence: NexusPersistence;
  now?: () => number;
  parse?: ParseHavenLinkOptions;
  pendingTtlMs?: number;
  dedupeWindowMs?: number;
};

export interface LinkPipeline {
  /** Feed a raw link from any delivery path. */
  receive(input: string, source?: LinkSource): void;
  /**
   * Report the resolved session; `null` means signed out. Links received
   * before the first call are held until it. Signing in opens a remembered
   * link exactly once.
   */
  setSession(userId: string | null): void;
  /** Attach the platform's handler. Actions produced before it attaches are delivered on attach, in order. */
  setHandler(handler: ((action: LinkAction) => void) | null): void;
  /**
   * Whether the most recent sign-in opened a link — one remembered from before
   * it, or one that arrived while the session loaded. Screens that send
   * someone home after signing in check this first: navigation is
   * last-call-wins, and their `navigate("/")` would replace the link.
   */
  openedLinkOnSignIn(): boolean;
}

type SessionState =
  | { status: "unknown" }
  | { status: "signed_out" }
  | { status: "signed_in"; userId: string };

type StoredPendingLink = { v: 1; input: string; storedAt: number };

const isStoredPendingLink = (value: unknown): value is StoredPendingLink => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.v === 1 &&
    typeof record.input === "string" &&
    typeof record.storedAt === "number" &&
    Number.isFinite(record.storedAt)
  );
};

export function createLinkPipeline(options: LinkPipelineOptions): LinkPipeline {
  const {
    persistence,
    now = Date.now,
    parse,
    pendingTtlMs = PENDING_LINK_TTL_MS,
    dedupeWindowMs = LINK_DEDUPE_WINDOW_MS,
  } = options;
  const pendingKey = NEXUS_STORAGE_KEYS.pendingLink;

  let session: SessionState = { status: "unknown" };
  let handler: ((action: LinkAction) => void) | null = null;
  let openedOnSignIn = false;
  const outbox: LinkAction[] = [];
  const heldUntilSessionKnown: string[] = [];
  const handledAt = new Map<string, number>();

  const emit = (action: LinkAction) => {
    if (handler) handler(action);
    else outbox.push(action);
  };

  const isDuplicate = (key: string, source: LinkSource): boolean => {
    const last = handledAt.get(key);
    if (last === undefined) return false;
    if (source === "initial") return true;
    return now() - last < dedupeWindowMs;
  };

  const remember = (input: string) => {
    const record: StoredPendingLink = { v: 1, input, storedAt: now() };
    persistence.set(pendingKey, JSON.stringify(record));
  };

  /** Read-once: removed before it runs, so a remembered link can never open twice. */
  const takePending = (): string | null => {
    const raw = persistence.getString(pendingKey);
    if (raw === null) return null;
    persistence.remove(pendingKey);
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isStoredPendingLink(parsed)) return null;
      return now() - parsed.storedAt < pendingTtlMs ? parsed.input : null;
    } catch {
      return null;
    }
  };

  const decide = (input: string): LinkAction => {
    const intent = parseHavenLink(input, parse);
    switch (intent.kind) {
      case "unsupported":
        return { type: "unsupported", input: intent.input };
      case "home":
        return { type: "open", intent };
      case "auth_confirm":
        return session.status === "signed_in"
          ? {
              type: "confirm_auth_while_signed_in",
              intent,
              signedInUserId: session.userId,
            }
          : { type: "confirm_auth", intent };
      default:
        return session.status === "signed_in"
          ? { type: "open", intent }
          : { type: "deferred", intent };
    }
  };

  /** Decide, remember a deferred destination, emit. Returns what was emitted. */
  const route = (input: string): LinkAction["type"] => {
    const action = decide(input);
    if (action.type === "deferred") remember(input);
    emit(action);
    return action.type;
  };

  return {
    receive(input, source = "event") {
      const key = input.trim();
      if (!key || isDuplicate(key, source)) return;
      handledAt.set(key, now());
      if (session.status === "unknown") {
        heldUntilSessionKnown.push(key);
        return;
      }
      route(key);
    },

    setSession(userId) {
      const previousUserId =
        session.status === "signed_in" ? session.userId : null;
      session = userId
        ? { status: "signed_in", userId }
        : { status: "signed_out" };
      const isNewSignIn = userId !== null && userId !== previousUserId;
      if (isNewSignIn) openedOnSignIn = false;

      // A link remembered earlier opens before any that arrived during boot,
      // so the newest link is where the person ends up.
      if (isNewSignIn) {
        const pending = takePending();
        if (pending && route(pending) === "open") openedOnSignIn = true;
      }
      for (const key of heldUntilSessionKnown.splice(0)) {
        if (route(key) === "open" && isNewSignIn) openedOnSignIn = true;
      }
    },

    setHandler(next) {
      handler = next;
      while (handler && outbox.length > 0) {
        const action = outbox.shift();
        if (action) handler(action);
      }
    },

    openedLinkOnSignIn() {
      return openedOnSignIn;
    },
  };
}
