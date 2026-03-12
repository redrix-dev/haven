import React from 'react';
import { AuthProvider } from '@shared/contexts/AuthContext';
import { ChatApp } from '@client/app/ChatApp';

export function AppRoot() {
  return (
    <AuthProvider>
      <ChatApp />
    </AuthProvider>
  );
}
