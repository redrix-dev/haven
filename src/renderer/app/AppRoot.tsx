import React from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { ChatApp } from '@/renderer/app/ChatApp';

export function AppRoot() {
  return (
    <AuthProvider>
      <ChatApp />
    </AuthProvider>
  );
}
