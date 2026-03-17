import React from 'react';
import { AuthProvider } from '@shared/contexts/AuthContext';
import { ChatApp } from '@client/app/ChatApp';
import { VoicePopoutApp } from '@client/app/VoicePopoutApp';

export function AppRoot() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');

  if (view === 'voice-popout') {
    return <VoicePopoutApp />;
  }

  return (
    <AuthProvider>
      <ChatApp />
    </AuthProvider>
  );
}
