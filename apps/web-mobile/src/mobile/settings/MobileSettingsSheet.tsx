/**
 * MobileSettingsSheet — composition-based full-height mobile bottom sheet.
 *
 * Usage:
 *
 *   <MobileSettingsSheet open={open} onClose={onClose} title="Server Settings">
 *     <MobileSettingsSheet.Nav>
 *       <MobileSettingsSheet.NavItem page="overview" icon={<Settings2Icon />} label="Overview" />
 *       <MobileSettingsSheet.NavItem page="roles" icon={<ShieldIcon />} label="Roles" />
 *     </MobileSettingsSheet.Nav>
 *
 *     <MobileSettingsSheet.Page id="overview">
 *       <OverviewContent />
 *     </MobileSettingsSheet.Page>
 *     <MobileSettingsSheet.Page id="roles">
 *       <RolesContent />
 *     </MobileSettingsSheet.Page>
 *   </MobileSettingsSheet>
 *
 * Navigation: tapping a NavItem slides to its Page. The back button
 * in the header returns to the nav list. Backdrop click closes the sheet.
 */
import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  MobileScrollableBody,
  MobileSheet,
  MobileSheetCloseButton,
  MobileSheetHandle,
  MobileSheetHeader,
  MobileSheetTitle,
} from '@web-mobile/mobile/layout/MobileSurfacePrimitives';

// ── Context ───────────────────────────────────────────────────────────────────

type SheetContextValue = {
  activePage: string | null;
  setActivePage: (page: string | null) => void;
};

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheet(): SheetContextValue {
  const ctx = React.useContext(SheetContext);
  if (!ctx) throw new Error('MobileSettingsSheet sub-components must be inside <MobileSettingsSheet>');
  return ctx;
}

// ── Nav ───────────────────────────────────────────────────────────────────────

interface NavProps {
  children: React.ReactNode;
  className?: string;
}

function Nav({ children, className }: NavProps) {
  const { activePage } = useSheet();
  if (activePage !== null) return null;

  return (
    <div className={className ?? 'px-4 py-3'}>
      <div className="rounded-xl bg-white/3 border border-white/5 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ── NavItem ───────────────────────────────────────────────────────────────────

interface NavItemProps {
  page: string;
  icon?: React.ReactNode;
  label: string;
  description?: string;
}

function NavItem({ page, icon, label, description }: NavItemProps) {
  const { setActivePage } = useSheet();

  return (
    <button
      type="button"
      onClick={() => setActivePage(page)}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors border-b border-white/5 last:border-b-0 text-left"
    >
      {icon && <span className="text-gray-400 shrink-0 w-5 flex items-center justify-center">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
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
  const { activePage } = useSheet();
  if (activePage !== id) return null;
  return <div className={className ?? 'flex-1'}>{children}</div>;
}

// ── Section ───────────────────────────────────────────────────────────────────

interface SectionProps {
  label?: string;
  children: React.ReactNode;
  className?: string;
}

function Section({ label, children, className }: SectionProps) {
  return (
    <div className={`mb-4 ${className ?? ''}`}>
      {label && (
        <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-2 px-1">
          {label}
        </p>
      )}
      <div className="rounded-xl bg-white/3 border border-white/5 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  label: string;
  description?: string;
  children?: React.ReactNode;
  destructive?: boolean;
  onClick?: () => void;
}

function Row({ label, description, children, destructive, onClick }: RowProps) {
  const base = 'w-full flex items-center justify-between gap-3 px-4 py-3.5 border-b border-white/5 last:border-b-0 text-left';

  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${destructive ? 'text-red-400' : 'text-gray-200'}`}>{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} hover:bg-white/5 active:bg-white/10 transition-colors`}>
        {content}
      </button>
    );
  }

  return <div className={base}>{content}</div>;
}

// ── Main component ────────────────────────────────────────────────────────────

interface MobileSettingsSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function MobileSettingsSheetRoot({ open, onClose, title, children }: MobileSettingsSheetProps) {
  const [activePage, setActivePage] = React.useState<string | null>(null);

  // Reset to nav list whenever sheet closes
  React.useEffect(() => {
    if (!open) setActivePage(null);
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = () => {
    if (activePage !== null) {
      setActivePage(null);
    } else {
      onClose();
    }
  };

  return (
    <SheetContext.Provider value={{ activePage, setActivePage }}>
      <MobileSheet
        open={open}
        onClose={handleBackdropClick}
        label={title}
        id={`mobile-settings-sheet:${title}`}
      >
        <MobileSheetHandle />
        <MobileSheetHeader>
          {activePage !== null && (
            <button
              type="button"
              onClick={() => setActivePage(null)}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors -ml-1 shrink-0"
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5 text-gray-300" />
            </button>
          )}
          <MobileSheetTitle>{title}</MobileSheetTitle>
          <MobileSheetCloseButton onClick={onClose} />
        </MobileSheetHeader>

        <MobileScrollableBody>
          {children}
        </MobileScrollableBody>
      </MobileSheet>
    </SheetContext.Provider>
  );
}

// Attach sub-components
export const MobileSettingsSheet = Object.assign(MobileSettingsSheetRoot, {
  Nav,
  NavItem,
  Page,
  Section,
  Row,
});
