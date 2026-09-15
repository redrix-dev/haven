import { A } from "@solidjs/router";

/** Catch-all route: an address nothing in this build handles. */
export function UnrecognizedLinkView() {
  return (
    <div class="flex h-full w-full items-center justify-center bg-background p-6">
      <div class="w-full max-w-sm space-y-3 rounded-xl bg-card p-8 text-center shadow-lg">
        <h1 class="text-lg font-semibold text-foreground">
          Haven can't open this page
        </h1>
        <p class="text-sm text-muted-foreground">
          The link may be broken, or it may need a newer version of Haven.
        </p>
        <A
          href="/"
          class="inline-block text-sm font-medium text-primary hover:underline"
        >
          Go to Haven
        </A>
      </div>
    </div>
  );
}
