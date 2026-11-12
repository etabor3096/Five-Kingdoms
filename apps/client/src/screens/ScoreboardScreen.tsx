import { StyleSheet, View } from 'react-native';
import type { Card, Rank } from '@five-kingdoms/engine';
import { CardFace } from '../components/cards/CardFace';
import { Avatar } from '../components/Avatar';
import { Btn, Panel, Txt } from '../components/ui';
import { COLORS } from '../design/tokens';
import { useSnapshot, useStore } from '../state/ClientContext';

const MINI = 38;

/** Cards overlapped in a row, small enough for seven players on one screen. */
function MiniCards({
  cards,
  wildRank,
  tint,
}: {
  cards: readonly Card[];
  wildRank: Rank;
  tint?: string;
}) {
  if (cards.length === 0)
    return (
      <Txt size={14} color={COLORS.textDim}>
        none
      </Txt>
    );
  return (
    <View style={[styles.minis, tint ? { borderColor: tint } : null]}>
      {cards.map((c, i) => (
        <View key={c.id} style={{ marginLeft: i === 0 ? 0 : cards.length > 6 ? -18 : -8 }}>
          <CardFace card={c} wildRank={wildRank} width={MINI} />
        </View>
      ))}
    </View>
  );
}

/** Round-end scoreboard: this round's points, running totals, melds laid down, leftovers. */
export function ScoreboardScreen() {
  const store = useStore();
  const { client } = store;
  const { view, room, lastScored } = useSnapshot();
  if (!view || !room || !view.wildRank) return null;
  const isLast = view.phase === 'gameOver';
  const wild = view.wildRank;
  const doneCount = room.continuedIds.length;
  const waiting = !isLast && room.continuedIds.includes(room.selfId);
  const outName = view.players.find((p) => p.id === view.outPlayerId)?.name;

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <View>
          <Txt size={34} weight="900" color={COLORS.accent}>
            Round {view.round} complete
          </Txt>
          <Txt size={17} color={COLORS.textDim}>
            {outName ? `${outName} went out. ` : ''}Wild rank this round:{' '}
            {wild === 11 ? 'J' : wild === 12 ? 'Q' : wild === 13 ? 'K' : wild}
          </Txt>
        </View>
        <Btn
          label={
            isLast
              ? 'Final standings'
              : waiting
                ? `Waiting… ${doneCount}/${room.players.length}`
                : 'Continue'
          }
          disabled={waiting}
          onPress={() => (isLast ? store.openStandings() : void client.continueRound())}
        />
      </View>

      <Panel style={styles.table}>
        <View style={styles.row}>
          <Txt size={14} weight="800" color={COLORS.textDim} style={styles.cPlayer}>
            PLAYER
          </Txt>
          <Txt size={14} weight="800" color={COLORS.textDim} style={styles.cMelds}>
            MELDS LAID DOWN
          </Txt>
          <Txt size={14} weight="800" color={COLORS.textDim} style={styles.cLeft}>
            LEFT IN HAND
          </Txt>
          <Txt size={14} weight="800" color={COLORS.textDim} style={styles.cNum}>
            ROUND
          </Txt>
          <Txt size={14} weight="800" color={COLORS.textDim} style={styles.cNum}>
            TOTAL
          </Txt>
        </View>
        {view.players.map((p) => {
          const entry = lastScored?.scores.find((s) => s.playerId === p.id);
          const profile = room.players.find((r) => r.id === p.id);
          const roundPts = p.roundScores[p.roundScores.length - 1] ?? 0;
          return (
            <View
              key={p.id}
              style={[styles.row, styles.bodyRow, p.id === view.outPlayerId && styles.outRow]}
            >
              <View style={[styles.cPlayer, styles.who]}>
                <Avatar id={profile?.avatar ?? 'fox'} size={36} />
                <View style={{ flex: 1 }}>
                  <Txt size={18} weight="700" numberOfLines={1}>
                    {p.name}
                  </Txt>
                  {p.id === view.outPlayerId && (
                    <Txt size={12} weight="800" color={COLORS.ok}>
                      WENT OUT
                    </Txt>
                  )}
                </View>
              </View>
              <View style={styles.cMelds}>
                <View style={styles.meldWrap}>
                  {p.melds.map((m) => (
                    <MiniCards
                      key={m.map((c) => c.id).join('-')}
                      cards={m}
                      wildRank={wild}
                      tint={COLORS.ok}
                    />
                  ))}
                  {p.melds.length === 0 && (
                    <Txt size={14} color={COLORS.textDim}>
                      none
                    </Txt>
                  )}
                </View>
              </View>
              <View style={styles.cLeft}>
                <MiniCards cards={entry?.leftover ?? []} wildRank={wild} />
              </View>
              <Txt
                size={24}
                weight="800"
                color={roundPts === 0 ? COLORS.ok : COLORS.text}
                style={styles.cNum}
              >
                {roundPts}
              </Txt>
              <View style={styles.cNum}>
                <Txt size={24} weight="900">
                  {p.score}
                </Txt>
                <Txt size={11} color={COLORS.textDim} numberOfLines={1}>
                  {p.roundScores.join(' · ')}
                </Txt>
              </View>
            </View>
          );
        })}
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: {
    position: 'absolute',
    left: 50,
    right: 50,
    top: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  table: { position: 'absolute', left: 50, right: 50, top: 110, bottom: 24, padding: 14, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bodyRow: { minHeight: 66, borderTopWidth: 1, borderTopColor: COLORS.panelBorder },
  outRow: { backgroundColor: 'rgba(88,194,139,0.12)', borderRadius: 8 },
  cPlayer: { width: 230 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cMelds: { flex: 1 },
  cLeft: { width: 270 },
  cNum: { width: 100, textAlign: 'center', alignItems: 'center' },
  meldWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  minis: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2, borderRadius: 6 },
});
