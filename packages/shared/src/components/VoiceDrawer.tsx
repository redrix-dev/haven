import React from 'react';

type VoiceDrawerProps = {
  layout?: 'modal' | 'popout';
  open: boolean;
  onDismiss?: () => void;
  children: React.ReactNode;
};

export function VoiceDrawer({ layout = 'modal', open, onDismiss, children }: VoiceDrawerProps) {
  if (layout === 'popout') {
    return <div className="h-screen w-screen bg-[#0f1726] p-3">{children}</div>;
  }

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 transition-opacity duration-200 ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onDismiss}
      />
      <div
        className={`relative z-10 w-full max-w-4xl max-h-[88vh] rounded-lg border border-[#304867] bg-[#111a2b] shadow-2xl overflow-hidden transition-all duration-200 ${
          open ? 'translate-y-0 scale-100' : 'translate-y-3 scale-[0.98]'
        }`}
      >
        <div className="scrollbar-inset max-h-[88vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
