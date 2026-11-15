/**
 * Categories: how each community's channels are grouped in the sidebar, and
 * which groups the person keeps collapsed. DATABASE.md: "Communities".
 *
 * Categories come with the community (`communities` hands them over) and
 * stay current from `category.*` events. Collapsing is the person's own,
 * stored in the database so every device shows the same sidebar.
 */

import type {
  CommunitiesBackend,
  CommunityStructure,
} from "@shared/lib/backend/communities";
import type { ChannelCategory } from "@shared/lib/backend/records";
import type { CommunityPart } from "../communities/communities";
import type { DeviceCopy } from "../kit/deviceCopies";
import { Requests, type RequestMap } from "../kit/requests";
import { type ById, dropIds, dropWhere, putRows } from "../kit/rows";
import type { StatePort } from "../kit/statePort";

export type CategoriesState = {
  byId: ById<ChannelCategory>;
  /** Category ids the person collapsed. */
  collapsed: Readonly<Record<string, true>>;
  requests: RequestMap;
};

export const createCategoriesState = (): CategoriesState => ({
  byId: {},
  collapsed: {},
  requests: {},
});

type SavedCategories = { categories: ChannelCategory[]; collapsed: string[] };

/**
 * Kept on the device with the channels, so the sidebar is laid out at
 * launch the way it was left.
 */
export const categoriesCopy: DeviceCopy<CategoriesState, SavedCategories> = {
  name: "categories",
  version: 1,
  pick: (state) => ({
    categories: Object.values(state.byId),
    collapsed: Object.keys(state.collapsed),
  }),
  restore: (saved) => ({
    byId: putRows({}, saved.categories),
    collapsed: Object.fromEntries(
      saved.collapsed.map((id) => [id, true as const]),
    ),
  }),
};

export type CategoriesBackendPart = Pick<
  CommunitiesBackend,
  "saveCategory" | "deleteCategory" | "setCategoryCollapsed"
>;

export class Categories implements CommunityPart {
  readonly requests: Requests;

  constructor(
    private readonly port: StatePort<CategoriesState>,
    private readonly backend: CategoriesBackendPart,
  ) {
    this.requests = new Requests("categories", port);
  }

  get(categoryId: string): ChannelCategory | undefined {
    return this.port.get().byId[categoryId];
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  takeStructure(structure: CommunityStructure): void {
    const communityId = structure.community.id;
    const state = this.withoutCommunity(communityId);
    const collapsed = { ...state.collapsed };
    for (const id of structure.collapsed_category_ids) collapsed[id] = true;
    this.port.set({
      byId: putRows(state.byId, structure.categories),
      collapsed,
    });
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /** Creates a category, or renames and moves one when `category_id` is given. */
  async save(
    communityId: string,
    name: string,
    options?: { position?: number; category_id?: string },
  ): Promise<ChannelCategory> {
    const category = await this.backend.saveCategory(
      communityId,
      name,
      options,
    );
    this.applyCategory(category);
    return category;
  }

  async remove(categoryId: string): Promise<void> {
    await this.backend.deleteCategory(categoryId);
    this.applyCategoryDeleted(categoryId);
  }

  /** Shown at once; put back if the database refuses. */
  async setCollapsed(categoryId: string, collapsed: boolean): Promise<void> {
    const before = this.port.get().collapsed[categoryId] === true;
    this.writeCollapsed(categoryId, collapsed);
    try {
      await this.backend.setCategoryCollapsed(categoryId, collapsed);
    } catch (error) {
      this.writeCollapsed(categoryId, before);
      throw error;
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /** `category.created` and `category.updated`. */
  applyCategory(category: ChannelCategory): void {
    this.port.set({ byId: putRows(this.port.get().byId, [category]) });
  }

  applyCategoryDeleted(categoryId: string): void {
    const state = this.port.get();
    const { [categoryId]: _collapsed, ...collapsed } = state.collapsed;
    this.port.set({ byId: dropIds(state.byId, [categoryId]), collapsed });
  }

  dropCommunity(communityId: string): void {
    this.port.set(this.withoutCommunity(communityId));
  }

  clear(): void {
    this.requests.clear();
    this.port.set(createCategoriesState());
  }

  // ── Inside ────────────────────────────────────────────────────────────────

  private writeCollapsed(categoryId: string, collapsed: boolean): void {
    const { [categoryId]: _old, ...rest } = this.port.get().collapsed;
    this.port.set({
      collapsed: collapsed ? { ...rest, [categoryId]: true } : rest,
    });
  }

  private withoutCommunity(
    communityId: string,
  ): Pick<CategoriesState, "byId" | "collapsed"> {
    const state = this.port.get();
    const collapsed = { ...state.collapsed };
    for (const category of Object.values(state.byId)) {
      if (category.community_id === communityId) delete collapsed[category.id];
    }
    return {
      byId: dropWhere(
        state.byId,
        (category) => category.community_id === communityId,
      ),
      collapsed,
    };
  }
}
