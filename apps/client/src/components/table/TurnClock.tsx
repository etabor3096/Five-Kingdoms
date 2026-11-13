import { StyleSheet, View } from 'react-native';
import { TURN_TIMER_SECONDS } from '@five-kingdoms/protocol';
import { COLORS } from '../../design/tokens';
import { formatClock, useCountdown } from '../../state/useCountdown';
import { Txt } from '../ui';

/** Seconds left at which the clock turns red. */
const LOW_SECONDS = 10;

/**
 * Time left on the current turn when the host has the turn timer on. The deadline is on the
 * server's clock, so the display is capped at a full turn in case this device's clock is behind.
 */
export function TurnClock({ deadline, mine }: { deadline: number; mine: boolean }) {
  const seconds = Math.min(useCountdown(deadline), TURN_TIMER_SECONDS);
  const low = seconds <= LOW_SECONDS;
  return (
    <View style={styles.clock} pointerEvents="none" accessibilityRole="timer">
      <Txt
        size={18}
        weight="800"
        align="center"
        color={low ? COLORS.danger : mine ? COLORS.accent : COLORS.textDim}
      >
        ⏱ {formatClock(seconds)}
        {low && mine ? ' · a card will be drawn and discarded for you' : ''}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  clock: { position: 'absolute', left: 340, width: 600, top: 456 },
});
