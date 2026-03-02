import React from 'react';
import type { ControlPlaneBackend } from '@/lib/backend/controlPlaneBackend';
import type { FeatureFlagsSnapshot } from '@/lib/backend/types';

type UseFeatureFlagsInput = {
  controlPlaneBackend: Pick<ControlPlaneBackend, 'listMyFeatureFlags'>;
  userId: string | null | undefined;
};

export function useFeatureFlags({ controlPlaneBackend, userId }: UseFeatureFlagsInput) {
  const [featureFlags, setFeatureFlags] = React.useState<FeatureFlagsSnapshot>({});
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    if (!userId) {
      setFeatureFlags({});
      setFeatureFlagsLoaded(false);
      return;
    }

    setFeatureFlagsLoaded(false);

    const loadFeatureFlags = async () => {
      try {
        const flags = await controlPlaneBackend.listMyFeatureFlags();
        if (!isMounted) return;
        setFeatureFlags(flags);
      } catch (error) {
        if (!isMounted) return;
        console.warn('Failed to load feature flags:', error);
        setFeatureFlags({});
      } finally {
        if (!isMounted) return;
        setFeatureFlagsLoaded(true);
      }
    };

    void loadFeatureFlags();

    return () => {
      isMounted = false;
    };
  }, [controlPlaneBackend, userId]);

  const hasFeatureFlag = React.useCallback(
    (flagKey: string) => Boolean(featureFlags[flagKey]),
    [featureFlags]
  );

  const resetFeatureFlags = React.useCallback(() => {
    setFeatureFlags({});
  }, []);

  return {
    state: {
      featureFlags,
      featureFlagsLoaded,
    },
    derived: {
      hasFeatureFlag,
    },
    actions: {
      setFeatureFlags,
      resetFeatureFlags,
    },
  };
}
