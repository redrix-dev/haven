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
      className={`rounded-lg border border-[#304867] bg-[#111a2b] text-white ${
        layout === 'popout' ? 'h-full' : ''
      }`}
    >
      <header className="border-b border-[#304867] px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-[#a9b8cf]">{subtitle}</p> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
