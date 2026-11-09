import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';

import { useUiStore } from '@/store/uiStore';

export function useNetworkStatus() {
  const isOnline = useUiStore((state) => state.isOnline);
  const setOnline = useUiStore((state) => state.setOnline);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    });

    return unsubscribe;
  }, [setOnline]);

  return isOnline;
}
