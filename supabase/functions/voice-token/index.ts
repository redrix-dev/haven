import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_V4_PATTERN.test(value);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authorization = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  const bearerPrefix = 'bearer ';
  const token = authorization.toLowerCase().startsWith(bearerPrefix)
    ? authorization.slice(bearerPrefix.length).trim()
    : '';

  if (!token) {
    return new Response(JSON.stringify({ code: 401, message: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ code: 500, message: 'Supabase env is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser(token);

  if (userError || !user) {
    console.error('voice-token auth failed:', userError?.message ?? 'no user');
    return new Response(JSON.stringify({ code: 401, message: 'Invalid JWT' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ code: 400, message: 'Invalid JSON payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const candidatePayload =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  const communityId = candidatePayload?.communityId;
  const channelId = candidatePayload?.channelId;

  if (!isUuid(communityId) || !isUuid(channelId)) {
    return new Response(
      JSON.stringify({ code: 400, message: 'communityId and channelId must be valid UUIDs' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: channelRow, error: channelError } = await userClient
    .from('channels')
    .select('id, community_id, kind')
    .eq('id', channelId)
    .eq('community_id', communityId)
    .maybeSingle();

  if (channelError) {
    console.error('voice-token channel lookup failed:', channelError.message);
    return new Response(
      JSON.stringify({ code: 500, message: 'Failed to validate channel access' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (!channelRow) {
    return new Response(
      JSON.stringify({ code: 403, message: 'Not authorized for this channel' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (channelRow.kind !== 'voice') {
    return new Response(
      JSON.stringify({ code: 400, message: 'Requested channel is not a voice channel' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const livekitUrl = Deno.env.get('LIVEKIT_URL');
  const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY');
  const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return new Response(
      JSON.stringify({ code: 500, message: 'LiveKit env is not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Derive a display name from user metadata, falling back to truncated user ID.
  const displayName =
    (user.user_metadata?.display_name as string | undefined)?.trim() ||
    (user.user_metadata?.username as string | undefined)?.trim() ||
    user.email?.split('@')[0] ||
    user.id.slice(0, 12);

  try {
    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: displayName,
      ttl: '4h',
    });

    at.addGrant({
      roomJoin: true,
      room: `${communityId}:${channelId}`,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwtToken = await at.toJwt();

    return new Response(
      JSON.stringify({ token: jwtToken, serverUrl: livekitUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('voice-token JWT generation failed:', error);
    return new Response(
      JSON.stringify({ code: 500, message: 'Failed to generate voice token' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
