import React from 'react';
import { applyShellThemeTokens } from '@shared/app/shellThemeRegistry';
import { readSessionStoredThemeId, writeSessionStoredThemeId } from '@shared/themes/sessionThemeStorage';
import { builtinThemes, getTheme } from '@shared/themes/registry';
import { notifyElectronDevThemeChanged } from './themeDemoEvents';

const THEME_DEMO_HOTKEY_LABEL = 'Ctrl/Cmd + Alt + Shift + T';
const THEME_DEMO_TRANSITION_CLASS = 'haven-theme-demo-transition';
const THEME_DEMO_CYCLE_MS = 6200;

const themeOptions = Object.values(builtinThemes).filter((theme) => theme.status !== 'disabled');

function ThemeDemoStyles() {
  return (
    <style>{`
      html.${THEME_DEMO_TRANSITION_CLASS} *,
      html.${THEME_DEMO_TRANSITION_CLASS} *::before,
      html.${THEME_DEMO_TRANSITION_CLASS} *::after {
        transition:
          background-color 1200ms ease,
          border-color 1200ms ease,
          color 1200ms ease,
          fill 1200ms ease,
          stroke 1200ms ease,
          box-shadow 1200ms ease;
      }
    `}</style>
  );
}

function ThemeNameBadge({ themeName }: { themeName: string }) {
  return (
    <div className="fixed bottom-4 right-4 z-[999] rounded-full border border-border bg-surface-modal/85 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground shadow-xl backdrop-blur">
      {themeName}
    </div>
  );
}

export function ElectronThemeDemoMenu() {
  const [open, setOpen] = React.useState(false);
  const [demoRunning, setDemoRunning] = React.useState(false);
  const [selectedThemeId, setSelectedThemeId] = React.useState(() =>
    getTheme(readSessionStoredThemeId() ?? 'default').id
  );

  const applyTheme = React.useCallback((themeId: string) => {
    const theme = getTheme(themeId);
    applyShellThemeTokens(theme.tokens);
    writeSessionStoredThemeId(theme.id);
    notifyElectronDevThemeChanged(theme.id);
    setSelectedThemeId(theme.id);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
      if (event.code !== 'KeyT') return;

      event.preventDefault();
      event.stopPropagation();
      setOpen((current) => !current);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle(THEME_DEMO_TRANSITION_CLASS, demoRunning);
    return () => {
      document.documentElement.classList.remove(THEME_DEMO_TRANSITION_CLASS);
    };
  }, [demoRunning]);

  React.useEffect(() => {
    if (!demoRunning || themeOptions.length === 0) return;

    const timer = window.setInterval(() => {
      setSelectedThemeId((currentThemeId) => {
        const currentIndex = themeOptions.findIndex((theme) => theme.id === currentThemeId);
        const nextTheme = themeOptions[(currentIndex + 1 + themeOptions.length) % themeOptions.length];
        applyShellThemeTokens(nextTheme.tokens);
        writeSessionStoredThemeId(nextTheme.id);
        notifyElectronDevThemeChanged(nextTheme.id);
        return nextTheme.id;
      });
    }, THEME_DEMO_CYCLE_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [demoRunning]);

  const selectedThemeName = getTheme(selectedThemeId).name;

  if (!open) {
    return (
      <>
        <ThemeDemoStyles />
        {demoRunning && <ThemeNameBadge themeName={selectedThemeName} />}
      </>
    );
  }

  return (
    <>
      <ThemeDemoStyles />
      <ThemeNameBadge themeName={selectedThemeName} />
      <div className="fixed right-4 top-14 z-[1000] w-80 rounded-xl border border-border bg-surface-modal/95 p-4 text-foreground shadow-2xl backdrop-blur">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Theme Demo</p>
            <p className="text-xs text-muted-foreground">{THEME_DEMO_HOTKEY_LABEL}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-hover hover:text-white"
          >
            Close
          </button>
        </div>

        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Theme
        </label>
        <select
          value={selectedThemeId}
          onChange={(event) => applyTheme(event.target.value)}
          className="mb-3 w-full rounded-md border border-border bg-surface-input px-3 py-2 text-sm text-white outline-none focus:border-primary"
        >
          {themeOptions.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setDemoRunning((current) => !current)}
          className={
            demoRunning
              ? 'w-full rounded-md border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover'
              : 'w-full rounded-md border border-border bg-surface-panel px-3 py-2 text-sm font-semibold text-white hover:bg-surface-hover'
          }
        >
          {demoRunning ? 'Pause Theme Cycle' : 'Start Theme Cycle'}
        </button>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Demo mode changes themes every 6.2s with a 1.2s color transition, leaving about 5s of
          still time for screenshots.
        </p>
      </div>
    </>
  );
}
