import React from 'react';
import { readSessionStoredThemeId } from '@shared/themes/sessionThemeStorage';
import { getTheme } from '@shared/themes/registry';
import { semanticToPrimitive } from '@shared/themes/semantics';
import {
  ELECTRON_DEV_THEME_CHANGED_EVENT,
  getElectronDevThemeChangedThemeId,
} from './themeDemoEvents';

const THEME_LAB_HOTKEY_LABEL = 'Ctrl/Cmd + Alt + Shift + L';

type PreviewMode = 'desktop' | 'mobile';
type LabelMode = 'app' | 'authoring';
type MobileLabView = 'surface-map' | 'home' | 'community' | 'dm';

type TokenSpec = {
  name: string;
  note: string;
};

const mobileLabViews: Array<{ id: MobileLabView; label: string }> = [
  { id: 'surface-map', label: 'Surface Map' },
  { id: 'home', label: 'Home' },
  { id: 'community', label: 'Community' },
  { id: 'dm', label: 'DM' },
];

const authoringTokens: TokenSpec[] = [
  { name: 'surface-0', note: 'deepest shell / embedded wells' },
  { name: 'surface-1', note: 'app background' },
  { name: 'surface-2', note: 'side panels' },
  { name: 'surface-3', note: 'cards and message rows' },
  { name: 'surface-3b', note: 'modals and list hover' },
  { name: 'surface-4', note: 'hover and secondary surfaces' },
  { name: 'surface-5', note: 'inputs and controls' },
  { name: 'border-subtle', note: 'soft/inset borders' },
  { name: 'border-default', note: 'default/control borders' },
  { name: 'primary', note: 'brand/action color' },
  { name: 'primary-hover', note: 'brand hover/accent state' },
];

const surfaceTokens: TokenSpec[] = [
  { name: 'surface-app', note: 'main app background' },
  { name: 'surface-desktop-shell', note: 'desktop title shell' },
  { name: 'surface-panel', note: 'side panels' },
  { name: 'surface-modal', note: 'cards and modals' },
  { name: 'surface-input', note: 'inputs and composer' },
  { name: 'surface-hover', note: 'hover state' },
  { name: 'surface-message-row', note: 'message rows' },
  { name: 'surface-footer-bar', note: 'composer footer' },
  { name: 'surface-embedded', note: 'nested wells' },
  { name: 'surface-card-deep', note: 'deep cards' },
];

const borderTokens: TokenSpec[] = [
  { name: 'border', note: 'default border' },
  { name: 'border-panel', note: 'panel borders' },
  { name: 'border-control', note: 'inputs and controls' },
  { name: 'border-selected', note: 'selection emphasis' },
  { name: 'border-message-row', note: 'message divider' },
];

const textTokens: TokenSpec[] = [
  { name: 'foreground', note: 'primary text' },
  { name: 'muted-foreground', note: 'secondary labels' },
  { name: 'body-soft', note: 'body copy' },
  { name: 'form-label', note: 'form labels' },
  { name: 'link-bright', note: 'bright links' },
  { name: 'chip-muted', note: 'muted chips' },
];

const accentTokens: TokenSpec[] = [
  { name: 'primary', note: 'primary action' },
  { name: 'primary-hover', note: 'primary hover' },
  { name: 'destructive', note: 'danger action' },
  { name: 'status-online', note: 'online status' },
  { name: 'status-away', note: 'away status' },
  { name: 'status-dnd', note: 'do not disturb' },
  { name: 'accent-slider', note: 'sliders/meters' },
  { name: 'accent-amber', note: 'warm accent' },
];

function resolveTokenLabelName(name: string, labelMode: LabelMode): string {
  if (labelMode === 'app') return name;
  return semanticToPrimitive[name as keyof typeof semanticToPrimitive] ?? name;
}

function formatTokenLabel(name: string, labelMode: LabelMode): string {
  return `--${resolveTokenLabelName(name, labelMode)}`;
}

function TokenLabel({ name, labelMode }: { name: string; labelMode: LabelMode }) {
  return (
    <span className="inline-flex rounded bg-black/35 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/85 shadow-sm">
      {formatTokenLabel(name, labelMode)}
    </span>
  );
}

function TokenSwatch({ token }: { token: TokenSpec }) {
  return (
    <div className="grid grid-cols-[2.25rem_1fr] gap-2 rounded-lg border border-border bg-surface-embedded p-2">
      <div
        className="h-9 rounded-md border border-white/15 shadow-inner"
        style={{ backgroundColor: `var(--${token.name})` }}
      />
      <div className="min-w-0">
        <p className="truncate font-mono text-[11px] text-white">--{token.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">{token.note}</p>
      </div>
    </div>
  );
}

function TokenGroup({ title, tokens }: { title: string; tokens: TokenSpec[] }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-2">
        {tokens.map((token) => (
          <TokenSwatch key={token.name} token={token} />
        ))}
      </div>
    </section>
  );
}

function MiniSegmentedButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground'
          : 'rounded-md border border-border bg-surface-panel px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-hover hover:text-white'
      }
    >
      {children}
    </button>
  );
}

function DesktopPreview({ labelMode }: { labelMode: LabelMode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-app shadow-2xl">
      <div className="flex h-8 items-center justify-between border-b border-border-titlebar bg-surface-desktop-shell px-3 text-xs text-muted-foreground">
        <TokenLabel name="surface-desktop-shell" labelMode={labelMode} />
        <span className="font-semibold text-muted-foreground">Haven Desktop Theme Lab</span>
        <span>window controls</span>
      </div>
      <div className="flex h-[520px]">
        <aside className="flex w-16 flex-col items-center gap-3 border-r border-sidebar-border bg-sidebar py-4">
          <TokenLabel name="sidebar" labelMode={labelMode} />
          {['H', 'D', 'V', '+'].map((label, index) => (
            <div
              key={label}
              className={
                index === 0
                  ? 'grid size-10 place-items-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground'
                  : 'grid size-10 place-items-center rounded-2xl bg-sidebar-accent text-sm font-bold text-sidebar-accent-foreground'
              }
            >
              {label}
            </div>
          ))}
        </aside>

        <aside className="w-56 border-r border-border-panel bg-surface-panel p-3">
          <div className="mb-3 flex items-center justify-between">
            <TokenLabel name="surface-panel" labelMode={labelMode} />
            <span className="rounded bg-surface-hover px-2 py-1 text-[10px] text-muted-foreground">
              {formatTokenLabel('surface-hover', labelMode)}
            </span>
          </div>
          {['announcements', 'general-chat', 'design-review', 'voice-lounge'].map((channel, index) => (
            <div
              key={channel}
              className={
                index === 1
                  ? 'mb-1 rounded-lg border border-border-selected bg-surface-row-selected px-3 py-2 text-sm text-white'
                  : 'mb-1 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-surface-list-hover'
              }
            >
              # {channel}
            </div>
          ))}
          <div className="mt-4 rounded-lg border border-border-inset-panel bg-surface-embedded p-3">
            <TokenLabel name="surface-embedded" labelMode={labelMode} />
            <p className="mt-2 text-xs text-muted-foreground">Nested diagnostic well</p>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-surface-app">
          <header className="flex items-center justify-between border-b border-border bg-surface-card-deep px-4 py-3">
            <div>
              <TokenLabel name="surface-card-deep" labelMode={labelMode} />
              <h2 className="mt-2 text-lg font-semibold text-white"># general-chat</h2>
            </div>
            <button className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
              {formatTokenLabel('primary', labelMode)}
            </button>
          </header>

          <section className="flex-1 space-y-3 overflow-hidden p-4">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="rounded-xl border border-border-message-row bg-surface-message-row p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="size-9 rounded-full bg-primary" />
                  <div>
                    <p className="text-sm font-semibold text-white">Demo Member</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTokenLabel('muted-foreground', labelMode)}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-body-soft">
                  This fake message row uses{' '}
                  <span className="font-mono">{formatTokenLabel('surface-message-row', labelMode)}</span>,
                  message borders, and normal readable body text.
                </p>
              </div>
            ))}
          </section>

          <footer className="border-t border-border bg-surface-footer-bar p-4">
            <TokenLabel name="surface-footer-bar" labelMode={labelMode} />
            <div className="mt-2 rounded-xl border border-border-control bg-surface-input px-4 py-3 text-sm text-muted-foreground">
              {formatTokenLabel('surface-input', labelMode)} / {formatTokenLabel('border-control', labelMode)}{' '}
              composer preview
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

function MobilePreview({ labelMode }: { labelMode: LabelMode }) {
  return (
    <div className="mx-auto w-[390px] rounded-[2rem] border border-border bg-surface-desktop-shell p-3 shadow-2xl">
      <div className="overflow-hidden rounded-[1.5rem] border border-border-panel bg-surface-app">
        <header className="border-b border-border bg-surface-card-deep px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <TokenLabel name="surface-card-deep" labelMode={labelMode} />
            <div className="flex gap-1.5">
              <span className="size-2 rounded-full bg-status-online" />
              <span className="size-2 rounded-full bg-status-away" />
              <span className="size-2 rounded-full bg-status-dnd" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-white">Haven Mobile</h2>
          <p className="text-sm text-muted-foreground">Pseudo native preview</p>
        </header>

        <section className="space-y-3 bg-surface-panel p-4">
          <TokenLabel name="surface-panel" labelMode={labelMode} />
          {['Friends', 'Communities', 'Notifications'].map((item, index) => (
            <div
              key={item}
              className={
                index === 1
                  ? 'rounded-2xl border border-border-selected bg-surface-row-selected p-3'
                  : 'rounded-2xl border border-border bg-surface-modal p-3'
              }
            >
              <p className="text-sm font-semibold text-white">{item}</p>
              <p className="text-xs text-muted-foreground">
                {formatTokenLabel(index === 1 ? 'surface-row-selected' : 'surface-modal', labelMode)}
              </p>
            </div>
          ))}
        </section>

        <section className="space-y-3 bg-surface-app p-4">
          <div className="rounded-2xl border border-border-message-row bg-surface-message-row p-3">
            <TokenLabel name="surface-message-row" labelMode={labelMode} />
            <p className="mt-2 text-sm text-body-soft">
              Mobile chat surfaces should feel just as layered as desktop.
            </p>
          </div>
          <div className="rounded-2xl bg-primary p-3 text-sm font-semibold text-primary-foreground">
            {formatTokenLabel('primary', labelMode)} call to action
          </div>
        </section>

        <footer className="border-t border-border bg-surface-footer-bar p-4">
          <div className="rounded-full border border-border-control bg-surface-input px-4 py-3 text-sm text-muted-foreground">
            {formatTokenLabel('surface-input', labelMode)} mobile composer
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[10px] text-chip-muted">
            {['Home', 'DMs', 'Voice', 'Me'].map((tab) => (
              <div key={tab} className="rounded-xl bg-surface-embedded py-2">
                {tab}
              </div>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}

function MobileCurrentHomePreview({ labelMode }: { labelMode: LabelMode }) {
  return (
    <div className="mx-auto w-[390px] rounded-[2rem] border border-border bg-surface-desktop-shell p-3 shadow-2xl">
      <div className="overflow-hidden rounded-[1.5rem] border border-border-panel bg-surface-modal">
        <header className="border-b border-border bg-surface-modal px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <TokenLabel name="surface-modal" labelMode={labelMode} />
            <div className="flex gap-2 text-[10px] text-muted-foreground">
              <span>home</span>
              <span>bell</span>
              <span>dm</span>
              <span>cog</span>
            </div>
          </div>
          <h2 className="text-xl font-bold text-white">Home</h2>
          <p className="text-xs text-muted-foreground">
            Current-ish: navbar and page both lean on {formatTokenLabel('surface-modal', labelMode)}.
          </p>
        </header>

        <section className="grid grid-cols-4 gap-2 bg-surface-modal p-4">
          {['H', 'D', 'M', 'V', 'P', 'G'].map((label) => (
            <div key={label}>
              <div className="grid aspect-square place-items-center rounded-2xl bg-surface-panel text-2xl font-bold text-foreground">
                {label}
              </div>
              <p className="mt-1 truncate text-center text-[10px] text-muted-foreground">Community</p>
            </div>
          ))}
          {['+', '#'].map((label) => (
            <div key={label}>
              <div className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-border-control bg-transparent text-2xl font-light text-foreground">
                {label}
              </div>
              <p className="mt-1 truncate text-center text-[10px] text-muted-foreground">
                {label === '+' ? 'Create' : 'Join'}
              </p>
            </div>
          ))}
        </section>

        <footer className="border-t border-border bg-surface-modal p-4">
          <div className="rounded-xl border border-border-control bg-surface-panel p-3">
            <TokenLabel name="surface-panel" labelMode={labelMode} />
            <p className="mt-2 text-xs text-muted-foreground">
              Opportunity: page canvas could be {formatTokenLabel('surface-app', labelMode)}, nav{' '}
              {formatTokenLabel('surface-card-deep', labelMode)}, and tiles could vary between panel/modal.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

function MobileCurrentCommunityPreview({ labelMode }: { labelMode: LabelMode }) {
  return (
    <div className="mx-auto w-[390px] rounded-[2rem] border border-border bg-surface-desktop-shell p-3 shadow-2xl">
      <div className="overflow-hidden rounded-[1.5rem] border border-border-panel bg-surface-modal">
        <header className="border-b border-border bg-surface-modal px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <TokenLabel name="surface-modal" labelMode={labelMode} />
            <span className="rounded-full bg-surface-panel px-2 py-1 text-[10px] text-muted-foreground">
              # general
            </span>
          </div>
          <h2 className="text-lg font-bold text-white">Design Guild</h2>
          <p className="text-xs text-muted-foreground">Community chat mock, close to current flatter layering.</p>
        </header>

        <section className="space-y-2 bg-surface-modal p-4">
          <div className="rounded-xl border border-border bg-surface-panel p-3">
            <TokenLabel name="surface-panel" labelMode={labelMode} />
            <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
              <span># general</span>
              <span># screenshots</span>
              <span># voice</span>
            </div>
          </div>

          {[0, 1, 2].map((row) => (
            <div key={row} className="rounded-xl border border-border bg-surface-modal p-3">
              <div className="mb-2 flex items-center gap-2">
                <div className="size-8 rounded-full bg-surface-panel" />
                <div>
                  <p className="text-sm font-semibold text-white">Member {row + 1}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatTokenLabel('surface-modal', labelMode)} message area
                  </p>
                </div>
              </div>
              <p className="text-xs text-body-soft">
                Theme changes are subtle here because message rows share the same surface as the screen.
              </p>
            </div>
          ))}
        </section>

        <footer className="border-t border-border bg-surface-modal p-4">
          <div className="rounded-full border border-border-control bg-surface-panel px-4 py-3 text-sm text-muted-foreground">
            Current composer: {formatTokenLabel('surface-panel', labelMode)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Opportunity: message rows could use {formatTokenLabel('surface-message-row', labelMode)} and composer
            chrome {formatTokenLabel('surface-footer-bar', labelMode)}.
          </p>
        </footer>
      </div>
    </div>
  );
}

function MobileCurrentDmPreview({ labelMode }: { labelMode: LabelMode }) {
  return (
    <div className="mx-auto w-[390px] rounded-[2rem] border border-border bg-surface-desktop-shell p-3 shadow-2xl">
      <div className="overflow-hidden rounded-[1.5rem] border border-border-panel bg-surface-modal">
        <header className="border-b border-border bg-surface-modal px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <TokenLabel name="surface-modal" labelMode={labelMode} />
            <span className="rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">
              3 unread
            </span>
          </div>
          <h2 className="text-lg font-bold text-white">Direct Messages</h2>
          <p className="text-xs text-muted-foreground">Conversation list + selected thread mock.</p>
        </header>

        <section className="grid grid-cols-[8.5rem_1fr] bg-surface-modal">
          <div className="border-r border-border p-3">
            {['Avery', 'Mika', 'Sam'].map((name, index) => (
              <div
                key={name}
                className={
                  index === 1
                    ? 'mb-2 rounded-xl bg-surface-panel p-2'
                    : 'mb-2 rounded-xl bg-transparent p-2'
                }
              >
                <p className="truncate text-xs font-semibold text-white">{name}</p>
                <p className="truncate text-[10px] text-muted-foreground">Last message...</p>
              </div>
            ))}
            <TokenLabel name="surface-panel" labelMode={labelMode} />
          </div>

          <div className="flex h-[360px] flex-col">
            <div className="border-b border-border bg-surface-modal p-3">
              <p className="text-sm font-semibold text-white">Mika</p>
              <p className="text-[10px] text-muted-foreground">active now</p>
            </div>
            <div className="flex-1 space-y-2 bg-surface-modal p-3">
              <div className="max-w-[78%] rounded-2xl bg-surface-panel p-3 text-xs text-body-soft">
                Incoming bubble currently reads like another panel.
              </div>
              <div className="ml-auto max-w-[78%] rounded-2xl bg-primary p-3 text-xs font-semibold text-primary-foreground">
                Primary still pops nicely.
              </div>
              <div className="max-w-[78%] rounded-2xl bg-surface-panel p-3 text-xs text-body-soft">
                More row/bubble variety would make themes louder.
              </div>
            </div>
            <div className="border-t border-border bg-surface-modal p-3">
              <div className="rounded-full border border-border-control bg-surface-panel px-3 py-2 text-xs text-muted-foreground">
                Message Mika...
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-border bg-surface-modal p-3 text-xs text-muted-foreground">
          Opportunity: thread background {formatTokenLabel('surface-app', labelMode)}, bubbles{' '}
          {formatTokenLabel('surface-message-row', labelMode)} / {formatTokenLabel('primary', labelMode)},
          composer {formatTokenLabel('surface-input', labelMode)}.
        </div>
      </div>
    </div>
  );
}

export function ElectronThemeLab() {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<PreviewMode>('desktop');
  const [labelMode, setLabelMode] = React.useState<LabelMode>('app');
  const [mobileView, setMobileView] = React.useState<MobileLabView>('surface-map');
  const [themeId, setThemeId] = React.useState(() => getTheme(readSessionStoredThemeId() ?? 'default').id);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
      if (event.code !== 'KeyL') return;

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
    const handleThemeChanged = (event: Event) => {
      const nextThemeId = getElectronDevThemeChangedThemeId(event);
      if (nextThemeId) {
        setThemeId(getTheme(nextThemeId).id);
      }
    };

    window.addEventListener(ELECTRON_DEV_THEME_CHANGED_EVENT, handleThemeChanged);
    return () => {
      window.removeEventListener(ELECTRON_DEV_THEME_CHANGED_EVENT, handleThemeChanged);
    };
  }, []);

  if (!open) return null;

  const activeTheme = getTheme(themeId);
  const mobilePreview =
    mobileView === 'surface-map' ? (
      <MobilePreview labelMode={labelMode} />
    ) : mobileView === 'home' ? (
      <MobileCurrentHomePreview labelMode={labelMode} />
    ) : mobileView === 'community' ? (
      <MobileCurrentCommunityPreview labelMode={labelMode} />
    ) : (
      <MobileCurrentDmPreview labelMode={labelMode} />
    );

  return (
    <div className="fixed inset-0 z-[998] flex flex-col bg-surface-app text-foreground">
      <header className="flex items-center justify-between border-b border-border bg-surface-desktop-shell px-5 py-3 shadow-xl">
        <div>
          <p className="text-sm font-semibold text-white">Electron Theme Lab</p>
          <p className="text-xs text-muted-foreground">
            {THEME_LAB_HOTKEY_LABEL} / Current theme: {activeTheme.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('desktop')}
            className={
              mode === 'desktop'
                ? 'rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground'
                : 'rounded-md border border-border bg-surface-panel px-3 py-2 text-sm text-white'
            }
          >
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setMode('mobile')}
            className={
              mode === 'mobile'
                ? 'rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground'
                : 'rounded-md border border-border bg-surface-panel px-3 py-2 text-sm text-white'
            }
          >
            Mobile
          </button>
          <button
            type="button"
            onClick={() => setLabelMode((current) => (current === 'app' ? 'authoring' : 'app'))}
            className="rounded-md border border-border bg-surface-panel px-3 py-2 text-sm text-white hover:bg-surface-hover"
          >
            {labelMode === 'app' ? 'App labels' : 'Authoring values'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-border bg-surface-panel px-3 py-2 text-sm text-muted-foreground hover:bg-surface-hover hover:text-white"
          >
            Close
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_22rem] gap-4 overflow-hidden p-4">
        <main className="min-h-0 overflow-auto rounded-2xl border border-border bg-surface-embedded p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">
                {mode === 'desktop' ? 'Desktop surface map' : 'Mobile surface map'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {labelMode === 'app'
                  ? 'Fake components are labeled with the semantic tokens used by app components.'
                  : 'Fake components are labeled with the primitive values you usually edit when making themes.'}
              </p>
              {mode === 'mobile' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {mobileLabViews.map((view) => (
                    <MiniSegmentedButton
                      key={view.id}
                      active={mobileView === view.id}
                      onClick={() => setMobileView(view.id)}
                    >
                      {view.label}
                    </MiniSegmentedButton>
                  ))}
                </div>
              )}
            </div>
            <TokenLabel name="surface-embedded" labelMode={labelMode} />
          </div>
          {mode === 'desktop' ? (
            <DesktopPreview labelMode={labelMode} />
          ) : (
            mobilePreview
          )}
        </main>

        <aside className="min-h-0 overflow-auto rounded-2xl border border-border bg-surface-modal p-4">
          <div className="mb-4 rounded-xl border border-border-inset-panel bg-surface-embedded p-3">
            <p className="text-sm font-semibold text-white">{activeTheme.name}</p>
            <p className="text-xs text-muted-foreground">
              {labelMode === 'app'
                ? 'These swatches read live CSS variables, so they update with the demo cycle.'
                : 'Authoring mode shows the compact palette most built-in themes override.'}
            </p>
          </div>
          <div className="space-y-5">
            {labelMode === 'app' ? (
              <>
                <TokenGroup title="Surfaces" tokens={surfaceTokens} />
                <TokenGroup title="Borders" tokens={borderTokens} />
                <TokenGroup title="Text" tokens={textTokens} />
                <TokenGroup title="Accents" tokens={accentTokens} />
              </>
            ) : (
              <TokenGroup title="Authoring values" tokens={authoringTokens} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
