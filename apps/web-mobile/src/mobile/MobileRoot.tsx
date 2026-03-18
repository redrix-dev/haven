import React from 'react';
import { AuthProvider } from '@shared/contexts/AuthContext';
import { MobileChatApp } from '@web-mobile/mobile/MobileChatApp';
import { MobileViewportProvider } from '@web-mobile/mobile/layout/MobileViewportContext';

export function MobileRoot() {
  return (
    <MobileViewportProvider>
      <AuthProvider>
        <MobileChatApp />
      </AuthProvider>
    </MobileViewportProvider>
  );
}
