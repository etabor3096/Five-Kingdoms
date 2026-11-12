import { StyleSheet, View } from 'react-native';
import { CANVAS, COLORS } from '../design/tokens';
import { useSnapshot, useStore } from '../state/ClientContext';
import { Btn, Panel, Txt } from './ui';

/**
 * Full-canvas overlays that sit above every screen:
 *  - "Reconnecting…" while the socket is down (it also blocks taps, since actions would fail)
 *  - a message the player must dismiss, such as a protocol-version mismatch
 */
export function Overlays() {
  const store = useStore();
  const { connection, blocking } = useSnapshot();
  return (
    <>
      {connection === 'reconnecting' && (
        <View style={styles.scrim} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Panel style={styles.card}>
            <Txt size={30} weight="800" color={COLORS.accent} align="center">
              Reconnecting…
            </Txt>
            <Txt size={18} color={COLORS.textDim} align="center">
              Lost the connection to the server. Trying again; your seat is held.
            </Txt>
          </Panel>
        </View>
      )}
      {blocking && (
        <View style={[styles.scrim, { zIndex: 700 }]} accessibilityRole="alert">
          <Panel style={styles.card}>
            <Txt size={30} weight="800" color={COLORS.danger} align="center">
              {blocking.title}
            </Txt>
            <Txt size={19} align="center">
              {blocking.text}
            </Txt>
            <Btn label="OK" onPress={() => store.dismissBlocking()} />
          </Panel>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: CANVAS.width,
    height: CANVAS.height,
    zIndex: 600,
    backgroundColor: 'rgba(5,12,11,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { width: 560, gap: 14, alignItems: 'center' },
});
