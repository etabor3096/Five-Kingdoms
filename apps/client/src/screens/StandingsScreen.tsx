import { StyleSheet, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Btn, Panel, Txt } from '../components/ui';
import { COLORS } from '../design/tokens';
import { rankPlayers } from '../game/standings';
import { isDevHarness } from '../net/LocalGameClient';
import { useSnapshot, useStore } from '../state/ClientContext';

/** Final standings: ranked totals (lowest wins, ties share), Rematch and Leave. */
export function StandingsScreen() {
  const { client } = useStore();
  const { view, room } = useSnapshot();
  if (!view || !room) return null;
  // Only the host can start a rematch on the server; the dev harness has no such rule.
  const canRematch = room.hostId === room.selfId || isDevHarness(client);
  const ranked = rankPlayers(view.players);
  const winners = ranked.filter((r) => view.winnerIds.includes(r.player.id));

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Txt size={44} weight="900" color={COLORS.accent}>
          {winners.length > 1
            ? 'The crown is shared!'
            : `${winners[0]?.player.name ?? 'Someone'} wins the crown!`}
        </Txt>
        <Txt size={18} color={COLORS.textDim}>
          Lowest total after 11 rounds wins.
        </Txt>
      </View>
      <Panel style={styles.list}>
        {ranked.map(({ player, rank }) => {
          const won = view.winnerIds.includes(player.id);
          const profile = room.players.find((r) => r.id === player.id);
          return (
            <View key={player.id} style={[styles.row, won && styles.win]}>
              <Txt
                size={28}
                weight="900"
                color={won ? COLORS.accent : COLORS.textDim}
                style={{ width: 56 }}
              >
                {won ? '👑' : `#${rank}`}
              </Txt>
              <Avatar id={profile?.avatar ?? 'fox'} size={44} />
              <Txt size={24} weight="800" style={{ flex: 1 }} numberOfLines={1}>
                {player.name}
                {player.id === view.viewerId ? ' (you)' : ''}
              </Txt>
              <Txt size={14} color={COLORS.textDim} style={{ width: 300 }} numberOfLines={1}>
                {player.roundScores.join(' · ')}
              </Txt>
              <Txt size={30} weight="900" style={{ width: 90, textAlign: 'right' }}>
                {player.score}
              </Txt>
            </View>
          );
        })}
      </Panel>
      <View style={styles.buttons}>
        {canRematch ? (
          <Btn label="Rematch" width={220} onPress={() => void client.rematch()} />
        ) : (
          <Txt size={18} color={COLORS.textDim}>
            Waiting for the host to start a rematch…
          </Txt>
        )}
        <Btn label="Leave" variant="secondary" width={220} onPress={() => void client.leave()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { position: 'absolute', left: 80, right: 80, top: 36, gap: 6 },
  list: { position: 'absolute', left: 80, right: 80, top: 140, gap: 6, padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  win: { backgroundColor: 'rgba(232,184,74,0.15)' },
  buttons: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
});
