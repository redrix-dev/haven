/**
 * Haven's single link model. Every link a person can open — a shared invite, a
 * push notification tap, an auth email, a pasted invite code — parses to one
 * `HavenLinkIntent`, and every link Haven hands out is built from one.
 *
 * Parsing is done with plain string handling rather than `new URL()`. Custom
 * schemes (`haven://…`) parse differently across Node, Chromium, WebKit and
 * Hermes, and mobile ships no URL polyfill; string handling behaves the same on
 * all of them.
 */

/** The web app's canonical origin. Every public link Haven builds points here. */
export const HAVEN_APP_ORIGIN = "https://haven.redrixx.com";

/** Retired auth landing host (the marketing site). Accepted for `/auth/confirm` only. */
const LEGACY_AUTH_HOSTS: ReadonlySet<string> = new Set([
  "projects.haven.redrixx.com",
]);

const AUTH_CONFIRM_CLIENTS = ["web", "desktop", "ios"] as const;

/** Which client asked for an auth email; named in the confirm path. */
export type AuthConfirmClient = (typeof AUTH_CONFIRM_CLIENTS)[number];

export type FriendsTab = "friends" | "requests";

/** Invite codes are 10 uppercase hex characters (see `create_community_invite`). */
const BARE_INVITE_CODE = /^[0-9a-f]{10}$/i;

export type HavenLinkIntent =
  | { kind: "home" }
  | { kind: "invite"; code: string }
  | { kind: "community"; communityId: string }
  | { kind: "channel"; communityId: string; channelId: string }
  | { kind: "dm"; conversationId: string }
  /** `requestId` is only meaningful on the `requests` tab. */
  | { kind: "friends"; tab: FriendsTab; requestId: string | null }
  | { kind: "notifications" }
  | {
      kind: "auth_confirm";
      client: AuthConfirmClient | null;
      /** Query then hash params; the first value for a key wins. */
      params: Record<string, string>;
    }
  | { kind: "unsupported"; input: string };

export type BuildableHavenLinkIntent = Exclude<
  HavenLinkIntent,
  { kind: "unsupported" }
>;

export type ParseHavenLinkOptions = {
  /**
   * Extra origins to treat as the app — e.g. the web app passes its own origin
   * so preview and local-dev links resolve. The canonical origin is always
   * included.
   */
  appOrigins?: readonly string[];
};

type LinkParts = { path: string; query: string; hash: string };

type Params = Record<string, string>;

const splitLink = (rest: string): LinkParts => {
  const hashAt = rest.indexOf("#");
  const beforeHash = hashAt >= 0 ? rest.slice(0, hashAt) : rest;
  const queryAt = beforeHash.indexOf("?");
  return {
    path: queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash,
    query: queryAt >= 0 ? beforeHash.slice(queryAt + 1) : "",
    hash: hashAt >= 0 ? rest.slice(hashAt + 1) : "",
  };
};

/** Throws `URIError` on malformed escapes; `parseHavenLink` treats that as unsupported. */
const decodeQueryComponent = (value: string): string =>
  decodeURIComponent(value.replace(/\+/g, " "));

const readParams = (encoded: string, into: Params): void => {
  for (const pair of encoded.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = decodeQueryComponent(eq >= 0 ? pair.slice(0, eq) : pair);
    const value = eq >= 0 ? decodeQueryComponent(pair.slice(eq + 1)) : "";
    if (key && !(key in into)) into[key] = value;
  }
};

/** Query first, then hash (`#a=1` or `#?a=1`); the first value for a key wins. */
const mergeParams = (query: string, hash: string): Params => {
  // Null prototype: a `__proto__` or `constructor` key can't collide with Object.prototype.
  const params = Object.create(null) as Params;
  readParams(query, params);
  readParams(hash.startsWith("?") ? hash.slice(1) : hash, params);
  return params;
};

const param = (
  params: Readonly<Record<string, string | undefined>>,
  key: string,
): string | null => {
  const value = params[key]?.trim();
  return value ? value : null;
};

const toSegments = (path: string): string[] =>
  path
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

/**
 * The query-style links `expo-push-worker` puts in push `data.url`
 * (`/?kind=dm_message&conversationId=…`). Returns null for an unknown kind.
 */
const fromNotificationQuery = (params: Params): HavenLinkIntent | null => {
  switch (param(params, "kind")?.toLowerCase()) {
    case "dm_message": {
      const conversationId = param(params, "conversationId");
      return conversationId
        ? { kind: "dm", conversationId }
        : { kind: "notifications" };
    }
    case "friend_request_received":
      return {
        kind: "friends",
        tab: "requests",
        requestId: param(params, "friendRequestId"),
      };
    case "friend_request_accepted":
      return { kind: "friends", tab: "friends", requestId: null };
    case "channel_mention": {
      const communityId = param(params, "communityId");
      const channelId = param(params, "channelId");
      return communityId && channelId
        ? { kind: "channel", communityId, channelId }
        : { kind: "notifications" };
    }
    case "system":
      return { kind: "notifications" };
    default:
      return null;
  }
};

const routeLink = ({
  path,
  query,
  hash,
}: LinkParts): HavenLinkIntent | null => {
  const segments = toSegments(path);
  const params = mergeParams(query, hash);
  const first: string | undefined = segments[0];
  const second: string | undefined = segments[1];
  const third: string | undefined = segments[2];
  const fourth: string | undefined = segments[3];

  if (first === undefined) {
    return param(params, "kind")
      ? fromNotificationQuery(params)
      : { kind: "home" };
  }

  switch (first.toLowerCase()) {
    case "invite": {
      if (segments.length > 2) return null;
      const code =
        second?.trim() || param(params, "code") || param(params, "invite");
      return code ? { kind: "invite", code: code.toUpperCase() } : null;
    }
    case "community":
      if (second !== undefined && segments.length === 2) {
        return { kind: "community", communityId: second };
      }
      if (
        second !== undefined &&
        third?.toLowerCase() === "channel" &&
        fourth !== undefined &&
        segments.length === 4
      ) {
        return { kind: "channel", communityId: second, channelId: fourth };
      }
      return null;
    case "direct-messages":
      return second !== undefined && segments.length === 2
        ? { kind: "dm", conversationId: second }
        : null;
    case "friends": {
      if (segments.length !== 1) return null;
      const tab: FriendsTab =
        param(params, "tab")?.toLowerCase() === "requests"
          ? "requests"
          : "friends";
      return {
        kind: "friends",
        tab,
        requestId: tab === "requests" ? param(params, "request") : null,
      };
    }
    case "notifications":
      return segments.length === 1 ? { kind: "notifications" } : null;
    case "auth": {
      if (second?.toLowerCase() !== "confirm" || segments.length > 3) {
        return null;
      }
      if (third === undefined) {
        return { kind: "auth_confirm", client: null, params };
      }
      const requested = third.toLowerCase();
      const client = AUTH_CONFIRM_CLIENTS.find((c) => c === requested);
      return client ? { kind: "auth_confirm", client, params } : null;
    }
    default:
      return null;
  }
};

const normalizeOrigin = (origin: string): string =>
  origin.trim().replace(/\/+$/, "").toLowerCase();

/**
 * Parse any link Haven may receive into an intent.
 *
 * Accepts `https://haven.redrixx.com/…` (plus `options.appOrigins`), `haven://…`
 * in any casing or slash count, app-relative paths (`/?kind=…` from push data),
 * a bare 10-character invite code, and the legacy marketing-site
 * `/auth/confirm`. Anything else — including other hosts, `http:` on the app
 * host, and malformed percent-encoding — is `unsupported`. Never throws.
 */
export function parseHavenLink(
  input: string,
  options: ParseHavenLinkOptions = {},
): HavenLinkIntent {
  const unsupported: HavenLinkIntent = { kind: "unsupported", input };
  const raw = input.trim();
  if (!raw) return unsupported;

  if (BARE_INVITE_CODE.test(raw)) {
    return { kind: "invite", code: raw.toUpperCase() };
  }

  try {
    const scheme = /^haven:/i.exec(raw);
    if (scheme) {
      return routeLink(splitLink(raw.slice(scheme[0].length))) ?? unsupported;
    }

    // App-relative, e.g. expo-push-worker's `/?kind=…`. `//host/…` is not.
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return routeLink(splitLink(raw)) ?? unsupported;
    }

    const web = /^(https?):\/\/([^/?#]*)(.*)$/i.exec(raw);
    if (!web) return unsupported;
    const [, protocol, host, rest] = web;
    const origin = `${protocol}://${host}`.toLowerCase();
    const parts = splitLink(rest);

    const appOrigins = new Set(
      [HAVEN_APP_ORIGIN, ...(options.appOrigins ?? [])].map(normalizeOrigin),
    );
    if (appOrigins.has(origin)) {
      return routeLink(parts) ?? unsupported;
    }

    if (
      protocol.toLowerCase() === "https" &&
      LEGACY_AUTH_HOSTS.has(host.toLowerCase())
    ) {
      const intent = routeLink(parts);
      return intent?.kind === "auth_confirm" && intent.client === null
        ? intent
        : unsupported;
    }

    return unsupported;
  } catch {
    return unsupported;
  }
}

const encodeQuery = (entries: ReadonlyArray<readonly [string, string]>) =>
  entries
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

/** Build the canonical https link for an intent. `parseHavenLink` round-trips it. */
export function buildHavenLink(
  intent: BuildableHavenLinkIntent,
  origin: string = HAVEN_APP_ORIGIN,
): string {
  const base = origin.trim().replace(/\/+$/, "");
  const segment = encodeURIComponent;

  switch (intent.kind) {
    case "home":
      return `${base}/`;
    case "invite":
      return `${base}/invite/${segment(intent.code)}`;
    case "community":
      return `${base}/community/${segment(intent.communityId)}`;
    case "channel":
      return `${base}/community/${segment(intent.communityId)}/channel/${segment(intent.channelId)}`;
    case "dm":
      return `${base}/direct-messages/${segment(intent.conversationId)}`;
    case "friends": {
      if (intent.tab === "friends") return `${base}/friends`;
      const query: Array<[string, string]> = [["tab", "requests"]];
      if (intent.requestId) query.push(["request", intent.requestId]);
      return `${base}/friends?${encodeQuery(query)}`;
    }
    case "notifications":
      return `${base}/notifications`;
    case "auth_confirm": {
      const path = intent.client
        ? `/auth/confirm/${intent.client}`
        : "/auth/confirm";
      const query = encodeQuery(Object.entries(intent.params));
      return `${base}${path}${query ? `?${query}` : ""}`;
    }
  }
}
