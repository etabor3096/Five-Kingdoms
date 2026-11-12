import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RotateOverlay } from '../src/components/RotateOverlay';
import { COLORS } from '../src/design/tokens';
import { LocalGameClient } from '../src/net/LocalGameClient';
import { ClientProvider } from '../src/state/ClientContext';
import { useWebViewport } from '../src/state/useWebViewport';

/**
 * The one place a `GameClient` is chosen. Today that is the dev-only in-memory harness;
 * the WebSocket client replaces `createClient` in a later task.
 */
const createClient = () => new LocalGameClient();

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
