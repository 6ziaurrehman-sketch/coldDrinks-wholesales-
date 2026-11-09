import { ForceUpdateGate } from '@/components/ForceUpdateGate';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/ui';

export default function ForceUpdateScreen() {
  return (
    <ForceUpdateGate>
      <Screen title="App Status">
        <AppText>Your app is up to date.</AppText>
      </Screen>
    </ForceUpdateGate>
  );
}
