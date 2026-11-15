// Works out what a link looks like: a title, a description, a picture, and
// for YouTube and Vimeo the id the app needs to play the video in place.
//
// Everything that touches the network goes through `Network`, so the tests can
// stand in a page without weakening the address rules, which run unchanged.

import { isIpLiteral, isPublicAddress } from "./address.ts";

export type Network = {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Every address a host name points at. Empty when it does not resolve. */
  resolve: (hostname: string) => Promise<string[]>;
};

export type Preview = {
  status: "ready" | "unsupported";
  title: string | null;
  description: string | null;
  siteName: string | null;
  /** The page's picture, still on its own site. */
  imageUrl: string | null;
  embedProvider: "youtube" | "vimeo" | null;
  embedId: string | null;
};

export type FetchedImage = { bytes: Uint8Array; mimeType: string };

/** This link will never have a preview. */
export class PreviewRefused extends Error {}
/** It did not work this time; it might later. */
export class PreviewUnavailable extends Error {}

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 512_000;
const MAX_IMAGE_BYTES = 5_000_000;
const TIMEOUT_MS = 10_000;
const USER_AGENT =
  "HavenLinkPreviewBot/1.0 (+https://github.com/redrix-dev/haven)";
// The same list the `previews` bucket accepts. No SVG: one served from
// Haven's own address could carry script.
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Refuses an address the worker must not fetch. Checked for the first address
 * and again for every redirect, because a public page can redirect to a
 * private one.
 */
export async function assertPublicUrl(
  net: Network,
  rawUrl: string,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PreviewRefused("not a web address");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PreviewRefused("not a web address");
  }
  // An empty port means the default for the protocol (80 or 443).
  if (url.port !== "") throw new PreviewRefused("unusual port");
  if (url.username !== "" || url.password !== "") {
    throw new PreviewRefused("address carries a login");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isIpLiteral(hostname)) {
    if (!isPublicAddress(hostname)) throw new PreviewRefused("private address");
    return url;
  }
  // A name with no dot only means something inside a private network.
  if (
    !hostname.includes(".") ||
    /\.(localhost|local|internal)$/.test(hostname)
  ) {
    throw new PreviewRefused("private address");
  }
  // The name can be public and still point inward, so look at where it leads.
  const addresses = await net.resolve(hostname);
  if (addresses.length === 0) {
    throw new PreviewUnavailable("address did not resolve");
  }
  if (!addresses.every(isPublicAddress)) {
    throw new PreviewRefused("private address");
  }
  return url;
}

async function guardedFetch(
  net: Network,
  rawUrl: string,
  accept: string,
): Promise<{ response: Response; url: string }> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertPublicUrl(net, current);
    let response: Response;
    try {
      response = await net.fetch(url.toString(), {
        method: "GET",
        // Redirects are followed here, one checked step at a time.
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept, "user-agent": USER_AGENT },
      });
    } catch (error) {
      throw new PreviewUnavailable(
        `fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new PreviewRefused("redirect to nowhere");
      current = new URL(location, url).toString();
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      throw new PreviewUnavailable(`site answered ${response.status}`);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new PreviewRefused(`site answered ${response.status}`);
    }
    return { response, url: url.toString() };
  }
  throw new PreviewRefused("too many redirects");
}

/** Reads at most `limit` bytes. `tooBig` says whether more was left unread. */
async function readUpTo(
  response: Response,
  limit: number,
): Promise<{ bytes: Uint8Array; tooBig: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(), tooBig: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let tooBig = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > limit) {
        chunks.push(value.subarray(0, limit - size));
        size = limit;
        tooBig = true;
        break;
      }
      chunks.push(value);
      size += value.byteLength;
    }
  } catch (error) {
    throw new PreviewUnavailable(
      `read failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, tooBig };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi,
    (whole, body: string) => {
      if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
      const code =
        body[1].toLowerCase() === "x"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    },
  );
}

/** One line of plain text, cut to length; null when nothing is left. */
function tidy(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const text = decodeEntities(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text.slice(0, max) : null;
}

/** The page's <meta> tags by name. The first of each name wins. */
export function readMetaTags(html: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes: Record<string, string> = {};
    for (const match of tag.matchAll(
      /([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    )) {
      attributes[match[1].toLowerCase()] =
        match[2] ?? match[3] ?? match[4] ?? "";
    }
    const name = (attributes.property ?? attributes.name ?? "").toLowerCase();
    if (name && attributes.content && !(name in found)) {
      found[name] = attributes.content;
    }
  }
  return found;
}

function absoluteUrl(
  candidate: string | undefined,
  base: string,
): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(decodeEntities(candidate.trim()), base);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function pagePreview(net: Network, rawUrl: string): Promise<Preview> {
  const nothing: Preview = {
    status: "unsupported",
    title: null,
    description: null,
    siteName: null,
    imageUrl: null,
    embedProvider: null,
    embedId: null,
  };
  const { response, url } = await guardedFetch(
    net,
    rawUrl,
    "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
  );
  const contentType = (
    response.headers.get("content-type") ?? ""
  ).toLowerCase();
  if (!contentType.includes("html")) {
    await response.body?.cancel();
    return nothing;
  }
  // The tags we want are in the page's head; the rest is not read.
  const { bytes } = await readUpTo(response, MAX_HTML_BYTES);
  const charset = /charset=([\w-]+)/.exec(contentType)?.[1] ?? "utf-8";
  let html: string;
  try {
    html = new TextDecoder(charset).decode(bytes);
  } catch {
    html = new TextDecoder().decode(bytes);
  }

  const meta = readMetaTags(html);
  const title =
    tidy(meta["og:title"] ?? meta["twitter:title"], 300) ??
    tidy(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1], 300);
  const description = tidy(
    meta["og:description"] ?? meta["twitter:description"] ?? meta.description,
    1000,
  );
  const imageUrl = absoluteUrl(
    meta["og:image:secure_url"] ?? meta["og:image"] ?? meta["twitter:image"],
    url,
  );
  if (!title && !description && !imageUrl) return nothing;
  return {
    status: "ready",
    title,
    description,
    siteName: tidy(meta["og:site_name"], 100),
    imageUrl,
    embedProvider: null,
    embedId: null,
  };
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const valid = (id: string | null | undefined) =>
    id && /^[\w-]{6,20}$/.test(id) ? id : null;
  if (host === "youtu.be") return valid(url.pathname.split("/")[1]);
  if (host !== "youtube.com") return null;
  if (url.pathname === "/watch") return valid(url.searchParams.get("v"));
  const [kind, id] = url.pathname.split("/").filter(Boolean);
  return kind === "embed" || kind === "shorts" ? valid(id) : null;
}

function vimeoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "vimeo.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.findLast((part) => /^\d{6,15}$/.test(part)) ?? null;
}

async function videoPreview(
  net: Network,
  provider: "youtube" | "vimeo",
  id: string,
  pageUrl: string,
): Promise<Preview> {
  const oembed =
    provider === "youtube"
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(pageUrl)}`
      : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(pageUrl)}`;
  const { response } = await guardedFetch(net, oembed, "application/json");
  const { bytes } = await readUpTo(response, MAX_HTML_BYTES);
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // Still a playable video; it just has no title.
  }
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    status: "ready",
    title: tidy(text(data.title), 300),
    description: tidy(text(data.description), 1000),
    siteName:
      tidy(text(data.provider_name), 100) ??
      (provider === "youtube" ? "YouTube" : "Vimeo"),
    imageUrl: absoluteUrl(text(data.thumbnail_url) ?? undefined, pageUrl),
    embedProvider: provider,
    embedId: id,
  };
}

export async function resolvePreview(
  net: Network,
  rawUrl: string,
): Promise<Preview> {
  const url = await assertPublicUrl(net, rawUrl);
  const youtube = youtubeId(url);
  if (youtube) return videoPreview(net, "youtube", youtube, url.toString());
  const vimeo = vimeoId(url);
  if (vimeo) return videoPreview(net, "vimeo", vimeo, url.toString());
  return pagePreview(net, rawUrl);
}

/** Fetches a preview picture, under the same address rules as the page. */
export async function fetchImage(
  net: Network,
  imageUrl: string,
): Promise<FetchedImage> {
  const { response } = await guardedFetch(
    net,
    imageUrl,
    "image/avif,image/webp,image/*;q=0.8",
  );
  const mimeType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!(mimeType in IMAGE_TYPES)) {
    await response.body?.cancel();
    throw new PreviewRefused("picture is not a kind Haven shows");
  }
  const { bytes, tooBig } = await readUpTo(response, MAX_IMAGE_BYTES);
  if (tooBig) throw new PreviewRefused("picture is too large");
  if (bytes.byteLength === 0) throw new PreviewRefused("picture is empty");
  return { bytes, mimeType };
}

/** Where a cached picture lives in the `previews` bucket: named by its content. */
export async function imagePath(image: FetchedImage): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    image.bytes as BufferSource,
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex}.${IMAGE_TYPES[image.mimeType]}`;
}
