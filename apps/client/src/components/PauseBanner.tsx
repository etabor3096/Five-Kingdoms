import { StyleSheet, View } from 'react-native';
import { COLORS } from '../design/tokens';
import { formatClock, useCountdown } from '../state/useCountdown';
import type { RoomState } from '../net/GameClient';
import { Btn, Txt } from './ui';

/** "a", "a and b", "a, b and c" */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'a player';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Shown while the game is paused for away players: who, and a countdown to the end of the
 * grace period. Once it has ended the host chooses to wait longer or skip those players'
 * turns; everyone else just sees that the host is deciding.
 */
export function PauseBanner({
  room,
  onDecide,
}: {
  room: RoomState;
  onDecide: (playerIds: string[], decision: 'wait' | 'skip') => void;
}) {
  const pause = room.pause;
  const seconds = useCountdown(pause?.deadline ?? 0);
  if (!pause) return null;

  const names = pause.awayIds.map(
    (id) => room.players.find((p) => p.id === id)?.name ?? 'A player',
  );
  const isHost = room.hostId === room.selfId;
  const over = pause.expired;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Txt size={22} weight="800" color={COLORS.accent}>
        ⏸ Game paused
      </Txt>
      <Txt size={19} align="center">
        {over
          ? `${joinNames(names)} ${names.length > 1 ? 'have' : 'has'} not come back.`
          : `Waiting for ${joinNames(names)} to reconnect · ${formatClock(seconds)}`}
      </Txt>
      {over && isHost && (
        <View style={styles.buttons}>
          <Btn
            label="Wait 60s more"
            variant="secondary"
            size={18}
            onPress={() => onDecide(pause.awayIds.slice(0, 1), 'wait')}
          />
          <Btn label="Skip their turns" size={18} onPress={() => onDecide(pause.awayIds, 'skip')} />
        </View>
      )}
      {over && !isHost && (
        <Txt size={16} color={COLORS.textDim}>
          Waiting for the host to decide…
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 340,
    width: 600,
    top: 134,
    zIndex: 300,
    alignItems: 'center',
    gap: 4,
    padding: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(11,29,26,0.94)',
  },
  buttons: { flexDirection: 'row', gap: 12 },
});
