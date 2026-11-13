import { View } from 'react-native';
import { TURN_TIMER_SECONDS } from '@five-kingdoms/protocol';
import { COLORS } from '../design/tokens';
import { Btn, Txt } from './ui';

/** The host's on/off switch for the optional turn timer, with a line saying what it does. */
export function TurnTimerToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Txt size={20} style={{ flex: 1 }}>
          Turn timer
        </Txt>
        <Btn
          label={value ? `On · ${TURN_TIMER_SECONDS}s` : 'Off'}
          variant={value ? 'primary' : 'secondary'}
          size={18}
          width={130}
          testID="turn-timer-toggle"
          onPress={() => onChange(!value)}
        />
      </View>
      <Txt size={14} color={COLORS.textDim}>
        {value
          ? 'A turn that runs out draws a card and discards it.'
          : 'Players take as long as they like.'}
      </Txt>
    </View>
  );
}
