import React from 'react';
import { ArrowLeft, Bell, Home, MessageCircle, Settings, Users } from 'lucide-react';

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
  onAccountPress: () => void;
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
  onAccountPress,
}: MobileHeaderProps) {
  return (
    <div className="relative flex h-14 items-center border-b border-white/10 bg-[#0d1525] px-3 shrink-0">
      <div className="z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onBackPress}
          disabled={!canGoBack}
          aria-label="Back"
          className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 transition-colors ${
            canGoBack
              ? 'bg-white/5 hover:bg-white/10 active:bg-white/15'
              : 'cursor-default bg-white/[0.03]'
          }`}
        >
          <ArrowLeft className={`h-5 w-5 ${canGoBack ? 'text-gray-300' : 'text-gray-600'}`} />
        </button>

        <button
          type="button"
          onClick={onHomePress}
          disabled={!canGoHome}
          aria-label="Home"
          className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 transition-colors ${
            canGoHome
              ? 'bg-white/5 hover:bg-white/10 active:bg-white/15'
              : 'cursor-default bg-white/[0.03]'
          }`}
        >
          <Home className={`h-5 w-5 ${canGoHome ? 'text-gray-300' : 'text-gray-600'}`} />
        </button>

        <button
          type="button"
          onClick={onFriendsPress}
          aria-label="Friends"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 shrink-0 transition-colors hover:bg-white/10 active:bg-white/15"
        >
          <Users className="h-5 w-5 text-gray-300" />
          {friendRequestCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold leading-none text-white">
              {friendRequestCount > 99 ? '99+' : friendRequestCount}
            </span>
          )}
        </button>
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
        <span className="text-base font-bold tracking-tight text-white">Haven</span>
      </div>

      <div className="z-10 ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onNotificationsPress}
          aria-label="Notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 transition-colors hover:bg-white/10 active:bg-white/15"
        >
          <Bell className="h-5 w-5 text-gray-300" />
          {notificationUnseenCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {notificationUnseenCount > 99 ? '99+' : notificationUnseenCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onDmPress}
          aria-label="Direct Messages"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 transition-colors hover:bg-white/10 active:bg-white/15"
        >
          <MessageCircle className="h-5 w-5 text-gray-300" />
          {dmUnreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {dmUnreadCount > 99 ? '99+' : dmUnreadCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onAccountPress}
          aria-label="Account Settings"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 transition-colors hover:bg-white/10 active:bg-white/15"
        >
          <Settings className="h-5 w-5 text-gray-300" />
        </button>
      </div>
    </div>
  );
}
