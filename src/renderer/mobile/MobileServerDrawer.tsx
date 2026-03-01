import React from 'react';
import { X, Settings } from 'lucide-react';

interface Server {
  id: string;
  name: string;
  icon?: string;
}

interface MobileServerDrawerProps {
  open: boolean;
  onClose: () => void;
  servers: Server[];
  currentServerId: string | null;
  onSelectServer: (id: string) => void;
  canManageCurrentServer: boolean;
  onOpenServerSettings: () => void;
}

export function MobileServerDrawer({
  open,
  onClose,
  servers,
  currentServerId,
  onSelectServer,
  canManageCurrentServer,
  onOpenServerSettings,
}: MobileServerDrawerProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 touch-none overscroll-none"
        onClick={onClose}
      />

      {/* Drawer panel — drops from below the header */}
      <div className="fixed top-14 left-0 right-0 z-50 bg-[#0d1525] border-b border-white/10 max-h-[65vh] flex flex-col">

        {/* Drawer title row */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <span className="text-white font-semibold text-sm">
            {currentServerId
              ? servers.find((s) => s.id === currentServerId)?.name ?? 'Server'
              : 'Your Servers'}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Server Settings — at the top, only if user has access */}
        {canManageCurrentServer && currentServerId && (
          <div className="px-4 pt-3 pb-2 shrink-0">
            <button
              onClick={() => {
                onOpenServerSettings();
                onClose();
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors text-gray-300 text-sm"
            >
              <Settings className="w-4 h-4" />
              Server Settings
            </button>
          </div>
        )}

        {/* Divider + "Your Servers" label */}
        <div className="px-4 pt-2 pb-1 shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Your Servers
          </span>
        </div>

        {/* Server list */}
        <div className="overflow-y-auto flex-1 pb-2">
          {servers.map((server) => {
            const isActive = server.id === currentServerId;
            return (
              <button
                key={server.id}
                onClick={() => {
                  onSelectServer(server.id);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                  isActive ? 'bg-white/5' : 'hover:bg-white/5'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0 transition-colors ${
                    isActive ? 'bg-blue-600' : 'bg-white/10'
                  }`}
                >
                  {server.icon || server.name.charAt(0).toUpperCase()}
                </div>
                <span
                  className={`text-sm truncate ${
                    isActive ? 'text-white font-semibold' : 'text-gray-300'
                  }`}
                >
                  {server.name}
                </span>
                {isActive && (
                  <div className="ml-auto w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
