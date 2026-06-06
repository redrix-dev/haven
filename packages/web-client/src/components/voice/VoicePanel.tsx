import React from 'react';

type VoicePanelProps = {
  layout?: 'embedded' | 'popout';
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function VoicePanel({ layout = 'embedded', title, subtitle, children }: VoicePanelProps) {
  return (
    <section
      className={`rounded-lg border border-border bg-surface-app text-white ${
        layout === 'popout' ? 'h-full' : ''
      }`}
    >
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
