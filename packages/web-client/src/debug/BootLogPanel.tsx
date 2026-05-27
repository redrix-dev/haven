/**
 * BootLogPanel — floating overlay that shows the startup timing log.
 *
 * Keyboard shortcut: Ctrl+Shift+L  (Cmd+Shift+L on Mac)
 * Dismiss:           Escape  |  click outside  |  shortcut again
 *
 * Rendered in both browser and Electron entry points.  The panel is always
 * included in the build but has zero overhead when hidden (single event
 * listener + invisible element).
 */
import React from 'react';
import { bootLogger, type BootEvent } from '@shared/debug/bootLogger';

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(3)} s`;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta <= 0) return null;
  const color =
    delta > 500 ? '#ef4444' :
    delta > 150 ? '#f97316' :
    delta > 50  ? '#eab308' :
    '#22c55e';
  return (
    <span style={{ color, fontWeight: 600, marginLeft: 8, fontSize: 11 }}>
      +{formatMs(delta)}
    </span>
  );
}

function EventRow({ event, index }: { event: BootEvent; index: number }) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <td style={{ padding: '3px 8px', color: '#6b7280', fontSize: 11, textAlign: 'right' }}>
        {index}
      </td>
      <td style={{ padding: '3px 8px', color: '#e6edf7', fontFamily: 'monospace', fontSize: 12 }}>
        {event.name}
        {event.data ? (
          <span style={{ color: '#6b7280', marginLeft: 8, fontSize: 10 }}>
            {JSON.stringify(event.data)}
          </span>
        ) : null}
      </td>
      <td style={{ padding: '3px 8px', color: '#a9b8cf', fontSize: 11, textAlign: 'right', fontFamily: 'monospace' }}>
        +{formatMs(event.elapsed)}
      </td>
      <td style={{ padding: '3px 8px', textAlign: 'right' }}>
        <DeltaBadge delta={event.delta} />
      </td>
    </tr>
  );
}

export function BootLogPanel() {
  const [open, setOpen] = React.useState(false);
  const [events, setEvents] = React.useState<BootEvent[]>([]);

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.includes('Mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setEvents([...bootLogger.getEvents()]);
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (!open) return null;

  const total = events[events.length - 1]?.elapsed ?? 0;

  return (
    <div
      role="dialog"
      aria-label="Boot timing log"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0d1626',
          border: '1px solid #304867',
          borderRadius: 10,
          width: 'min(720px, 95vw)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #304867',
          background: '#111a2b',
        }}>
          <div>
            <span style={{ color: '#e6edf7', fontWeight: 600, fontSize: 14 }}>
              Haven Boot Sequence
            </span>
            <span style={{ color: '#a9b8cf', fontSize: 12, marginLeft: 12 }}>
              {events.length} events · total {formatMs(total)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => { bootLogger.printReport(); }}
              style={{
                background: '#16233a',
                border: '1px solid #304867',
                borderRadius: 6,
                color: '#a9b8cf',
                fontSize: 11,
                padding: '3px 10px',
                cursor: 'pointer',
              }}
            >
              Print to console
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                padding: '0 4px',
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {events.length === 0 ? (
            <p style={{ color: '#6b7280', padding: 24, textAlign: 'center', fontSize: 13 }}>
              No boot events recorded yet.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#142033', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '6px 8px', color: '#6b7280', fontSize: 10, textAlign: 'right', width: 36 }}>#</th>
                  <th style={{ padding: '6px 8px', color: '#6b7280', fontSize: 10, textAlign: 'left' }}>Event</th>
                  <th style={{ padding: '6px 8px', color: '#6b7280', fontSize: 10, textAlign: 'right', width: 90 }}>Elapsed</th>
                  <th style={{ padding: '6px 8px', color: '#6b7280', fontSize: 10, textAlign: 'right', width: 90 }}>Δ prev</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, i) => (
                  <EventRow key={i} event={event} index={i} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid #304867',
          background: '#111a2b',
          color: '#6b7280',
          fontSize: 11,
        }}>
          Press <kbd style={{ background: '#16233a', border: '1px solid #304867', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace' }}>
            Ctrl+Shift+L
          </kbd> to toggle · <kbd style={{ background: '#16233a', border: '1px solid #304867', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace' }}>
            Esc
          </kbd> to close
        </div>
      </div>
    </div>
  );
}
