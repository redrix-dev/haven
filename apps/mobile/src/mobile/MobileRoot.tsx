import React from 'react';
import { AuthProvider } from '@shared/contexts/AuthContext';
import { MobileChatApp } from '@mobile/mobile/MobileChatApp';
import { MobileViewportProvider } from '@mobile/mobile/layout/MobileViewportContext';

export function MobileRoot() {
  return (
    <MobileViewportProvider>
      <AuthProvider>
        <MobileChatApp />
      </AuthProvider>
    </MobileViewportProvider>
  );
}
