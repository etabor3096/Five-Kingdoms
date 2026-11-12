import type { ReactNode } from 'react';
import { Platform, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Fills the screen minus the device safe areas. On web the insets come from CSS
 * `env(safe-area-inset-*)` (Expo SDK 58 no longer supplies them there); on native from
 * react-native-safe-area-context. `onLayout` reports the usable area.
 */
export function SafeFrame({
  children,
  onLayout,
}: {
  children: ReactNode;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const insets = useSafeAreaInsets();
  const padding: ViewStyle =
    Platform.OS === 'web'
      ? {
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }
      : {
          paddingTop: insets.top,
          paddingRight: insets.right,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
        };
  return (
    <View style={[{ flex: 1 }, padding]}>
      <View style={{ flex: 1 }} onLayout={onLayout}>
        {children}
      </View>
    </View>
  );
}
