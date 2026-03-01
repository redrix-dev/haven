import React from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { MobileChatApp } from '@/renderer/app/MobileChatApp';

export function MobileRoot() {
  return (
    <AuthProvider>
      <MobileChatApp />
    </AuthProvider>
  );
}
