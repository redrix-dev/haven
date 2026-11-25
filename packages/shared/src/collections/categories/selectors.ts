/** Views over `CategoriesState`, worked out when read. Both platforms use these. */

import type { ChannelCategory } from "@shared/lib/backend/records";
import type { CategoriesState } from "./categories";

/** The community's categories by position, then id. */
export function categoriesOf(
  state: CategoriesState,
  communityId: string,
): ChannelCategory[] {
  return Object.values(state.byId)
    .filter((category) => category.community_id === communityId)
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
}

export function isCollapsed(
  state: CategoriesState,
  categoryId: string,
): boolean {
  return state.collapsed[categoryId] === true;
}
