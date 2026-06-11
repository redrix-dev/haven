import { Match, Switch } from "solid-js";
import { Navigate } from "@solidjs/router";
import type { RouteDefinition, RouteSectionProps } from "@solidjs/router";
import { useSession } from "../contexts/SessionProvider";
import { DevHarness } from "../components/DevLogin";
import { CommunitySidebar } from "../features/community";
import { SignInScreen } from "../features/auth";

/**
 * The registration point: every screen the app can navigate to is one entry
 * here, pointing at a feature's public surface (its index barrel). Popout
 * windows are routes too — a Tauri window is just an OS viewport pointed at
 * an address. Contract: docs/architecture/SOLID_CLIENT_SHAPE.md.
 *
 * Adding a feature = its folder in features/ + one entry here. App.tsx does
 * not change.
 */

// Guards all routes under "/" — handles the three states of session():
//
//   undefined  Supabase hasn't resolved yet (getSession() is async). Show a
//              blank screen rather than flashing the sign-in redirect.
//   null       Confirmed no session. Redirect to /sign-in.
//   Session    Authenticated. Render the app layout with the sidebar.
//
// <Switch> + <Match> is Solid's multi-branch conditional — like a type-safe
// switch statement in JSX. Only the first matching <Match> renders.
function AppLayout(props: RouteSectionProps) {
  const { session } = useSession();

  return (
    <Switch>
      <Match when={session() === undefined}>
        {/* Still resolving — render nothing to avoid a flash redirect */}
        <div class="h-full w-full bg-background" />
      </Match>

      <Match when={session() === null}>
        <Navigate href="/sign-in" />
      </Match>

      <Match when={session()}>
        <div class="flex h-full w-full overflow-hidden bg-surface-1">
          <CommunitySidebar />
          <main class="flex flex-1 flex-col overflow-hidden">
            {props.children}
          </main>
        </div>
      </Match>
    </Switch>
  );
}

export const routes: RouteDefinition[] = [
  // Unauthenticated — no layout wrapper, full screen.
  { path: "/sign-in", component: SignInScreen },

  // Authenticated — AppLayout guards entry, sidebar + content shell.
  {
    path: "/",
    component: AppLayout,
    children: [
      // Disposable dev panel (session info + theme probe). Replaced by the
      // real home screen when the playground feature lands.
      { path: "/", component: DevHarness },
    ],
  },
];
