import React from 'react';
import { AuthProvider } from '@shared/infrastructure/auth/AuthContext';
import { TitleBar } from '@web-client/components/TitleBar';
import { ChatApp } from '@web-client/ChatApp';
import { VoicePopoutApp } from '@web-client/VoicePopoutApp';
import { getAppHost } from '@shared/infrastructure/platform/appHost';

export function AppRoot() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const showDesktopTitleBar = getAppHost().isDesktopApp();

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
