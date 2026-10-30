/**
 * Row shapes and untyped-JSON coercers shared by several community backends.
 * Start of the JSON trust boundary.
 *
 * Supabase embedded relations arrive as an object OR a one-element array;
 * CommunityMemberWithProfile and its callers guard both.
 */
import type { Database } from "@shared/types/database";

export type CommunityMemberWithProfile = Pick<
  Database["public"]["Tables"]["community_members"]["Row"],
  "id" | "nickname" | "is_owner" | "user_id" | "joined_at"
> & {
  profiles:
    | Pick<
        Database["public"]["Tables"]["profiles"]["Row"],
        "username" | "avatar_url"
      >
    | Array<
        Pick<
          Database["public"]["Tables"]["profiles"]["Row"],
          "username" | "avatar_url"
        >
      >
    | null;
};

export const asObjectRecord = (
  value: unknown,
): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const asOptionalString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

export const asOptionalNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
