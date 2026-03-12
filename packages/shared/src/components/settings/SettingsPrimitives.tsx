/**
 * SettingsPrimitives — composable settings shell.
 *
 * Avoids boolean-prop chains by letting each piece declare itself:
 *
 *   <Settings.Root defaultPage="account">
 *     <Settings.Nav>
 *       <Settings.NavItem page="account" icon={<UserIcon />} label="Account" />
 *       <Settings.NavItem page="notifications" icon={<BellIcon />} label="Notifications" />
 *     </Settings.Nav>
 *     <Settings.Page id="account"><AccountContent /></Settings.Page>
 *     <Settings.Page id="notifications"><NotificationContent /></Settings.Page>
 *   </Settings.Root>
 */
import React from 'react';

// ── Context ───────────────────────────────────────────────────────────────────

type SettingsContextValue = {
  activePage: string;
  setActivePage: (page: string) => void;
};

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

export function useSettingsContext(): SettingsContextValue {
  const ctx = React.useContext(SettingsContext);
  if (!ctx) throw new Error('Settings primitives must be used inside <Settings.Root>');
  return ctx;
}

// ── Root ──────────────────────────────────────────────────────────────────────

interface RootProps {
  defaultPage?: string;
  /** Controlled active page — omit for uncontrolled. */
  activePage?: string;
  onPageChange?: (page: string) => void;
  children: React.ReactNode;
  className?: string;
}

function Root({ defaultPage = '', activePage: controlled, onPageChange, children, className }: RootProps) {
  const [internal, setInternal] = React.useState(defaultPage);
  const activePage = controlled ?? internal;

  const setActivePage = React.useCallback(
    (page: string) => {
      setInternal(page);
      onPageChange?.(page);
    },
    [onPageChange]
  );

  return (
    <SettingsContext.Provider value={{ activePage, setActivePage }}>
      <div className={className}>{children}</div>
    </SettingsContext.Provider>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

interface NavProps {
  children: React.ReactNode;
  className?: string;
}

function Nav({ children, className }: NavProps) {
  return <nav className={className}>{children}</nav>;
}

// ── NavItem ───────────────────────────────────────────────────────────────────

interface NavItemProps {
  page: string;
  icon?: React.ReactNode;
  label: string;
  description?: string;
  className?: string;
}

function NavItem({ page, icon, label, description, className }: NavItemProps) {
  const { activePage, setActivePage } = useSettingsContext();

  return (
    <button
      type="button"
      onClick={() => setActivePage(page)}
      data-active={activePage === page}
      className={className}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-sm">{label}</span>
        {description && (
          <span className="block text-xs text-gray-500 mt-0.5">{description}</span>
        )}
      </span>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface PageProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

function Page({ id, children, className }: PageProps) {
  const { activePage } = useSettingsContext();
  if (activePage !== id) return null;
  return <div className={className}>{children}</div>;
}

// ── Section ───────────────────────────────────────────────────────────────────

interface SectionProps {
  label?: string;
  children: React.ReactNode;
  className?: string;
}

function Section({ label, children, className }: SectionProps) {
  return (
    <div className={className}>
      {label && (
        <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-2 px-1">
          {label}
        </p>
      )}
      <div className="rounded-xl bg-white/3 border border-white/5">{children}</div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  label: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

function Row({ label, description, children, className, onClick }: RowProps) {
  const base =
    'w-full flex items-center justify-between gap-3 px-4 py-3.5 border-b border-white/5 last:border-b-0 text-left';
  const interactive = onClick ? 'hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer' : '';

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} ${interactive} ${className ?? ''}`}>
        <div className="min-w-0">
          <p className="text-sm text-gray-200">{label}</p>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </button>
    );
  }

  return (
    <div className={`${base} ${className ?? ''}`}>
      <div className="min-w-0">
        <p className="text-sm text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider({ className }: { className?: string }) {
  return <div className={`h-px bg-white/5 my-4 ${className ?? ''}`} />;
}

// ── Export ────────────────────────────────────────────────────────────────────

export const Settings = {
  Root,
  Nav,
  NavItem,
  Page,
  Section,
  Row,
  Divider,
};
