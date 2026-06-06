import { createMMKV } from "react-native-mmkv";
import { normalizeInviteCode } from "@shared/features/community/utils/inviteCode";
import { parseWebAppDeepLinkUrl } from "@shared/infrastructure/platform/deepLinks";

const pendingInviteStorage = createMMKV({ id: "haven-mobile-pending-invites" });
const PENDING_INVITE_CODE_KEY = "pending_invite_code";
const PENDING_INVITE_URL_KEY = "pending_invite_url";
const PENDING_INVITE_CREATED_AT_KEY = "pending_invite_created_at";
const pendingInviteListeners = new Set<() => void>();

export type PendingInvite = {
  code: string;
  sourceUrl: string | null;
  createdAt: number;
};

function parseCustomSchemeInviteCode(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "haven:" || parsed.hostname !== "invite") return null;
    const fromPath = parsed.pathname.split("/").filter(Boolean)[0];
    const fromQuery = parsed.searchParams.get("code") ?? parsed.searchParams.get("invite");
    const rawCode = fromPath ?? fromQuery;
    return rawCode ? normalizeInviteCode(decodeURIComponent(rawCode)) : null;
  } catch {
    return null;
  }
}

export function parseInviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const parsed = parseWebAppDeepLinkUrl(url);
  if (parsed?.kind === "invite") {
    return normalizeInviteCode(parsed.inviteCode);
  }
  return parseCustomSchemeInviteCode(url);
}

export function savePendingInviteFromUrl(url: string | null | undefined): boolean {
  const code = parseInviteCodeFromUrl(url);
  if (!code) return false;
  pendingInviteStorage.set(PENDING_INVITE_CODE_KEY, code);
  pendingInviteStorage.set(PENDING_INVITE_URL_KEY, url ?? "");
  pendingInviteStorage.set(PENDING_INVITE_CREATED_AT_KEY, String(Date.now()));
  pendingInviteListeners.forEach((listener) => listener());
  return true;
}

export function readPendingInvite(): PendingInvite | null {
  const code = pendingInviteStorage.getString(PENDING_INVITE_CODE_KEY);
  if (!code) return null;
  return {
    code,
    sourceUrl: pendingInviteStorage.getString(PENDING_INVITE_URL_KEY) || null,
    createdAt: Number(pendingInviteStorage.getString(PENDING_INVITE_CREATED_AT_KEY) ?? 0),
  };
}

export function clearPendingInvite(): void {
  pendingInviteStorage.remove(PENDING_INVITE_CODE_KEY);
  pendingInviteStorage.remove(PENDING_INVITE_URL_KEY);
  pendingInviteStorage.remove(PENDING_INVITE_CREATED_AT_KEY);
}

export function subscribePendingInvite(listener: () => void): () => void {
  pendingInviteListeners.add(listener);
  return () => {
    pendingInviteListeners.delete(listener);
  };
}
