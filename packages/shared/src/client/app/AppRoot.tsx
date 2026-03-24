import React from 'react';
import { AuthProvider } from '@shared/contexts/AuthContext';
import { TitleBar } from '@shared/components/TitleBar';
import { ChatApp } from '@client/app/ChatApp';
import { VoicePopoutApp } from '@client/app/VoicePopoutApp';
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

// CHECKPOINT 4 COMPLETE
