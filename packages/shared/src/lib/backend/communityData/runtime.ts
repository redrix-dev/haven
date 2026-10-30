/**
 * Runtime wiring for the community data backend, plus the edge-function
 * caller that needs the same injected config.
 *
 * The module is inert until a host calls configureCommunityDataBackendRuntime()
 * at boot to inject the Supabase client, edge config, media helpers and object
 * store; the havenCommunity*() accessors throw if used before that.
 *
 * supabaseFunctionJson(): POST to a Supabase Edge Function, refresh-and-retry
 * once on 401. waitForConfirmedSupabaseSession(): poll up to 4s for a
 * server-confirmed session (getUser, not just a local getSession token).
 */
import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import type { MessageObjectStore } from "../messageObjectStore";
import type { MediaAttachmentHelpers } from "../mediaAttachmentUtils";

let havenCommunityClient: HavenSupabaseClient | null = null;

let havenCommunityEdgeConfig: {
  supabaseUrl: string;
  supabaseAnonKey: string;
} | null = null;

let havenCommunityMedia: MediaAttachmentHelpers | null = null;

let havenCommunityObjectStore: MessageObjectStore | null = null;

export function configureCommunityDataBackendRuntime(input: {
  client: HavenSupabaseClient;
  edge: { supabaseUrl: string; supabaseAnonKey: string };
  media: MediaAttachmentHelpers;
  messageStore: MessageObjectStore;
}): void {
  havenCommunityClient = input.client;
  havenCommunityEdgeConfig = input.edge;
  havenCommunityMedia = input.media;
  havenCommunityObjectStore = input.messageStore;
}

export function havenCommunitySb(): HavenSupabaseClient {
  if (!havenCommunityClient) {
    throw new Error(
      "Community data backend used before Haven data runtime was initialized.",
    );
  }
  return havenCommunityClient;
}

export function havenCommunityMediaHelpers(): MediaAttachmentHelpers {
  if (!havenCommunityMedia) {
    throw new Error("Community media helpers not configured.");
  }
  return havenCommunityMedia;
}

export function havenCommunityStore(): MessageObjectStore {
  if (!havenCommunityObjectStore) {
    throw new Error("Community message object store not configured.");
  }
  return havenCommunityObjectStore;
}

export const supabaseFunctionJson = async <TResponse>(
  functionName: string,
  body: unknown,
): Promise<TResponse> => {
  if (!havenCommunityEdgeConfig) {
    throw new Error(
      "Supabase edge configuration missing for community backend.",
    );
  }
  const { supabaseUrl, supabaseAnonKey } = havenCommunityEdgeConfig;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL or key is missing.");
  }

  const getAccessToken = async (): Promise<string> => {
    const {
      data: { session },
      error: sessionError,
    } = await havenCommunitySb().auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error("No authenticated session token available.");
    }
    return accessToken;
  };

  const callWithToken = async (
    accessToken: string,
  ): Promise<{
    ok: boolean;
    status: number;
    parsed: unknown;
  }> => {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/${functionName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body ?? {}),
      },
    );

    const rawBody = await response.text();
    let parsed: unknown = null;
    if (rawBody.trim().length > 0) {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        parsed = rawBody;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      parsed,
    };
  };

  let result = await callWithToken(await getAccessToken());

  const errorMessageFromParsed = (parsed: unknown, status: number): string =>
    parsed &&
    typeof parsed === "object" &&
    "message" in parsed &&
    typeof (parsed as { message: unknown }).message === "string"
      ? (parsed as { message: string }).message
      : `Function ${functionName} failed (${status}).`;

  if (!result.ok && result.status === 401) {
    try {
      const { data: refreshed, error: refreshError } =
        await havenCommunitySb().auth.refreshSession();
      if (!refreshError && refreshed.session?.access_token) {
        result = await callWithToken(refreshed.session.access_token);
      }
    } catch {
      // Fall through to the original error handling.
    }
  }

  if (!result.ok) {
    throw new Error(errorMessageFromParsed(result.parsed, result.status));
  }

  return result.parsed as TResponse;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const waitForConfirmedSupabaseSession = async (
  timeoutMs = 4000,
): Promise<boolean> => {
  const startedAt = Date.now();
  let refreshAttempted = false;

  while (Date.now() - startedAt < timeoutMs) {
    const {
      data: { session },
      error: sessionError,
    } = await havenCommunitySb().auth.getSession();

    if (!sessionError && session?.access_token) {
      const { data: userData, error: userError } =
        await havenCommunitySb().auth.getUser(session.access_token);
      if (!userError && userData.user) {
        return true;
      }
    }

    if (!refreshAttempted) {
      refreshAttempted = true;
      try {
        const { data: refreshed, error: refreshError } =
          await havenCommunitySb().auth.refreshSession();
        if (!refreshError && refreshed.session?.access_token) {
          const { data: refreshedUser, error: refreshedUserError } =
            await havenCommunitySb().auth.getUser(
              refreshed.session.access_token,
            );
          if (!refreshedUserError && refreshedUser.user) {
            return true;
          }
        }
      } catch {
        // Fall through to retry loop.
      }
    }

    await sleep(250);
  }

  return false;
};
