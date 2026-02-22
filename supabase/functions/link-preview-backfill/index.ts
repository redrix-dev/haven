import {
  authenticateGatewayVerifiedUser,
  createServiceClient,
  isUuid,
  jsonResponse,
  okOptionsResponse,
  parseJsonBody,
  requireSupabaseEnv,
} from '../_shared/common.ts';

type BackfillRequest = {
  communityId?: string;
  channelId?: string;
  messageIds?: string[];
  limit?: number;
};

type PreviewRow = {
  message_id: string;
  status: 'pending' | 'ready' | 'unsupported' | 'failed';
};

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return okOptionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let auth;
  try {
    auth = await authenticateGatewayVerifiedUser(req);
  } catch (error) {
    return jsonResponse({ code: 401, message: error instanceof Error ? error.message : 'Unauthorized' }, 401);
  }

  const body = (await parseJsonBody<BackfillRequest>(req)) ?? {};
  const communityId = body.communityId;
  const channelId = body.channelId;
  if (!isUuid(communityId) || !isUuid(channelId)) {
    return jsonResponse({ code: 400, message: 'communityId and channelId must be UUIDs' }, 400);
  }

  const limit = clampInt(body.limit, 1, 100, 50);

  const { data: channelRow, error: channelError } = await auth.userClient
    .from('channels')
    .select('id, community_id, kind')
    .eq('id', channelId)
    .eq('community_id', communityId)
    .maybeSingle();

  if (channelError) {
    console.error('link-preview-backfill channel lookup failed:', channelError);
    return jsonResponse({ code: 500, message: 'Failed to validate channel access' }, 500);
  }
  if (!channelRow) {
    return jsonResponse({ code: 403, message: 'Not authorized for this channel' }, 403);
  }
  if (channelRow.kind !== 'text') {
    return jsonResponse({ code: 400, message: 'Backfill only applies to text channels' }, 400);
  }

  const requestedIds = Array.isArray(body.messageIds)
    ? Array.from(new Set(body.messageIds.filter((value): value is string => isUuid(value))))
    : [];
  const boundedRequestedIds = requestedIds.slice(0, 100);

  let messagesQuery = auth.userClient
    .from('messages')
    .select('id')
    .eq('community_id', communityId)
    .eq('channel_id', channelId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (boundedRequestedIds.length > 0) {
    messagesQuery = auth.userClient
      .from('messages')
      .select('id')
      .eq('community_id', communityId)
      .eq('channel_id', channelId)
      .is('deleted_at', null)
      .in('id', boundedRequestedIds.slice(0, limit));
  }

  const { data: messageRows, error: messagesError } = await messagesQuery;
  if (messagesError) {
    console.error('link-preview-backfill messages query failed:', messagesError);
    return jsonResponse({ code: 500, message: 'Failed to load messages for backfill' }, 500);
  }

  const messageIds = (messageRows ?? [])
    .map((row) => (row && typeof row === 'object' && 'id' in row ? String((row as { id: unknown }).id) : null))
    .filter((value): value is string => Boolean(value));

  if (messageIds.length === 0) {
    return jsonResponse({ queued: 0, skipped: 0, alreadyPresent: 0, requested: 0 });
  }

  const { data: previewRows, error: previewsError } = await auth.userClient
    .from('message_link_previews' as never)
    .select('message_id, status')
    .eq('community_id', communityId)
    .eq('channel_id', channelId)
    .in('message_id', messageIds as never);

  if (previewsError) {
    console.error('link-preview-backfill previews query failed:', previewsError);
    return jsonResponse({ code: 500, message: 'Failed to load preview rows for backfill' }, 500);
  }

  const previewByMessageId = new Map<string, PreviewRow>();
  for (const row of (previewRows ?? []) as PreviewRow[]) {
    previewByMessageId.set(row.message_id, row);
  }

  const alreadyPresent = messageIds.filter((id) => previewByMessageId.get(id)?.status === 'ready').length;
  const toQueue = messageIds.filter((id) => previewByMessageId.get(id)?.status !== 'ready');

  if (toQueue.length === 0) {
    return jsonResponse({ queued: 0, skipped: messageIds.length, alreadyPresent, requested: messageIds.length });
  }

  let env;
  try {
    env = requireSupabaseEnv();
  } catch (error) {
    return jsonResponse({ code: 500, message: error instanceof Error ? error.message : 'Missing env' }, 500);
  }

  const admin = createServiceClient(env.supabaseUrl, env.serviceRoleKey);
  const { data: enqueueRows, error: enqueueError } = await admin.rpc('enqueue_link_preview_jobs_for_messages', {
    p_message_ids: toQueue,
    p_reason: 'backfill',
  });

  if (enqueueError) {
    console.error('link-preview-backfill enqueue rpc failed:', enqueueError);
    return jsonResponse({ code: 500, message: 'Failed to enqueue link preview jobs' }, 500);
  }

  const queued = Array.isArray(enqueueRows)
    ? enqueueRows.filter((row) => row && typeof row === 'object' && 'queued' in row && (row as { queued: unknown }).queued === true).length
    : 0;

  return jsonResponse({
    requested: messageIds.length,
    queued,
    skipped: messageIds.length - queued,
    alreadyPresent,
  });
});
