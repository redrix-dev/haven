import { Show, type Accessor, type JSX } from "solid-js";
import { requireHavenSolidCore } from "../core";

/**
 * Feature-flag UI gating port.
 *
 * Flags are loaded once at bootstrap (HavenSolidCore.loading_session_data) and
 * reset on sign-out, living in `core.featureFlags`. These helpers are the read
 * side: a flag's enabled state is read from the nexus store inside a tracking
 * scope, so anything gated re-renders the moment flags arrive or change.
 *
 * Lives in contexts/ (not components/ui) because it reaches into core, which the
 * ui leaf layer may not import. Features and routes consume it directly.
 */

/** Reactive accessor for whether a single flag is enabled. */
export function useFeatureFlag(flagKey: string): Accessor<boolean> {
  const core = requireHavenSolidCore();
  // Reading the store inside the returned accessor keeps callers reactive.
  return () => Boolean(core.featureFlags.getFlags()[flagKey]);
}

/** Render `children` only when `flag` is enabled; otherwise `fallback` (or nothing). */
export function FeatureGate(props: {
  flag: string;
  children: JSX.Element;
  fallback?: JSX.Element;
}) {
  const enabled = useFeatureFlag(props.flag);
  return <Show when={enabled()} fallback={props.fallback}>{props.children}</Show>;
}
