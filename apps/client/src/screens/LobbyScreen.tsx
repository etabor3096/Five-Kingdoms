import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Avatar } from '../components/Avatar';
import { Btn, DevBadge, Panel, Stepper, Txt } from '../components/ui';
import { COLORS } from '../design/tokens';
import { isDevHarness } from '../net/LocalGameClient';
import { useSnapshot, useStore } from '../state/ClientContext';

/** The room code, who is here and ready, host settings and Start. */
export function LobbyScreen() {
  const store = useStore();
  const { client } = store;
  const { room } = useSnapshot();
  const [copied, setCopied] = useState(false);
  if (!room) return null;

  const me = room.players.find((p) => p.id === room.selfId);
  const isHost = room.hostId === room.selfId;
  const everyoneReady = room.players.length >= 2 && room.players.every((p) => p.ready);

  const copy = (): void => {
    void Clipboard.setStringAsync(room.code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => store.showToast('Could not copy. Read the code out instead.'),
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={{ gap: 4 }}>
          <Txt size={18} weight="800" color={COLORS.textDim}>
            ROOM CODE
          </Txt>
          <View style={styles.codeRow}>
            <Txt size={72} weight="900" color={COLORS.accent} style={{ letterSpacing: 10 }}>
              {room.code}
            </Txt>
            <Btn
              label={copied ? 'Copied ✓' : 'Copy'}
              variant="secondary"
              size={18}
              onPress={copy}
            />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          {isDevHarness(client) && <DevBadge />}
          <Btn label="Leave" variant="ghost" size={16} onPress={() => void client.leave()} />
        </View>
      </View>

      <Panel style={styles.players}>
        <Txt size={18} weight="800" color={COLORS.textDim}>
          PLAYERS · {room.players.length} of {room.settings.maxSeats} seats
        </Txt>
        {room.players.map((p) => (
          <View key={p.id} style={styles.playerRow}>
            <Avatar id={p.avatar} size={44} />
            <Txt size={22} weight="700" style={{ flex: 1 }} numberOfLines={1}>
              {p.name}
              {p.id === room.selfId ? ' (you)' : ''}
            </Txt>
            {p.isHost && (
              <Txt size={14} weight="800" color={COLORS.accent}>
                HOST
              </Txt>
            )}
            <View
              style={[styles.state, { backgroundColor: p.ready ? COLORS.ok : COLORS.panelBorder }]}
            >
              <Txt size={15} weight="800" color={p.ready ? COLORS.symbolDark : COLORS.text}>
                {p.ready ? '✓ Ready' : 'Not ready'}
              </Txt>
            </View>
          </View>
        ))}
        {Array.from(
          { length: Math.max(0, room.settings.maxSeats - room.players.length) },
          (_, i) => (
            <View key={`open-${i}`} style={styles.playerRow}>
              <View style={styles.openSeat} />
              <Txt size={20} color={COLORS.textDim}>
                Open seat
              </Txt>
            </View>
          ),
        )}
      </Panel>

      <Panel style={styles.side}>
        <Txt size={18} weight="800" color={COLORS.textDim}>
          {isHost ? 'ROOM SETTINGS' : 'ROOM'}
        </Txt>
        {isHost ? (
          <Stepper
            label="Max seats"
            value={room.settings.maxSeats}
            min={2}
            max={7}
            onChange={(maxSeats) => void client.updateSettings({ maxSeats })}
          />
        ) : (
          <Txt size={20}>Max seats: {room.settings.maxSeats} (host sets this)</Txt>
        )}
        {isDevHarness(client) && isHost && (
          <View style={{ gap: 6 }}>
            <Txt size={13} weight="800" color={COLORS.accent}>
              DEV HARNESS
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn
                label="+ Opponent"
                variant="secondary"
                size={16}
                onPress={() => client.addDevOpponent()}
              />
              <Btn
                label="− Opponent"
                variant="secondary"
                size={16}
                onPress={() => client.removeDevOpponent()}
              />
            </View>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Btn
          label={me?.ready ? 'Not ready' : "I'm ready"}
          variant={me?.ready ? 'secondary' : 'primary'}
          onPress={() => void client.setReady(!me?.ready)}
        />
        {isHost ? (
          <Btn label="Start game" disabled={!everyoneReady} onPress={() => void client.start()} />
        ) : (
          <Txt size={16} color={COLORS.textDim} align="center">
            Waiting for the host to start
          </Txt>
        )}
        {isHost && !everyoneReady && (
          <Txt size={14} color={COLORS.textDim} align="center">
            Needs 2+ players, all ready
          </Txt>
        )}
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    position: 'absolute',
    left: 70,
    right: 70,
    top: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  players: { position: 'absolute', left: 70, top: 210, width: 700, height: 470, gap: 8 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  state: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  openSeat: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.panelBorder,
  },
  side: { position: 'absolute', left: 810, top: 210, width: 400, height: 470, gap: 14 },
});
