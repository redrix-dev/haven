import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type PreviewStatus = 'ready' | 'unsupported';
export type EmbedProvider = 'none' | 'youtube' | 'vimeo';

export type PreviewEmbed = {
  provider: 'youtube' | 'vimeo';
  embedUrl: string;
  aspectRatio: number;
};

export type PreviewThumbnail = {
  sourceUrl: string;
  width: number | null;
  height: number | null;
  mimeType: string | null;
};

export type PreviewSnapshot = {
  sourceUrl: string;
  normalizedUrl: string;
  finalUrl: string | null;
  title: string | null;
  description: string | null;
  siteName: string | null;
  canonicalUrl: string | null;
  thumbnail: {
    bucketName: string | null;
    objectPath: string | null;
    sourceUrl: string | null;
    width: number | null;
    height: number | null;
    mimeType: string | null;
  } | null;
  embed: PreviewEmbed | null;
};

export type ResolvedPreview = {
  status: PreviewStatus;
  normalizedUrl: string;
  finalUrl: string | null;
  embedProvider: EmbedProvider;
  snapshot: PreviewSnapshot;
  cachePayload: Record<string, unknown>;
  thumbnailSourceUrl: string | null;
};

const MAX_HTML_RESPONSE_BYTES = 1_000_000;
const MAX_IMAGE_BYTES = 5_000_000;
const FETCH_TIMEOUT_MS = 10_000;
const ALLOWED_PORTS = new Set(['', '80', '443']);

export class RetryablePreviewError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = 'RetryablePreviewError';
  }
}

export class PermanentPreviewError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = 'PermanentPreviewError';
  }
}

const htmlEntityMap: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const safeDecodeHtmlEntities = (value: string): string =>
  value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
    }
    if (entity.startsWith('#')) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
    }
    return htmlEntityMap[entity] ?? _match;
  });

export const extractFirstHttpUrl = (content: string | null | undefined): string | null => {
  if (!content) return null;
  const match = content.match(/https?:\/\/[^\s<>"'`]+/i);
  if (!match) return null;
  let url = match[0];
  while (/[.,!?;:]$/.test(url)) {
    url = url.slice(0, -1);
  }
  return url.length > 0 ? url : null;
};

export const normalizeUrl = (rawUrl: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new PermanentPreviewError('Invalid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new PermanentPreviewError('Unsupported URL protocol');
  }

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = '';
  if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
    parsed.port = '';
  }

  const preserved = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    if (/^utm_/i.test(key)) continue;
    preserved.append(key, value);
  }
  preserved.sort();
  parsed.search = preserved.toString();

  return parsed.toString();
};

const isPrivateIpv4 = (hostname: string): boolean => {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map((value) => Number.parseInt(value, 10));
  if (octets.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
};

const isBlockedHostname = (hostname: string): boolean => {
  const lower = hostname.toLowerCase();
  if (!lower) return true;
  if (lower === 'localhost') return true;
  if (lower.endsWith('.localhost') || lower.endsWith('.local')) return true;
  if (lower === '::1' || lower === '[::1]') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (isPrivateIpv4(lower)) return true;
  return false;
};

export const assertSafeFetchUrl = (value: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PermanentPreviewError('Invalid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new PermanentPreviewError('Unsupported URL protocol');
  }

  if (!ALLOWED_PORTS.has(parsed.port)) {
    throw new PermanentPreviewError('Unsupported URL port');
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new PermanentPreviewError('Blocked URL host');
  }

  return parsed;
};

const fetchWithTimeout = async (input: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'HavenLinkPreviewBot/1.0 (+https://github.com/redrix-dev/haven)',
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RetryablePreviewError('Preview fetch timed out');
    }
    throw new RetryablePreviewError(`Preview fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeoutId);
  }
};

const ensureSuccessfulResponse = async (response: Response, context: string) => {
  if (response.ok) return;
  if (response.status >= 500 || response.status === 429) {
    throw new RetryablePreviewError(`${context} returned ${response.status}`);
  }
  throw new PermanentPreviewError(`${context} returned ${response.status}`);
};

const getHeaderNumber = (response: Response, key: string): number | null => {
  const value = response.headers.get(key);
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseMetaTags = (html: string): Record<string, string> => {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const result: Record<string, string> = {};

  for (const tag of tags) {
    const attrs: Record<string, string> = {};
    for (const attrMatch of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      const key = attrMatch[1].toLowerCase();
      const rawValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      attrs[key] = safeDecodeHtmlEntities(rawValue.trim());
    }

    const metaKey = (attrs.property ?? attrs.name ?? '').toLowerCase();
    const content = attrs.content ?? '';
    if (!metaKey || !content) continue;
    if (!(metaKey in result)) {
      result[metaKey] = content;
    }
  }

  return result;
};

const parseTitle = (html: string): string | null => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const value = safeDecodeHtmlEntities(match[1].replace(/\s+/g, ' ').trim());
  return value.length > 0 ? value.slice(0, 300) : null;
};

const toAbsoluteUrl = (candidate: string | null | undefined, baseUrl: string): string | null => {
  if (!candidate) return null;
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
};

const parseInteger = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildGenericHtmlPreview = async (rawUrl: string): Promise<ResolvedPreview> => {
  const safeUrl = assertSafeFetchUrl(rawUrl);
  const response = await fetchWithTimeout(safeUrl.toString(), {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
    },
  });

  await ensureSuccessfulResponse(response, 'Preview URL');

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new PermanentPreviewError('URL did not return HTML');
  }

  const contentLength = getHeaderNumber(response, 'content-length');
  if (contentLength !== null && contentLength > MAX_HTML_RESPONSE_BYTES) {
    throw new PermanentPreviewError('HTML response too large');
  }

  const html = (await response.text()).slice(0, MAX_HTML_RESPONSE_BYTES);
  const finalUrl = response.url || safeUrl.toString();
  const meta = parseMetaTags(html);
  const title = meta['og:title'] ?? meta['twitter:title'] ?? parseTitle(html);
  const description = meta['og:description'] ?? meta['twitter:description'] ?? meta['description'] ?? null;
  const siteName = meta['og:site_name'] ?? null;
  const canonicalUrl = toAbsoluteUrl(meta['og:url'] ?? null, finalUrl) ?? finalUrl;
  const thumbnailSourceUrl =
    toAbsoluteUrl(meta['og:image:secure_url'] ?? meta['og:image'] ?? meta['twitter:image'] ?? null, finalUrl);

  const width = parseInteger(meta['og:image:width'] ?? null);
  const height = parseInteger(meta['og:image:height'] ?? null);

  const normalizedUrl = normalizeUrl(rawUrl);

  const snapshot: PreviewSnapshot = {
    sourceUrl: rawUrl,
    normalizedUrl,
    finalUrl,
    title: title ? title.slice(0, 300) : null,
    description: description ? description.slice(0, 500) : null,
    siteName: siteName ? siteName.slice(0, 120) : null,
    canonicalUrl,
    thumbnail: thumbnailSourceUrl
      ? {
          bucketName: null,
          objectPath: null,
          sourceUrl: thumbnailSourceUrl,
          width,
          height,
          mimeType: null,
        }
      : null,
    embed: null,
  };

  const hasMeaningfulContent = Boolean(snapshot.title || snapshot.description || snapshot.thumbnail);
  if (!hasMeaningfulContent) {
    return {
      status: 'unsupported',
      normalizedUrl,
      finalUrl,
      embedProvider: 'none',
      snapshot,
      cachePayload: snapshot as unknown as Record<string, unknown>,
      thumbnailSourceUrl: null,
    };
  }

  return {
    status: 'ready',
    normalizedUrl,
    finalUrl,
    embedProvider: 'none',
    snapshot,
    cachePayload: snapshot as unknown as Record<string, unknown>,
    thumbnailSourceUrl: thumbnailSourceUrl ?? null,
  };
};

const parseYoutubeVideoId = (url: URL): string | null => {
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
    return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
  }

  if (host.endsWith('youtube.com')) {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v') ?? '';
      return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const candidate = (parts[0] === 'embed' || parts[0] === 'shorts') ? (parts[1] ?? '') : '';
    return /^[a-zA-Z0-9_-]{6,20}$/.test(candidate) ? candidate : null;
  }

  return null;
};

const parseVimeoVideoId = (url: URL): string | null => {
  const host = url.hostname.toLowerCase();
  if (!host.endsWith('vimeo.com')) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (/^\d{6,15}$/.test(parts[i])) return parts[i];
  }
  return null;
};

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json,*/*;q=0.8',
    },
  });
  await ensureSuccessfulResponse(response, 'oEmbed');
  return await response.json();
};

const buildYoutubePreview = async (rawUrl: string, url: URL, videoId: string): Promise<ResolvedPreview> => {
  const normalizedUrl = normalizeUrl(rawUrl);
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url.toString())}&format=json`;
  const data = (await fetchJson(oembedUrl)) as Record<string, unknown>;
  const title = typeof data.title === 'string' ? data.title : null;
  const siteName = typeof data.provider_name === 'string' ? data.provider_name : 'YouTube';
  const thumbnailSourceUrl =
    typeof data.thumbnail_url === 'string' ? data.thumbnail_url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const width = typeof data.thumbnail_width === 'number' ? data.thumbnail_width : null;
  const height = typeof data.thumbnail_height === 'number' ? data.thumbnail_height : null;

  const snapshot: PreviewSnapshot = {
    sourceUrl: rawUrl,
    normalizedUrl,
    finalUrl: url.toString(),
    title: title ? title.slice(0, 300) : 'YouTube Video',
    description: null,
    siteName: siteName?.slice(0, 120) ?? 'YouTube',
    canonicalUrl: url.toString(),
    thumbnail: {
      bucketName: null,
      objectPath: null,
      sourceUrl: thumbnailSourceUrl,
      width,
      height,
      mimeType: null,
    },
    embed: {
      provider: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
      aspectRatio: 16 / 9,
    },
  };

  return {
    status: 'ready',
    normalizedUrl,
    finalUrl: url.toString(),
    embedProvider: 'youtube',
    snapshot,
    cachePayload: snapshot as unknown as Record<string, unknown>,
    thumbnailSourceUrl,
  };
};

const buildVimeoPreview = async (rawUrl: string, url: URL, videoId: string): Promise<ResolvedPreview> => {
  const normalizedUrl = normalizeUrl(rawUrl);
  const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url.toString())}`;
  const data = (await fetchJson(oembedUrl)) as Record<string, unknown>;
  const title = typeof data.title === 'string' ? data.title : null;
  const description = typeof data.description === 'string' ? data.description : null;
  const siteName = typeof data.provider_name === 'string' ? data.provider_name : 'Vimeo';
  const thumbnailSourceUrl = typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null;
  const width = typeof data.thumbnail_width === 'number' ? data.thumbnail_width : null;
  const height = typeof data.thumbnail_height === 'number' ? data.thumbnail_height : null;

  const snapshot: PreviewSnapshot = {
    sourceUrl: rawUrl,
    normalizedUrl,
    finalUrl: url.toString(),
    title: title ? title.slice(0, 300) : 'Vimeo Video',
    description: description ? description.slice(0, 500) : null,
    siteName: siteName?.slice(0, 120) ?? 'Vimeo',
    canonicalUrl: url.toString(),
    thumbnail: thumbnailSourceUrl
      ? {
          bucketName: null,
          objectPath: null,
          sourceUrl: thumbnailSourceUrl,
          width,
          height,
          mimeType: null,
        }
      : null,
    embed: {
      provider: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
      aspectRatio: 16 / 9,
    },
  };

  return {
    status: 'ready',
    normalizedUrl,
    finalUrl: url.toString(),
    embedProvider: 'vimeo',
    snapshot,
    cachePayload: snapshot as unknown as Record<string, unknown>,
    thumbnailSourceUrl,
  };
};

export const resolvePreviewForUrl = async (rawUrl: string): Promise<ResolvedPreview> => {
  const safeUrl = assertSafeFetchUrl(rawUrl);
  const youtubeId = parseYoutubeVideoId(safeUrl);
  if (youtubeId) {
    return await buildYoutubePreview(rawUrl, safeUrl, youtubeId);
  }

  const vimeoId = parseVimeoVideoId(safeUrl);
  if (vimeoId) {
    return await buildVimeoPreview(rawUrl, safeUrl, vimeoId);
  }

  return await buildGenericHtmlPreview(rawUrl);
};

const sha256Hex = async (value: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', value as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const sha256HexFromString = async (value: string): Promise<string> =>
  await sha256Hex(new TextEncoder().encode(value));

const pickImageExtension = (contentType: string | null, sourceUrl: string): string => {
  const normalized = (contentType ?? '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('avif')) return 'avif';

  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,5})$/);
    if (match) return match[1];
  } catch {
    // Ignore URL parse failures.
  }

  return 'bin';
};

export const mirrorPreviewThumbnail = async (params: {
  supabaseAdmin: SupabaseClient;
  bucketName: string;
  normalizedUrl: string;
  thumbnailSourceUrl: string;
}): Promise<{ bucketName: string; objectPath: string; mimeType: string | null } | null> => {
  assertSafeFetchUrl(params.thumbnailSourceUrl);

  const response = await fetchWithTimeout(params.thumbnailSourceUrl, {
    method: 'GET',
    headers: {
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.5',
    },
  });
  await ensureSuccessfulResponse(response, 'Thumbnail URL');

  const contentTypeHeader = (response.headers.get('content-type') ?? '').toLowerCase();
  if (!contentTypeHeader.startsWith('image/')) {
    throw new PermanentPreviewError('Thumbnail URL did not return an image');
  }

  const contentLength = getHeaderNumber(response, 'content-length');
  if (contentLength !== null && contentLength > MAX_IMAGE_BYTES) {
    throw new PermanentPreviewError('Thumbnail image too large');
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) return null;
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new PermanentPreviewError('Thumbnail image too large');
  }

  const hash = await sha256Hex(bytes);
  const namespace = (await sha256HexFromString(params.normalizedUrl)).slice(0, 8);
  const ext = pickImageExtension(contentTypeHeader || null, params.thumbnailSourceUrl);
  const objectPath = `${namespace}/${hash}.${ext}`;

  const { error } = await params.supabaseAdmin.storage.from(params.bucketName).upload(objectPath, bytes, {
    upsert: true,
    contentType: contentTypeHeader || undefined,
    cacheControl: '31536000',
  });

  if (error) {
    throw new RetryablePreviewError(`Failed to mirror thumbnail: ${error.message}`);
  }

  return {
    bucketName: params.bucketName,
    objectPath,
    mimeType: contentTypeHeader || null,
  };
};
