import { builtinThemes } from "@shared/themes/registry";
import type { HavenTheme } from "@shared/themes/types";

/** Built-in themes the user may pick: excludes preview; respects optional `entitlementKey` vs granted keys. */
export function listSelectableBuiltinThemes(
  grantedEntitlementKeys: ReadonlySet<string>,
): HavenTheme[] {
  return Object.values(builtinThemes).filter((t) => {
    if (t.status === "preview") return false;
    if (!t.entitlementKey) return true;
    return grantedEntitlementKeys.has(t.entitlementKey);
  });
}
