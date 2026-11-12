import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RotateOverlay } from '../src/components/RotateOverlay';
import { COLORS } from '../src/design/tokens';
import type { GameClient } from '../src/net/GameClient';
import { serverUrlFromEnv, wantsDevHarness } from '../src/net/config';
import { LocalGameClient } from '../src/net/LocalGameClient';
import { RemoteGameClient } from '../src/net/RemoteGameClient';
import { deviceStore } from '../src/storage/deviceStore';
import { ClientProvider } from '../src/state/ClientContext';
import { useWebViewport } from '../src/state/useWebViewport';

/**
 * The one place a `GameClient` is chosen: the WebSocket client by default, or the in-memory
 * dev harness with `EXPO_PUBLIC_DEV_HARNESS=1` or `?dev=1` in the web URL.
 */
const createClient = (): GameClient =>
  wantsDevHarness()
    ? new LocalGameClient()
    : new RemoteGameClient({ serverUrl: serverUrlFromEnv(), store: deviceStore });

export default function RootLayout() {
  useWebViewport();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <SafeAreaProvider>
        <StatusBar hidden />
        <ClientProvider createClient={createClient}>
          <View style={{ flex: 1 }}>
            <Slot />
          </View>
        </ClientProvider>
        <RotateOverlay />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
