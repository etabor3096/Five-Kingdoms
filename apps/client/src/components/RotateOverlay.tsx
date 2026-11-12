import { useEffect } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { COLORS } from '../design/tokens';
import { isPortrait } from '../layout/canvas';
import { Txt } from './ui';

/**
 * Web only: a full-screen "rotate your device" cover shown in portrait. It sits above
 * everything and swallows all input. iOS cannot lock orientation, so this is the fallback.
 */
export function RotateOverlay() {
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Works on Android Chrome (installed) and desktop; silently ignored on iOS Safari.
    const orientation = globalThis.screen?.orientation as
      { lock?: (o: string) => Promise<void> } | undefined;
    orientation?.lock?.('landscape').catch(() => undefined);
  }, []);

  if (Platform.OS !== 'web' || !isPortrait(width, height)) return null;
  return (
    <View style={styles.cover} accessibilityRole="alert" accessibilityViewIsModal>
      <Svg width={120} height={120} viewBox="0 0 120 120">
        <Rect
          x={38}
          y={14}
          width={44}
          height={92}
          rx={9}
          fill="none"
          stroke={COLORS.accent}
          strokeWidth={5}
        />
        <Path
          d="M96 40 C108 52 108 70 96 82"
          fill="none"
          stroke={COLORS.accent}
          strokeWidth={5}
          strokeLinecap="round"
        />
        <Path d="M100 88 L96 80 L106 80 Z" fill={COLORS.accent} />
      </Svg>
      <Txt size={30} weight="800" align="center">
        Rotate your device
      </Txt>
      <Txt size={19} color={COLORS.textDim} align="center" style={styles.copy}>
        Five Kingdoms is played in landscape. Turn your phone sideways. If nothing happens, turn off
        Portrait Orientation Lock in Control Center.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  copy: { maxWidth: 420 },
});
