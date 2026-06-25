import type { HavenBackends } from "@shared/core/backends";

let sessionBackends: HavenBackends | null = null;

export function registerSessionBackends(backends: HavenBackends): void {
  sessionBackends = backends;
}

export function resetSessionBackends(): void {
  sessionBackends = null;
}

export function requireSessionBackends(): HavenBackends {
  if (!sessionBackends) {
    throw new Error(
      "Session backends are not initialized. The host app must create HavenReactCore before calling backend accessors.",
    );
  }
  return sessionBackends;
}
