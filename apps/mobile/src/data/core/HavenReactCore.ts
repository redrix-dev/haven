import type { StoreApi } from "zustand/vanilla";
import {
  HavenCore,
  type StoreName,
  type StoreStates,
} from "@shared/collections/core/havenCore";
import {
  createLinkPipeline,
  type LinkPipeline,
} from "@shared/core/linkPipeline";
import type { DevicePersistence } from "@shared/core/persistence/DevicePersistence";
import { displayName } from "@shared/collections/members/selectors";
import { createBackend, type Backend } from "@shared/lib/backend";
import type { OnboardingContext } from "@shared/lib/backend/people";
import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** Every store the core made, as vanilla Zustand stores the hooks subscribe to. */
export type ReactStores = {
  readonly [N in StoreName]: StoreApi<StoreStates[N]>;
};

export type HavenReactCoreOptions = {
  client: HavenSupabaseClient;
  /** MMKV on the phone. */
  persistence: DevicePersistence;
  /** Where the app runs, which decides the introductions offered. */
  context: OnboardingContext;
  /** The backend clients over `client`; tests pass a fake instead. */
  backend?: Backend;
};

/**
 * The shared HavenCore with Zustand stores, for the phone.
 *
 * Every collection writes through a store made here, and `stores` holds each
 * one by name. Screens read them with `useStore` / `useCore` through the
 * collections' selectors and call the core's and the collections' commands;
 * nothing is written to a store from a screen. docs/architecture/COLLECTIONS.md.
 */
export class HavenReactCore extends HavenCore {
  readonly client: HavenSupabaseClient;
  readonly stores: ReactStores;
  /** Every incoming link, on every delivery path (features/links). */
  readonly links: LinkPipeline;

  constructor(options: HavenReactCoreOptions) {
    const stores: Partial<Record<StoreName, StoreApi<object>>> = {};
    super({
      backend: options.backend ?? createBackend(options.client),
      storage: options.persistence,
      context: options.context,
      makePort: (name, initial) => {
        const port = createZustandStatePort(initial);
        stores[name] = port.store as StoreApi<object>;
        return port;
      },
    });
    this.client = options.client;
    this.stores = stores as unknown as ReactStores;
    this.links = createLinkPipeline({ persistence: options.persistence });
  }

  /** Where someone's picture is, or null without one (or before their profile is held). */
  avatarUrl(userId: string): string | null {
    const profile = this.stores.profiles.getState().byId[userId];
    return profile ? this.backend.media.avatarUrl(profile) : null;
  }

  /**
   * What to call someone: their nickname in the community, else their
   * username. A deleted account, or a profile not held yet, has a stand-in.
   * Not reactive: in a component use `useNameOf`.
   */
  nameOf(userId: string, communityId?: string | null): string {
    const profiles = this.stores.profiles.getState();
    const profile = profiles.byId[userId];
    if (profile?.deleted) return "Deleted user";
    const name = communityId
      ? displayName(
          this.stores.members.getState(),
          profiles,
          communityId,
          userId,
        )
      : (profile?.username ?? null);
    return name ?? "…";
  }

  /** The signed-in person's id. Only call it where someone is signed in. */
  me(): string {
    const userId = this.userId;
    if (!userId) throw new Error("Nobody is signed in.");
    return userId;
  }
}
