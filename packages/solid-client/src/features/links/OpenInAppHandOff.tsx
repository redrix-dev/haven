import { onMount } from "solid-js";

/**
 * Browser-side hand-off to the installed desktop app, shown over whatever the
 * route renders underneath (the invite screen, or sign-in when signed out).
 *
 * It asks the browser to open `appLink` once on arrival. With Haven installed
 * the browser shows its own "Open Haven?" prompt; without it nothing happens.
 * Neither outcome is visible to the page, so both buttons stay: "Open Haven"
 * retries (browsers can block a launch that wasn't clicked), and "Continue in
 * browser" hands the link to the web app.
 */
export function OpenInAppHandOff(props: {
  appLink: string;
  onContinueInBrowser: () => void;
}) {
  onMount(() => window.location.assign(props.appLink));

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <div class="w-full max-w-sm space-y-4 rounded-xl bg-card p-8 text-center shadow-lg">
        <h1 class="text-lg font-semibold text-foreground">Opening Haven…</h1>
        <p class="text-sm text-muted-foreground">
          If Haven is installed, your browser will ask to open it. Tick “Always
          allow” there to skip this step next time.
        </p>
        <a
          href={props.appLink}
          class="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Open Haven
        </a>
        <button
          type="button"
          onClick={() => props.onContinueInBrowser()}
          class="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          Continue in browser
        </button>
      </div>
    </div>
  );
}
