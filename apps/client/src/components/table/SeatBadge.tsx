import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ZoomIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { PlayerView } from '@five-kingdoms/engine';
import { EMOTES } from '../../design/emotes';
import { COLORS } from '../../design/tokens';
import type { EmoteId, RoomPlayer } from '../../net/GameClient';
import { Avatar } from '../Avatar';
import { Txt } from '../ui';

/** A player's seat: avatar, name, card count, dealer / out tags, turn glow and emote bubble. */
export function SeatBadge({
  x,
  y,
  player,
  profile,
  isTurn,
  isDealer,
  isOut,
  emote,
  compact = false,
}: {
  x: number;
  y: number;
  player: PlayerView;
  profile: RoomPlayer | undefined;
  isTurn: boolean;
  isDealer: boolean;
  isOut: boolean;
  emote: { emote: EmoteId; key: number } | undefined;
  /** The viewer's own badge omits the card-count chip (the hand is right there). */
  compact?: boolean;
}) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!isTurn) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(withTiming(0.45, { duration: 650 }), withTiming(1, { duration: 650 })),
      -1,
    );
  }, [isTurn, pulse]);
  const glow = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View
      style={[styles.seat, { left: x - 80, top: y - 46 }]}
      accessibilityLabel={`${player.name}${profile?.isHost ? ' (host)' : ''}, ${player.handCount} cards${isTurn ? ', their turn' : ''}${profile && !profile.connected ? ', away' : ''}${profile?.skipped ? ', skipped' : ''}`}
    >
      {emote && (
        <Animated.View
          key={emote.key}
          entering={ZoomIn.duration(180)}
          exiting={FadeOut.duration(250)}
          style={styles.bubble}
        >
          <Txt size={34}>{EMOTES[emote.emote].glyph}</Txt>
          <Txt size={13} color={COLORS.symbolDark} weight="700">
            {EMOTES[emote.emote].label}
          </Txt>
        </Animated.View>
      )}
      <View style={styles.avatarWrap}>
        {isTurn && <Animated.View style={[styles.glow, glow]} />}
        <Avatar
          id={profile?.avatar ?? 'fox'}
          size={64}
          {...(isTurn ? { ring: COLORS.accent } : {})}
        />
        {isDealer && (
          <View style={[styles.tag, { right: -6, top: -4, backgroundColor: COLORS.inkLight }]}>
            <Txt size={13} weight="800" color={COLORS.symbolDark}>
              D
            </Txt>
          </View>
        )}
      </View>
      <Txt size={18} weight="700" numberOfLines={1} style={styles.name}>
        {profile?.isHost ? '👑 ' : ''}
        {player.name}
      </Txt>
      <View style={styles.row}>
        {!compact && (
          <View style={styles.chip}>
            <Txt size={15} weight="800">
              🂠 {player.handCount}
            </Txt>
          </View>
        )}
        {profile && !profile.connected && (
          <View style={[styles.chip, { backgroundColor: COLORS.danger }]}>
            <Txt size={15} weight="800" color="#1f0905">
              AWAY
            </Txt>
          </View>
        )}
        {profile?.skipped && (
          <View style={[styles.chip, { backgroundColor: COLORS.panelBorder }]}>
            <Txt size={15} weight="800">
              skipped
            </Txt>
          </View>
        )}
        {isOut && (
          <View style={[styles.chip, { backgroundColor: COLORS.ok }]}>
            <Txt size={15} weight="800" color={COLORS.symbolDark}>
              OUT
            </Txt>
          </View>
        )}
        <View style={styles.chip}>
          <Txt size={15} color={COLORS.textDim} weight="700">
            {player.score} pts
          </Txt>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  seat: { position: 'absolute', width: 160, alignItems: 'center', gap: 2 },
  avatarWrap: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.accent,
    opacity: 0.5,
  },
  tag: {
    position: 'absolute',
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.cardEdge,
  },
  name: { maxWidth: 160, textShadowColor: '#000', textShadowRadius: 4 },
  row: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  chip: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bubble: {
    position: 'absolute',
    top: -62,
    left: 70,
    zIndex: 50,
    backgroundColor: COLORS.inkLight,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
});
