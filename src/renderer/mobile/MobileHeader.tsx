import React from 'react';
import { Bell, MessageCircle, Home, ArrowLeft, Users } from 'lucide-react';

interface MobileHeaderProps {
  canGoBack: boolean;
  canGoHome: boolean;
  onHomePress: () => void;
  onBackPress: () => void;
  notificationUnseenCount: number;
  dmUnreadCount: number;
  friendRequestCount: number;
  onNotificationsPress: () => void;
  onDmPress: () => void;
  onFriendsPress: () => void;
}

export function MobileHeader({
  canGoBack,
  canGoHome,
  onHomePress,
  onBackPress,
  notificationUnseenCount,
  dmUnreadCount,
  friendRequestCount,
  onNotificationsPress,
  onDmPress,
  onFriendsPress,
}: MobileHeaderProps) {
  return (
    <div className="relative flex items-center h-14 px-3 bg-[#0d1525] border-b border-white/10 shrink-0">
      {/* Left: Back + Home + Friends */}
      <div className="flex items-center gap-1.5 z-10">
        <button
          onClick={onBackPress}
          disabled={!canGoBack}
          className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-colors ${
            canGoBack
              ? 'bg-white/5 hover:bg-white/10 active:bg-white/15'
              : 'bg-white/[0.03] cursor-default'
          }`}
        >
          <ArrowLeft className={`w-5 h-5 ${canGoBack ? 'text-gray-300' : 'text-gray-600'}`} />
        </button>

        <button
          onClick={onHomePress}
          disabled={!canGoHome}
          className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-colors ${
            canGoHome
              ? 'bg-white/5 hover:bg-white/10 active:bg-white/15'
              : 'bg-white/[0.03] cursor-default'
          }`}
        >
          <Home className={`w-5 h-5 ${canGoHome ? 'text-gray-300' : 'text-gray-600'}`} />
        </button>

        <button
          onClick={onFriendsPress}
          className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors shrink-0"
        >
          <Users className="w-5 h-5 text-gray-300" />
          {friendRequestCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
              {friendRequestCount > 99 ? '99+' : friendRequestCount}
            </span>
          )}
        </button>
      </div>

      {/* Center: "Haven" wordmark — absolutely centered so it ignores left/right widths */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <span className="text-white font-bold text-base tracking-tight">Haven</span>
      </div>

      {/* Right: Notifications + DM */}
      <div className="flex items-center gap-1.5 z-10 ml-auto">
        <button
          onClick={onNotificationsPress}
          className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors"
        >
          <Bell className="w-5 h-5 text-gray-300" />
          {notificationUnseenCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
              {notificationUnseenCount > 99 ? '99+' : notificationUnseenCount}
            </span>
          )}
        </button>

        <button
          onClick={onDmPress}
          className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors"
        >
          <MessageCircle className="w-5 h-5 text-gray-300" />
          {dmUnreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
              {dmUnreadCount > 99 ? '99+' : dmUnreadCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
