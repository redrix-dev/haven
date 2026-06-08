import type {
  AuthStorePort,
  UiStorePort,
  UserStatusStorePort,
} from "./sessionStorePorts";

let authStore: AuthStorePort | null = null;
let uiStore: UiStorePort | null = null;
let userStatusStore: UserStatusStorePort | null = null;

export type RegisteredSessionStores = {
  authStore: AuthStorePort;
  uiStore: UiStorePort;
  userStatusStore: UserStatusStorePort;
};

export function registerSessionStores(stores: RegisteredSessionStores): void {
  authStore = stores.authStore;
  uiStore = stores.uiStore;
  userStatusStore = stores.userStatusStore;
}

export function resetSessionStores(): void {
  authStore = null;
  uiStore = null;
  userStatusStore = null;
}

export function requireAuthStore(): AuthStorePort {
  if (!authStore) {
    throw new Error(
      "Auth store is not initialized. The host app must register session stores before use.",
    );
  }
  return authStore;
}

export function requireUiStore(): UiStorePort {
  if (!uiStore) {
    throw new Error(
      "UI store is not initialized. The host app must register session stores before use.",
    );
  }
  return uiStore;
}

export function requireUserStatusStore(): UserStatusStorePort {
  if (!userStatusStore) {
    throw new Error(
      "User status store is not initialized. The host app must register session stores before use.",
    );
  }
  return userStatusStore;
}
