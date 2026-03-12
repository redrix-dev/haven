import React from 'react';
import { AuthProvider } from '@shared/contexts/AuthContext';
import { MobileChatApp } from '@web-mobile/mobile/MobileChatApp';
import { useMobileViewportStabilizer } from '@web-mobile/mobile/hooks/useMobileViewportStabilizer';

export function MobileRoot() {
  useMobileViewportStabilizer();

  return (
    <AuthProvider>
      <MobileChatApp />
    </AuthProvider>
  );
}
