/**
 * Optional: granular timing + stacks for avatar tap → ImagePicker open.
 *
 * **Enable:** set `AVATAR_PICK_DEBUG` to `true` below (development builds only).
 *
 * **Remove entirely:** delete this file and remove imports + `avatarPick*` calls from
 * `useProfileAvatarPicker.tsx` (search: `AvatarPickTiming` / `avatarPickInstrumentation`).
 */

/** Set to `true` when investigating picker latency; keep `false` for quiet dev consoles. */
const AVATAR_PICK_DEBUG = false;

/** Logs only run in `__DEV__` builds when `AVATAR_PICK_DEBUG` is true — never in release/TestFlight. */
export const AVATAR_PICK_INSTRUMENTATION_ENABLED =
    typeof __DEV__ !== "undefined" && __DEV__ && AVATAR_PICK_DEBUG;

const PREFIX = "[AvatarPickTiming]";

let sessionSeq = 0;

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function trimStack(stack: string | undefined, maxLines: number): string | undefined {
    if (!stack) return undefined;
    return stack.split("\n").slice(0, maxLines).join("\n");
}

export type AvatarPickSession = {
    id: number;
    t0: number;
};

/**
 * Call at the very start of `pickAvatar` (first line). Logs stack at tap dispatch.
 */
export function avatarPickSessionStart(): AvatarPickSession {
    if (!AVATAR_PICK_INSTRUMENTATION_ENABLED) {
        return { id: -1, t0: 0 };
    }
    sessionSeq += 1;
    const id = sessionSeq;
    const t0 = nowMs();
    let stack: string | undefined;
    try {
        stack = trimStack(new Error().stack, 20);
    } catch {
        stack = "(stack capture failed)";
    }
    try {
        // eslint-disable-next-line no-console -- intentional debug instrumentation
        console.log(
            PREFIX,
            JSON.stringify({
                phase: "01_pick_avatar_invoked",
                sessionId: id,
                t0Ms: t0,
                stack,
            }),
        );
    } catch {
        // Avoid crashing if console/stringify misbehaves during Hermes edge cases.
    }
    return { id, t0 };
}

export function avatarPickLog(
    session: AvatarPickSession,
    phase: string,
    extra?: Record<string, unknown>,
): void {
    if (!AVATAR_PICK_INSTRUMENTATION_ENABLED || session.id < 0) return;
    const dt = nowMs() - session.t0;
    try {
        // eslint-disable-next-line no-console -- intentional debug instrumentation
        console.log(
            PREFIX,
            JSON.stringify({
                phase,
                sessionId: session.id,
                dtMsSinceStart: Number(dt.toFixed(3)),
                ...extra,
            }),
        );
    } catch {
        // ignore
    }
}

/** Optional: microtask tick after sync work (scheduling boundary). */
export function avatarPickNextMicrotask(session: AvatarPickSession, phase: string): void {
    if (!AVATAR_PICK_INSTRUMENTATION_ENABLED || session.id < 0) return;
    queueMicrotask(() => {
        avatarPickLog(session, phase);
    });
}
