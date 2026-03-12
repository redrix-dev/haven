import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-haven-cron-secret',
} as const;

export const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_V4_PATTERN.test(value);

export const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
  });

export const okOptionsResponse = () => new Response('ok', { headers: corsHeaders });

export const requireSupabaseEnv = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error('Supabase env is not configured (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).');
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    serviceRoleKey,
  };
};

export const createAnonAuthClient = (supabaseUrl: string, anonKey: string) =>
  createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

export const createServiceClient = (supabaseUrl: string, serviceRoleKey: string) =>
  createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

export const createUserScopedClient = (supabaseUrl: string, anonKey: string, token: string) =>
  createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

const decodeBase64UrlJson = (value: string): Record<string, unknown> | null => {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = atob(normalized + padding);
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const extractJwtSubject = (token: string): string | null => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payload = decodeBase64UrlJson(parts[1]);
  const sub = payload?.sub;
  return typeof sub === 'string' && sub.trim().length > 0 ? sub : null;
};

export const extractBearerToken = (req: Request): string | null => {
  const authorization = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  const bearerPrefix = 'bearer ';
  if (!authorization.toLowerCase().startsWith(bearerPrefix)) return null;
  const token = authorization.slice(bearerPrefix.length).trim();
  return token.length > 0 ? token : null;
};

export const getCronSecretHeader = (req: Request): string | null => {
  const value = req.headers.get('x-haven-cron-secret')?.trim();
  return value && value.length > 0 ? value : null;
};

export const verifyCronSecret = (req: Request): boolean => {
  const expected = Deno.env.get('HAVEN_WORKER_CRON_SECRET');
  if (!expected) return false;
  const provided = getCronSecretHeader(req);
  return Boolean(provided && provided === expected);
};

export const authenticateUser = async (req: Request): Promise<{
  token: string;
  userId: string;
  anonClient: SupabaseClient;
  userClient: SupabaseClient;
  supabaseUrl: string;
  supabaseAnonKey: string;
}> => {
  const token = extractBearerToken(req);
  if (!token) {
    throw new Error('Missing bearer token');
  }

  const { supabaseUrl, supabaseAnonKey } = requireSupabaseEnv();
  const anonClient = createAnonAuthClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error,
  } = await anonClient.auth.getUser(token);

  if (error || !user?.id) {
    throw new Error('Invalid JWT');
  }

  return {
    token,
    userId: user.id,
    anonClient,
    userClient: createUserScopedClient(supabaseUrl, supabaseAnonKey, token),
    supabaseUrl,
    supabaseAnonKey,
  };
};

// Use only for functions deployed with verify_jwt = true. The Edge gateway has already validated
// the token signature/expiry, so this avoids a second auth.getUser(token) round-trip that can race
// immediately after sign-in.
export const authenticateGatewayVerifiedUser = async (req: Request): Promise<{
  token: string;
  userId: string;
  anonClient: SupabaseClient;
  userClient: SupabaseClient;
  supabaseUrl: string;
  supabaseAnonKey: string;
}> => {
  const token = extractBearerToken(req);
  if (!token) {
    throw new Error('Missing bearer token');
  }

  const { supabaseUrl, supabaseAnonKey } = requireSupabaseEnv();
  const userId = extractJwtSubject(token);
  if (!userId) {
    throw new Error('Invalid JWT');
  }

  return {
    token,
    userId,
    anonClient: createAnonAuthClient(supabaseUrl, supabaseAnonKey),
    userClient: createUserScopedClient(supabaseUrl, supabaseAnonKey, token),
    supabaseUrl,
    supabaseAnonKey,
  };
};

export const parseJsonBody = async <T = unknown>(req: Request): Promise<T | null> => {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
};
