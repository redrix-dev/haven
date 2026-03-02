// Changed: add a resettable mobile error boundary so a single screen crash doesn't break the entire app shell.
import React from 'react';

export interface MobileErrorBoundaryProps {
  children: React.ReactNode;
}

interface MobileErrorBoundaryState {
  hasError: boolean;
}

export class MobileErrorBoundary extends React.Component<
  MobileErrorBoundaryProps,
  MobileErrorBoundaryState
> {
  state: MobileErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MobileErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#18243a] p-4 text-center">
          <p className="text-white font-semibold mb-2">Something went wrong</p>
          <button
            className="min-w-[44px] min-h-[44px] rounded-xl bg-blue-600 px-4 text-sm text-white"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
