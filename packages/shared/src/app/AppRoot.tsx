import React from 'react';
import { AuthProvider } from '@shared/contexts/AuthContext';
import { TitleBar } from '@shared/app/components/TitleBar';
import { ChatApp } from '@shared/app/ChatApp';
import { VoicePopoutApp } from '@shared/app/VoicePopoutApp';
import { desktopClient } from '@platform/desktop/client';

export function AppRoot() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const showDesktopTitleBar = desktopClient.isAvailable();

  if (view === 'voice-popout') {
    return <VoicePopoutApp />;
  }

  return (
    <AuthProvider>
      {showDesktopTitleBar ? (
        <div className="desktop-app-shell">
          <TitleBar />
          <ChatApp />
        </div>
      ) : (
        <ChatApp />
      )}
    </AuthProvider>
  );
}
