export const ELECTRON_DEV_THEME_CHANGED_EVENT = 'haven:electron-dev-theme-changed';

export type ElectronDevThemeChangedDetail = {
  themeId: string;
};

export function notifyElectronDevThemeChanged(themeId: string): void {
  window.dispatchEvent(
    new CustomEvent<ElectronDevThemeChangedDetail>(ELECTRON_DEV_THEME_CHANGED_EVENT, {
      detail: { themeId },
    })
  );
}

export function getElectronDevThemeChangedThemeId(event: Event): string | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail = event.detail as Partial<ElectronDevThemeChangedDetail> | undefined;
  return typeof detail?.themeId === 'string' ? detail.themeId : null;
}
