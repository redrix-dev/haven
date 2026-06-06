import { bootLogger } from '@shared/debug/bootLogger';
bootLogger.mark('js-entry');

import React from 'react';
import { createRoot } from 'react-dom/client';
import { createHavenSupabaseClient } from '@shared/lib/createHavenSupabaseClient';
import { createHavenCore, createMemoryPersistence } from '@shared/core';
import { TooltipProvider } from '@shared/app/ui/tooltip';
import { Toaster as SonnerToaster } from 'sonner';
import { AppRoot } from '@web-client/AppRoot';
import { BootLogPanel } from '@web-client/debug/BootLogPanel';
import { registerWebAppHost } from '@web-client/infrastructure/platform/webAppHost';
import '@shared/styles/globals.css';
import { applyShellThemeTokens, setShellThemeApplier } from '@web-client/shellThemeRegistry';
import { readSessionStoredThemeId } from '@shared/themes/sessionThemeStorage';
import { getTheme } from '@shared/themes/registry';
import { applyThemeWeb } from './lib/theme';

registerWebAppHost();
bootLogger.mark('app-host-registered');
setShellThemeApplier(applyThemeWeb);
applyShellThemeTokens(getTheme(readSessionStoredThemeId() ?? 'default').tokens);
bootLogger.mark('theme-applied');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_URL / SUPABASE_ANON_KEY for web bootstrap.');
}
const havenWebClient = createHavenSupabaseClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: false,
  },
});
bootLogger.mark('supabase-client-created');
createHavenCore({
  client: havenWebClient,
  publicConfig: { supabaseUrl, supabaseAnonKey },
  persistence: createMemoryPersistence(),
});
bootLogger.mark('core-created');

document.documentElement.classList.add('haven-web-shell');
document.body.classList.add('haven-web-shell');

const appHost = document.getElementById('haven-web-root') ?? document.body;
const root = createRoot(appHost);

bootLogger.mark('react-render-start');
root.render(
  <TooltipProvider>
    <>
      <AppRoot />
      <BootLogPanel />

      <SonnerToaster
        position="top-right"
        theme="dark"
        closeButton
        toastOptions={{
          className:
            '!bg-surface-toast !border !border-border !text-white !shadow-2xl',
          descriptionClassName: '!text-muted-foreground',
          classNames: {
            actionButton:
              '!bg-primary !text-white !border !border-primary-hover hover:!bg-primary-hover focus:!ring-2 focus:!ring-ring-focus focus:!ring-offset-0',
            cancelButton:
              '!bg-muted !text-white !border !border-border hover:!bg-secondary',
          },
          actionButtonStyle: {
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            border: '1px solid var(--primary-hover)',
          },
          cancelButtonStyle: {
            background: 'var(--muted)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          },
          style: {
            background: 'var(--surface-toast)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          },
        }}
      />
    </>
  </TooltipProvider>
);
