import React from 'react';
import { createRoot } from 'react-dom/client';
import { createHavenSupabaseClient } from '@shared/lib/createHavenSupabaseClient';
import { initializeHavenDataFromClient } from '@shared/lib/bootstrap/initializeHavenDataFromClient';
import { TooltipProvider } from '@shared/app/ui/tooltip';
import { Toaster as SonnerToaster } from 'sonner';
import { AppRoot } from '@shared/app/AppRoot';
import '@shared/styles/globals.css';
import { applyThemeWeb } from './lib/theme';
import { getTheme } from '@shared/themes';

applyThemeWeb(getTheme('default').tokens);

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
initializeHavenDataFromClient(havenWebClient, {
  supabaseUrl,
  supabaseAnonKey,
});

document.documentElement.classList.add('haven-web-shell');
document.body.classList.add('haven-web-shell');

const appHost = document.getElementById('haven-web-root') ?? document.body;
const root = createRoot(appHost);

root.render(
  <TooltipProvider>
    <>
      <AppRoot />

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
            color: '#ffffff',
            border: '1px solid var(--primary-hover)',
          },
          cancelButtonStyle: {
            background: 'var(--muted)',
            color: '#ffffff',
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
