import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { checkAppVersion, getCurrentAppVersion, type VersionCheckResult } from '@/lib/appSettings';

export function useAppVersionCheck() {
  const [result, setResult] = useState<VersionCheckResult>({
    isUpdateRequired: false,
    currentVersion: getCurrentAppVersion(),
    minimumVersion: '1.0.0',
    forceUpdateMessage: '',
    storeUrl: '',
  });
  const [isLoading, setIsLoading] = useState(true);

  const performCheck = useCallback(async () => {
    try {
      const data = await checkAppVersion();
      setResult(data);
    } catch {
      // Ignore network errors on splash check
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    checkAppVersion()
      .then((data) => {
        if (active) {
          setResult(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        performCheck();
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [performCheck]);

  return {
    ...result,
    isLoading,
    recheck: performCheck,
  };
}
