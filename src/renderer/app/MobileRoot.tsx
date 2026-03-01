import React from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { MobileChatApp } from '@/renderer/app/MobileChatApp';
import { useMobileViewportStabilizer } from '@/renderer/app/hooks/useMobileViewportStabilizer';

export function MobileRoot() {
  useMobileViewportStabilizer();

  return (
    <AuthProvider>
      <MobileChatApp />
    </AuthProvider>
  );
}
