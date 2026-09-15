/**
 * Offers to hand the page's destination to the installed app. Props-only, so it
 * stays a `ui` element: the caller decides whether an app could be there
 * (browser, not the desktop shell) and builds the `haven://` link.
 */
export function OpenInAppBanner(props: { href: string; label: string }) {
  return (
    <div class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <p class="text-sm text-muted-foreground">{props.label}</p>
      <a
        href={props.href}
        class="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Open in Haven
      </a>
    </div>
  );
}
