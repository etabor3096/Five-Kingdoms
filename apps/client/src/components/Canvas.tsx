import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { COLORS, CANVAS } from '../design/tokens';
import { fitCanvas } from '../layout/canvas';
import { SafeFrame } from './SafeFrame';

/**
 * Hosts the whole UI on the fixed 1280 x 720 logical canvas, scaled to fit the safe area
 * and letterboxed. Children lay out in logical pixels, so the layout is identical everywhere.
 */
export function Canvas({ children }: { children: ReactNode }) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent): void => {
    const { width, height } = e.nativeEvent.layout;
    setArea((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };
  const fit = fitCanvas(area.width, area.height);
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <SafeFrame onLayout={onLayout}>
        {area.width > 0 && (
          <View
            style={{
              position: 'absolute',
              left: fit.offsetX,
              top: fit.offsetY,
              width: CANVAS.width,
              height: CANVAS.height,
              overflow: 'hidden',
              backgroundColor: COLORS.bg,
              transformOrigin: 'top left',
              transform: [{ scale: fit.scale }],
            }}
          >
            {children}
          </View>
        )}
      </SafeFrame>
    </View>
  );
}
