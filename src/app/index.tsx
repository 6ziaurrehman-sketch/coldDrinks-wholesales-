import { Redirect } from 'expo-router';

import { useSession } from '@/auth/SessionProvider';

export default function RootIndex() {
  const { session, accountStatus, isLoading } = useSession();

  if (isLoading) {
    return null;
  }

  if (session && accountStatus === 'active') {
    return <Redirect href="/(app)/(tabs)" />;
  }

  if (session && accountStatus && accountStatus !== 'active') {
    return <Redirect href="/(auth)/account-status" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
