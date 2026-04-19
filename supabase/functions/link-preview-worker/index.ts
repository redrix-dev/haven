import {
  authenticateUser,
  createServiceClient,
  jsonResponse,
  okOptionsResponse,
  parseJsonBody,
  requireSupabaseEnv,
  verifyCronSecret,
} from '../_shared/common.ts';
import {
  extractFirstHttpUrl,
  mirrorPreviewThumbnail,
  normalizeUrl,
  PermanentPreviewError,
  resolvePreviewForUrl,
  RetryablePreviewError,
  type PreviewSnapshot,
} from '../_shared/link-preview.ts';

type WorkerRequest = {
  mode?: 'cron' | 'manual';
  maxJobs?: number;
};

type LinkPreviewJobRow = {
  id: string;
  message_id: string;
  reason: string;
  attempts: number;
  status: string;
  available_at: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  community_id: string;
  channel_id: string;
  content: string;
  deleted_at: string | null;
};

type CacheRow = {
  id: string;
  normalized_url: string;
  status: 'pending' | 'ready' | 'unsupported' | 'failed';
  payload: unknown;
  final_url: string | null;
  thumbnail_bucket_name: string | null;
  thumbnail_object_path: string | null;
  thumbnail_source_url: string | null;
  stale_after: string | null;
};

const LINK_PREVIEW_IMAGE_BUCKET = 'link-preview-images';

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
};

const nowIso = () => new Date().toISOString();

const computeRetryDelaySeconds = (attempts: number) => Math.min(3600, Math.max(30, 30 * (attempts + 1)));

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | null => (typeof value === 'string' && value.trim().length > 0 ? value : null);
const asNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const snapshotFromUnknown = (value: unknown): PreviewSnapshot | null => {
  const obj = asObject(value);
  if (!obj) return null;

  const thumbnailObj = asObject(obj.thumbnail);
  const embedObj = asObject(obj.embed);

  return {
    sourceUrl: asString(obj.sourceUrl) ?? '',
    normalizedUrl: asString(obj.normalizedUrl) ?? '',
    finalUrl: asString(obj.finalUrl),
    title: asString(obj.title),
    description: asString(obj.description),
    siteName: asString(obj.siteName),
    canonicalUrl: asString(obj.canonicalUrl),
    thumbnail: thumbnailObj
      ? {
          bucketName: asString(thumbnailObj.bucketName),
          objectPath: asString(thumbnailObj.objectPath),
          sourceUrl: asString(thumbnailObj.sourceUrl),
          width: asNumber(thumbnailObj.width),
          height: asNumber(thumbnailObj.height),
          mimeType: asString(thumbnailObj.mimeType),
        }
      : null,
    embed: embedObj && (embedObj.provider === 'youtube' || embedObj.provider === 'vimeo') && asString(embedObj.embedUrl)
      ? {
          provider: embedObj.provider,
          embedUrl: asString(embedObj.embedUrl)!,
          aspectRatio: asNumber(embedObj.aspectRatio) ?? 16 / 9,
        }
      : null,
  };
};

const isCacheFresh = (row: CacheRow | null): boolean => {
  if (!row || !row.stale_after) return false;
  const staleAt = Date.parse(row.stale_after);
  return Number.isFinite(staleAt) && staleAt > Date.now() && (row.status === 'ready' || row.status === 'unsupported');
};

const buildUnsupportedSnapshot = (rawUrl: string, normalizedUrl: string, reason?: string): PreviewSnapshot => ({
  sourceUrl: rawUrl,
  normalizedUrl,
  finalUrl: rawUrl,
  title: null,
  description: reason ? reason.slice(0, 300) : null,
  siteName: null,
  canonicalUrl: rawUrl,
  thumbnail: null,
  embed: null,
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return okOptionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const isCron = verifyCronSecret(req);
  if (!isCron) {
    try {
      await authenticateUser(req);
    } catch (error) {
      return jsonResponse({ code: 401, message: error instanceof Error ? error.message : 'Unauthorized' }, 401);
    }
  }

  let env;
  try {
    env = requireSupabaseEnv();
  } catch (error) {
    return jsonResponse({ code: 500, message: error instanceof Error ? error.message : 'Missing env' }, 500);
  }

  const body = (await parseJsonBody<WorkerRequest>(req)) ?? {};
  const maxJobs = clampInt(body.maxJobs, 1, isCron ? 100 : 25, isCron ? 25 : 10);
  const supabaseAdmin = createServiceClient(env.supabaseUrl, env.serviceRoleKey);

  const stats = {
    mode: isCron ? 'cron' : 'manual',
    claimedJobs: 0,
    completed: 0,
    cacheHits: 0,
    fetched: 0,
    mirroredImages: 0,
    unsupported: 0,
    retryableFailures: 0,
    terminalFailures: 0,
  };

  const { data: claimRows, error: claimError } = await supabaseAdmin.rpc('claim_link_preview_jobs', {
    p_limit: maxJobs,
    p_lease_seconds: isCron ? 180 : 120,
  });

  if (claimError) {
    console.error('link-preview-worker claim rpc failed:', claimError);
    return jsonResponse({ code: 500, message: 'Failed to claim link preview jobs' }, 500);
  }

  const jobs = (claimRows ?? []) as LinkPreviewJobRow[];
  stats.claimedJobs = jobs.length;

  for (const job of jobs) {
    try {
      const { data: messageRowRaw, error: messageError } = await supabaseAdmin
        .from('messages')
        .select('id, community_id, channel_id, content, deleted_at')
        .eq('id', job.message_id)
        .maybeSingle();

      if (messageError) {
        throw new RetryablePreviewError(`Failed to load message: ${messageError.message}`);
      }

      const messageRow = (messageRowRaw ?? null) as MessageRow | null;
      if (!messageRow || messageRow.deleted_at) {
        await supabaseAdmin.from('message_link_previews' as never).delete().eq('message_id', job.message_id);
        const { error: completeError } = await supabaseAdmin.rpc('complete_link_preview_job', {
          p_job_id: job.id,
          p_outcome: 'done',
          p_error: null,
          p_retry_delay_seconds: 120,
        });
        if (completeError) console.error('Failed to complete deleted-message job:', completeError);
        stats.completed += 1;
        continue;
      }

      const sourceUrl = extractFirstHttpUrl(messageRow.content);
      if (!sourceUrl) {
        await supabaseAdmin.from('message_link_previews' as never).delete().eq('message_id', job.message_id);
        const { error: completeError } = await supabaseAdmin.rpc('complete_link_preview_job', {
          p_job_id: job.id,
          p_outcome: 'done',
          p_error: null,
          p_retry_delay_seconds: 120,
        });
        if (completeError) console.error('Failed to complete no-link job:', completeError);
        stats.completed += 1;
        continue;
      }

      const normalizedUrl = normalizeUrl(sourceUrl);

      const { data: cacheRowData, error: cacheLookupError } = await supabaseAdmin
        .from('link_preview_cache' as never)
        .select(
          'id, normalized_url, status, payload, final_url, thumbnail_bucket_name, thumbnail_object_path, thumbnail_source_url, stale_after'
        )
        .eq('normalized_url', normalizedUrl)
        .maybeSingle();

      if (cacheLookupError) {
        throw new RetryablePreviewError(`Failed to lookup preview cache: ${cacheLookupError.message}`);
      }

      const cacheRow = (cacheRowData ?? null) as CacheRow | null;

      let finalStatus: 'ready' | 'unsupported';
      let finalSnapshot: PreviewSnapshot;
      let finalEmbedProvider: 'none' | 'youtube' | 'vimeo';
      let cacheId: string | null = cacheRow?.id ?? null;
      let thumbnailBucketName: string | null = null;
      let thumbnailObjectPath: string | null = null;
      let finalUrl: string | null = null;
      let thumbnailSourceUrl: string | null = null;
      let cachePayload: Record<string, unknown>;

      if (cacheRow && isCacheFresh(cacheRow)) {
        const cachedSnapshot = snapshotFromUnknown(cacheRow.payload);
        if (!cachedSnapshot) {
          throw new RetryablePreviewError('Cached preview payload is invalid');
        }
        finalStatus = cacheRow!.status === 'unsupported' ? 'unsupported' : 'ready';
        finalSnapshot = cachedSnapshot;
        finalEmbedProvider =
          cachedSnapshot.embed?.provider === 'youtube' || cachedSnapshot.embed?.provider === 'vimeo'
            ? cachedSnapshot.embed.provider
            : 'none';
        cachePayload = asObject(cacheRow!.payload) ?? {};
        finalUrl = cacheRow!.final_url;
        thumbnailBucketName = cacheRow!.thumbnail_bucket_name;
        thumbnailObjectPath = cacheRow!.thumbnail_object_path;
        thumbnailSourceUrl = cacheRow!.thumbnail_source_url;
        stats.cacheHits += 1;
      } else {
        const resolved = await resolvePreviewForUrl(sourceUrl);
        stats.fetched += 1;

        finalStatus = resolved.status;
        finalSnapshot = resolved.snapshot;
        finalEmbedProvider = resolved.embedProvider;
        finalUrl = resolved.finalUrl;
        thumbnailSourceUrl = resolved.thumbnailSourceUrl;
        cachePayload = resolved.cachePayload;

        if (resolved.status === 'ready' && resolved.thumbnailSourceUrl) {
          try {
            const mirrored = await mirrorPreviewThumbnail({
              supabaseAdmin,
              bucketName: LINK_PREVIEW_IMAGE_BUCKET,
              normalizedUrl: resolved.normalizedUrl,
              thumbnailSourceUrl: resolved.thumbnailSourceUrl,
            });
            if (mirrored) {
              thumbnailBucketName = mirrored.bucketName;
              thumbnailObjectPath = mirrored.objectPath;
              stats.mirroredImages += 1;

              if (finalSnapshot.thumbnail) {
                finalSnapshot.thumbnail.bucketName = mirrored.bucketName;
                finalSnapshot.thumbnail.objectPath = mirrored.objectPath;
                finalSnapshot.thumbnail.mimeType = mirrored.mimeType;
              }
            }
          } catch (mirrorError) {
            console.warn('link-preview-worker thumbnail mirror failed; continuing without mirror', {
              messageId: job.message_id,
              error: mirrorError instanceof Error ? mirrorError.message : String(mirrorError),
            });
          }
        }

        const cacheUpsertPayload = {
          normalized_url: resolved.normalizedUrl,
          final_url: finalUrl,
          status: finalStatus,
          payload: finalSnapshot,
          thumbnail_bucket_name: thumbnailBucketName,
          thumbnail_object_path: thumbnailObjectPath,
          thumbnail_source_url: thumbnailSourceUrl,
          fetched_at: nowIso(),
          stale_after: new Date(Date.now() + (finalStatus === 'ready' ? 24 : 12) * 60 * 60 * 1000).toISOString(),
          last_error_code: null,
          last_error_message: null,
          updated_at: nowIso(),
        };

        const { data: cacheUpsertRow, error: cacheUpsertError } = await supabaseAdmin
          .from('link_preview_cache' as never)
          .upsert(cacheUpsertPayload as never, { onConflict: 'normalized_url' })
          .select('id')
          .single();

        if (cacheUpsertError) {
          throw new RetryablePreviewError(`Failed to upsert preview cache: ${cacheUpsertError.message}`);
        }

        cacheId =
          cacheUpsertRow && typeof cacheUpsertRow === 'object' && 'id' in cacheUpsertRow
            ? String((cacheUpsertRow as { id: unknown }).id)
            : cacheId;
      }

      const { error: previewUpsertError } = await supabaseAdmin
        .from('message_link_previews' as never)
        .upsert(
          {
            message_id: messageRow.id,
            community_id: messageRow.community_id,
            channel_id: messageRow.channel_id,
            source_url: sourceUrl,
            normalized_url: normalizedUrl,
            status: finalStatus,
            cache_id: cacheId,
            snapshot: finalSnapshot,
            embed_provider: finalEmbedProvider,
            thumbnail_bucket_name: thumbnailBucketName,
            thumbnail_object_path: thumbnailObjectPath,
            updated_at: nowIso(),
          } as never,
          { onConflict: 'message_id' },
        );

      if (previewUpsertError) {
        throw new RetryablePreviewError(`Failed to upsert message preview row: ${previewUpsertError.message}`);
      }

      const { error: completeError } = await supabaseAdmin.rpc('complete_link_preview_job', {
        p_job_id: job.id,
        p_outcome: 'done',
        p_error: null,
        p_retry_delay_seconds: 120,
      });

      if (completeError) {
        console.error('Failed to complete link preview job:', completeError);
      } else {
        stats.completed += 1;
      }

      if (finalStatus === 'unsupported') stats.unsupported += 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRetryable = error instanceof RetryablePreviewError;
      const isPermanentUnsupported = error instanceof PermanentPreviewError;

      // Best-effort row update for UI visibility of failures/unsupported states.
      try {
        const { data: messageRowRaw } = await supabaseAdmin
          .from('messages')
          .select('id, community_id, channel_id, content, deleted_at')
          .eq('id', job.message_id)
          .maybeSingle();
        const messageRow = (messageRowRaw ?? null) as MessageRow | null;
        if (messageRow && !messageRow.deleted_at) {
          const sourceUrl = extractFirstHttpUrl(messageRow.content);
          if (sourceUrl) {
            const normalizedUrl = (() => {
              try {
                return normalizeUrl(sourceUrl);
              } catch {
                return sourceUrl;
              }
            })();

            const fallbackStatus = isPermanentUnsupported ? 'unsupported' : 'failed';
            const fallbackSnapshot = buildUnsupportedSnapshot(
              sourceUrl,
              normalizedUrl,
              isPermanentUnsupported ? errorMessage : undefined,
            );
            await supabaseAdmin.from('message_link_previews' as never).upsert(
              {
                message_id: messageRow.id,
                community_id: messageRow.community_id,
                channel_id: messageRow.channel_id,
                source_url: sourceUrl,
                normalized_url: normalizedUrl,
                status: fallbackStatus,
                cache_id: null,
                snapshot: fallbackSnapshot,
                embed_provider: 'none',
                thumbnail_bucket_name: null,
                thumbnail_object_path: null,
                updated_at: nowIso(),
              } as never,
              { onConflict: 'message_id' },
            );
          }
        }
      } catch (updateError) {
        console.error('Failed to write fallback preview row status:', updateError);
      }

      const terminal = isPermanentUnsupported || (job.attempts ?? 1) >= 5;
      const outcome = terminal ? 'failed' : 'retryable_failed';
      const retryDelaySeconds = terminal ? 300 : computeRetryDelaySeconds(job.attempts ?? 1);
      const { error: completeError } = await supabaseAdmin.rpc('complete_link_preview_job', {
        p_job_id: job.id,
        p_outcome: outcome,
        p_error: errorMessage,
        p_retry_delay_seconds: retryDelaySeconds,
      });
      if (completeError) {
        console.error('Failed to complete failed link preview job:', completeError);
      }

      if (terminal) {
        stats.terminalFailures += 1;
        if (isPermanentUnsupported) stats.unsupported += 1;
      } else {
        stats.retryableFailures += 1;
      }
    }
  }

  return jsonResponse(stats);
});
