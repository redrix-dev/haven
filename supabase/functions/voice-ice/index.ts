import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FALLBACK_ICE_SERVERS = [
  {
    urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  },
];

type XirsysResponse = {
  s?: string;
  v?: {
    iceServers?: unknown;
  };
  e?: string;
};

const isIceServer = (value: unknown): value is RTCIceServer => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as RTCIceServer;
  return Boolean(candidate.urls);
};

const normalizeIceServers = (value: unknown): RTCIceServer[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(isIceServer);
  if (isIceServer(value)) return [value];
  return [];
};

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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    console.error('voice-ice auth failed:', userError?.message ?? 'no user');
    return new Response(JSON.stringify({ code: 401, message: 'Invalid JWT' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ident = Deno.env.get('XIRSYS_IDENT');
  const secret = Deno.env.get('XIRSYS_SECRET');
  const channel = Deno.env.get('XIRSYS_CHANNEL');
  const gateway = Deno.env.get('XIRSYS_GATEWAY') ?? 'global.xirsys.net';

  if (!ident || !secret || !channel) {
    return new Response(
      JSON.stringify({
        source: 'fallback',
        warning: 'XIRSYS credentials are not configured. Returning STUN fallback only.',
        iceServers: FALLBACK_ICE_SERVERS,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  const encodedAuth = btoa(`${ident}:${secret}`);

  try {
    const xirsysResponse = await fetch(`https://${gateway}/_turn/${channel}`, {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${encodedAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        format: 'urls',
      }),
    });

    if (!xirsysResponse.ok) {
      const errorBody = await xirsysResponse.text();
      console.error('XIRSYS request failed:', xirsysResponse.status, errorBody);
      return new Response(
        JSON.stringify({
          source: 'fallback',
          warning: 'XIRSYS request failed. Returning STUN fallback only.',
          iceServers: FALLBACK_ICE_SERVERS,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const payload = (await xirsysResponse.json()) as XirsysResponse;
    const iceServers = normalizeIceServers(payload?.v?.iceServers);

    if (iceServers.length === 0) {
      return new Response(
        JSON.stringify({
          source: 'fallback',
          warning: 'XIRSYS returned no ICE servers. Returning STUN fallback only.',
          iceServers: FALLBACK_ICE_SERVERS,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        source: 'xirsys',
        iceServers,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('XIRSYS fetch error:', error);
    return new Response(
      JSON.stringify({
        source: 'fallback',
        warning: 'Failed to fetch XIRSYS credentials. Returning STUN fallback only.',
        iceServers: FALLBACK_ICE_SERVERS,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
