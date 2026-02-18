import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/shared/lib/errors';

export type IceConfigSource = 'xirsys' | 'fallback';

export type IceConfigResult = {
  source: IceConfigSource;
  iceServers: RTCIceServer[];
  warning?: string;
  blockedReason?: string;
};

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  },
];

const isRtcIceServer = (value: unknown): value is RTCIceServer => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as RTCIceServer;
  return Boolean(candidate.urls);
};

const normalizeIceServers = (value: unknown): RTCIceServer[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter(isRtcIceServer);
  }
  if (isRtcIceServer(value)) {
    return [value];
  }
  return [];
};

export async function fetchIceConfig(params: {
  communityId: string;
  channelId: string;
}): Promise<IceConfigResult> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        source: 'fallback',
        iceServers: FALLBACK_ICE_SERVERS,
        warning: 'Supabase URL or key is missing. Using STUN fallback.',
      };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? null;

    if (!accessToken) {
      return {
        source: 'fallback',
        iceServers: [],
        blockedReason: 'No authenticated session token available for voice.',
      };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/voice-ice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        communityId: params.communityId,
        channelId: params.channelId,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 401 || response.status === 403) {
        return {
          source: 'fallback',
          iceServers: [],
          blockedReason: 'You are not authorized to join this voice channel.',
          warning: `Voice relay request rejected (${response.status}). ${errorBody || ''}`.trim(),
        };
      }
      return {
        source: 'fallback',
        iceServers: FALLBACK_ICE_SERVERS,
        warning: `Voice relay request failed (${response.status}). ${errorBody || 'Using STUN fallback.'}`,
      };
    }

    const data = await response.json();

    const source = data?.source === 'xirsys' ? 'xirsys' : 'fallback';
    const iceServers = normalizeIceServers(data?.iceServers);

    if (iceServers.length === 0) {
      return {
        source: 'fallback',
        iceServers: FALLBACK_ICE_SERVERS,
        warning: 'No valid ICE servers returned. Using STUN fallback.',
      };
    }

    return {
      source,
      iceServers,
      warning: typeof data?.warning === 'string' ? data.warning : undefined,
    };
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return {
      source: 'fallback',
      iceServers: FALLBACK_ICE_SERVERS,
      warning: `Failed to fetch ICE config (${message}). Using STUN fallback.`,
    };
  }
}
