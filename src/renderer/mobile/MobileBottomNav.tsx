import React from 'react';
import { ChevronUp, ChevronDown, Hash, Volume2, LogOut, Settings } from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  kind: string;
}

interface MobileBottomNavProps {
  mode: 'home' | 'server' | 'channel';
  open: boolean;
  onToggle: () => void;
  // Account info (home mode)
  username: string;
  onAccountSettings: () => void;
  onSignOut: () => void;
  // Channel list (server / channel mode)
  channels: Channel[];
  currentChannelId: string | null;
  onSelectChannel: (id: string) => void;
}

export function MobileBottomNav({
  mode,
  open,
  onToggle,
  username,
  onAccountSettings,
  onSignOut,
  channels,
  currentChannelId,
  onSelectChannel,
}: MobileBottomNavProps) {
  const drawerLabel =
    mode === 'home' ? 'Account & Settings' : 'Channels';

  const textChannels = channels.filter((ch) => ch.kind === 'text' || ch.kind === 'voice');

  return (
    <>
      {/* Backdrop when drawer is open */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={onToggle}
        />
      )}

      {/* Sliding drawer — rises from above the bottom bar */}
      {open && (
        <div className="fixed bottom-14 left-0 right-0 z-50 bg-[#0d1525] border-t border-white/10 max-h-[65vh] flex flex-col rounded-t-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
            <span className="text-white font-semibold text-sm">{drawerLabel}</span>
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 py-2">
            {mode === 'home' ? (
              <>
                {/* Profile row */}
                <div className="px-4 py-3 flex items-center gap-3 border-b border-white/10 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-base shrink-0">
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-white font-medium text-sm truncate">{username}</span>
                </div>

                <button
                  onClick={() => {
                    onAccountSettings();
                    onToggle();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-gray-300 text-sm"
                >
                  <Settings className="w-4 h-4 shrink-0" />
                  Account Settings
                </button>

                <button
                  onClick={onSignOut}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-red-400 text-sm"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  Sign Out
                </button>
              </>
            ) : (
              <>
                {textChannels.length === 0 && (
                  <p className="px-4 py-6 text-gray-500 text-sm text-center">
                    No channels yet
                  </p>
                )}
                {textChannels.map((channel) => {
                  const isActive = channel.id === currentChannelId;
                  const isVoice = channel.kind === 'voice';
                  const Icon = isVoice ? Volume2 : Hash;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => {
                        onSelectChannel(channel.id);
                        onToggle();
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                        isActive ? 'bg-white/5' : 'hover:bg-white/5'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-blue-400' : 'text-gray-500'
                        }`}
                      />
                      <span
                        className={`text-sm truncate ${
                          isActive ? 'text-white font-semibold' : 'text-gray-300'
                        }`}
                      >
                        {channel.name}
                      </span>
                      {isActive && (
                        <div className="ml-auto w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* Persistent bottom bar — always visible */}
      <button
        onClick={onToggle}
        className="fixed bottom-0 left-0 right-0 h-14 bg-[#0d1525] border-t border-white/10 flex items-center justify-between px-5 z-30"
      >
        <span className="text-gray-400 text-sm font-medium">{drawerLabel}</span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        )}
      </button>
    </>
  );
}
