import React from 'react';

const IOS_APP_STORE_URL = process.env.VITE_IOS_APP_STORE_URL?.trim() ?? '';
const ANDROID_PLAY_STORE_URL = process.env.VITE_ANDROID_PLAY_STORE_URL?.trim() ?? '';

const buildSchemeFallbackUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';

    if (pathname === '/auth/confirm') {
      return `haven://auth/confirm${parsed.search}${parsed.hash}`;
    }

    if (pathname.startsWith('/invite/')) {
      const inviteCode = pathname.slice('/invite/'.length);
      return inviteCode ? `haven://invite/${inviteCode}` : null;
    }

    if (pathname === '/invite') {
      const inviteCode =
        parsed.searchParams.get('code')?.trim() ??
        parsed.searchParams.get('invite')?.trim() ??
        '';
      return inviteCode ? `haven://invite/${inviteCode}` : null;
    }

    return null;
  } catch {
    return null;
  }
};

export function MobileRedirectPage() {
  const currentUrl = typeof window === 'undefined' ? '' : window.location.href;
  const universalLinkUrl = currentUrl || process.env.PUBLIC_WEBCLIENT_URL || '/';
  const schemeFallbackUrl = buildSchemeFallbackUrl(currentUrl);

  return (
    <main className="min-h-screen bg-[#111a2b] px-6 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center gap-6">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.28em] text-[#7f93b3]">
            Mobile App Required
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">Open Haven in the native app.</h1>
          <p className="text-base leading-7 text-[#b9c7dc]">
            Mobile browser access is no longer the supported chat runtime. Use the native Haven app
            for messaging, calls, notifications, and keyboard-safe composer behavior.
          </p>
        </div>

        <div className="rounded-3xl border border-[#2c4061] bg-[#162238] p-5 text-sm text-[#c6d3e8]">
          <p className="font-medium text-white">Link context</p>
          <p className="mt-2 break-all text-[#8ea3c3]">{currentUrl}</p>
        </div>

        <div className="flex flex-col gap-3">
          <a
            href={universalLinkUrl}
            className="inline-flex items-center justify-center rounded-2xl bg-[#3f79d8] px-4 py-4 font-medium text-white transition hover:bg-[#3567b6]"
          >
            Open Haven App
          </a>
          {schemeFallbackUrl ? (
            <a
              href={schemeFallbackUrl}
              className="inline-flex items-center justify-center rounded-2xl border border-[#325fae] bg-[#1b3c68] px-4 py-4 font-medium text-white transition hover:bg-[#23497d]"
            >
              Open Via Fallback Link
            </a>
          ) : null}
          {IOS_APP_STORE_URL ? (
            <a
              href={IOS_APP_STORE_URL}
              className="inline-flex items-center justify-center rounded-2xl border border-[#304867] bg-[#162238] px-4 py-4 font-medium text-[#d9e5f7] transition hover:bg-[#22324d]"
            >
              Download on the App Store
            </a>
          ) : null}
          {ANDROID_PLAY_STORE_URL ? (
            <a
              href={ANDROID_PLAY_STORE_URL}
              className="inline-flex items-center justify-center rounded-2xl border border-[#304867] bg-[#162238] px-4 py-4 font-medium text-[#d9e5f7] transition hover:bg-[#22324d]"
            >
              Get it on Google Play
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-2xl border border-[#304867] bg-[#1a2740] px-4 py-4 font-medium text-[#d9e5f7] transition hover:bg-[#22324d]"
          >
            Retry After Installing
          </button>
        </div>
      </div>
    </main>
  );
}
