import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { CANVAS, COLORS } from '../design/tokens';
import { useSnapshot } from '../state/ClientContext';
import { Txt } from './ui';

/** Short error message at the top of the canvas (fades via opacity/transform only). */
export function Toast() {
  const { toast } = useSnapshot();
  return (
    <View pointerEvents="none" style={styles.wrap}>
      {toast && (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.duration(160)}
          exiting={FadeOut.duration(200)}
          style={styles.toast}
        >
          <Txt size={20} weight="700" color="#1f0905">
            {toast.text}
          </Txt>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 18,
    left: 0,
    width: CANVAS.width,
    alignItems: 'center',
    zIndex: 500,
  },
  toast: {
    backgroundColor: COLORS.danger,
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 12,
    maxWidth: 800,
  },
});
