import { createSignal, type Accessor } from "solid-js";
import type { Notification } from "@shared/lib/backend/records";
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
import { playNotificationSound } from "@solid-client/audio/sounds";
import { createSolidStatePort } from "@solid-client/data/kit/solidStatePort";

/** Every store the core made, as live Solid store proxies. Read them in a tracking scope. */
export type SolidStores = { readonly [N in StoreName]: StoreStates[N] };

export type HavenSolidCoreOptions = {
  client: HavenSupabaseClient;
  /** The device's storage: localStorage on web, the Tauri store on desktop. */
  persistence: DevicePersistence;
  /** Where the app runs, which decides the introductions offered. */
  context: OnboardingContext;
  /** The backend clients over `client`; tests pass a fake instead. */
  backend?: Backend;
};

/**
 * The shared HavenCore with Solid stores, for desktop (Tauri) and web.
 *
 * Every collection writes through a Solid store made here, and `stores` holds
 * each one by name. Screens read `stores` through the collections' selectors
 * and call the core's and the collections' commands; nothing is written to a
 * store from a screen. docs/architecture/COLLECTIONS.md.
 */
export class HavenSolidCore extends HavenCore {
  readonly client: HavenSupabaseClient;
  readonly stores: SolidStores;
  /** Every incoming link, on every delivery path (features/links). */
  readonly links: LinkPipeline;
  /**
   * The notification that arrived last over realtime, for toasts. A new
   * object each time, so the same notification twice is two arrivals.
   */
  readonly arrived: Accessor<{ notification: Notification } | null>;

  constructor(options: HavenSolidCoreOptions) {
    const stores: Partial<Record<StoreName, object>> = {};
    super({
      backend: options.backend ?? createBackend(options.client),
      storage: options.persistence,
      context: options.context,
      makePort: (name, initial, rowKeys) => {
        const port = createSolidStatePort(initial, { keys: rowKeys });
        stores[name] = port.tracked;
        return port;
      },
    });
    this.client = options.client;
    this.stores = stores as SolidStores;
    this.links = createLinkPipeline({
      persistence: options.persistence,
      // On web, links on this deployment's own origin (a preview, local dev)
      // are app links too. Tauri's production origin isn't http(s).
      parse: {
        appOrigins:
          typeof window !== "undefined" &&
          /^https?:$/.test(window.location.protocol)
            ? [window.location.origin]
            : [],
      },
    });
    const [arrived, setArrived] = createSignal<{
      notification: Notification;
    } | null>(null);
    this.arrived = arrived;
    this.listen({
      notification: (notification) => {
        setArrived({ notification });
        if (notification.sound) playNotificationSound();
      },
    });

    // Device copies are written shortly after a change; write them now when
    // the window is hidden or closing, so nothing typed is lost.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.flush();
      });
      window.addEventListener("pagehide", () => this.flush());
    }
  }

  /** Where someone's picture is, or null without one (or before their profile is held). */
  avatarUrl(userId: string): string | null {
    const profile = this.stores.profiles.byId[userId];
    return profile ? this.backend.media.avatarUrl(profile) : null;
  }

  /**
   * What to call someone: their nickname in the community, else their
   * username. A deleted account, or a profile not held yet, has a stand-in.
   */
  nameOf(userId: string, communityId?: string | null): string {
    const profile = this.stores.profiles.byId[userId];
    if (profile?.deleted) return "Deleted user";
    const name = communityId
      ? displayName(
          this.stores.members,
          this.stores.profiles,
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
