import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from 'react-native';
import { Avatar } from '../components/Avatar';
import { TurnTimerToggle } from '../components/TurnTimerToggle';
import { Btn, DevBadge, Panel, Stepper, Txt } from '../components/ui';
import { AVATARS } from '../design/avatars';
import { COLORS } from '../design/tokens';
import { ROOM_CODE_LENGTH, normalizeRoomCode, type Profile } from '../net/GameClient';
import { isDevHarness } from '../net/LocalGameClient';
import { MAX_NAME_LENGTH, cleanName } from '../storage/profile';
import { useStore } from '../state/ClientContext';

type Step = 'home' | 'create' | 'join';

/** Main menu plus the Create / Join step. Name and avatar are kept on the device. */
export function MenuScreen({
  profile,
  onProfile,
}: {
  profile: Profile;
  onProfile: (patch: Partial<Profile>) => void;
}) {
  const { client, showToast } = useStoreActions();
  const [step, setStep] = useState<Step>('home');
  const [maxSeats, setMaxSeats] = useState(4);
  const [turnTimer, setTurnTimer] = useState(false);
  const [code, setCode] = useState('');
  const [opponents, setOpponents] = useState(3);

  const named = cleanName(profile.name).length > 0;
  const who: Profile = { ...profile, name: cleanName(profile.name) };
  const applyOpponents = (): void => {
    if (isDevHarness(client)) client.setOpponentCount(opponents);
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Txt size={64} weight="900" color={COLORS.accent}>
          Five Kingdoms
        </Txt>
        <Txt size={22} color={COLORS.textDim}>
          Eleven rounds. Five kingdoms. One crown.
        </Txt>
        {isDevHarness(client) && <DevBadge />}
      </View>

      <Panel style={styles.profile}>
        <Txt size={18} weight="800" color={COLORS.textDim}>
          YOUR PLAYER
        </Txt>
        <TextInput
          value={profile.name}
          onChangeText={(name) => onProfile({ name })}
          placeholder="Your name"
          placeholderTextColor={COLORS.textDim}
          maxLength={MAX_NAME_LENGTH}
          accessibilityLabel="Your name"
          style={styles.input}
        />
        <View style={styles.avatars}>
          {AVATARS.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={`${a.label} avatar`}
              accessibilityState={{ selected: a.id === profile.avatar }}
              onPress={() => onProfile({ avatar: a.id })}
              style={[styles.avatarBtn, a.id === profile.avatar && styles.avatarOn]}
            >
              <Avatar id={a.id} size={56} />
            </Pressable>
          ))}
        </View>
      </Panel>

      <Panel style={styles.actions}>
        {step === 'home' && (
          <>
            <Btn label="Create room" disabled={!named} onPress={() => setStep('create')} />
            <Btn
              label="Join room"
              variant="secondary"
              disabled={!named}
              onPress={() => setStep('join')}
            />
            {!named && (
              <Txt size={15} color={COLORS.textDim} align="center">
                Enter a name to play
              </Txt>
            )}
            {isDevHarness(client) && (
              <View style={{ marginTop: 8 }}>
                <Stepper
                  label="Dev opponents"
                  value={opponents}
                  min={1}
                  max={6}
                  onChange={setOpponents}
                />
              </View>
            )}
          </>
        )}
        {step === 'create' && (
          <>
            <Txt size={22} weight="800">
              New room
            </Txt>
            <Stepper
              label="Seats at the table"
              value={maxSeats}
              min={2}
              max={7}
              onChange={setMaxSeats}
            />
            <TurnTimerToggle value={turnTimer} onChange={setTurnTimer} />
            <Btn
              label="Create"
              onPress={() => {
                applyOpponents();
                void client.createRoom(who, { maxSeats, turnTimer });
              }}
            />
            <Btn label="Back" variant="ghost" size={18} onPress={() => setStep('home')} />
          </>
        )}
        {step === 'join' && (
          <>
            <Txt size={22} weight="800">
              Join a room
            </Txt>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(normalizeRoomCode(t).slice(0, ROOM_CODE_LENGTH))}
              placeholder="ROOM CODE"
              placeholderTextColor={COLORS.textDim}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={ROOM_CODE_LENGTH}
              accessibilityLabel="Room code"
              style={[styles.input, styles.code]}
            />
            <Btn
              label="Join"
              onPress={() => {
                if (code.length !== ROOM_CODE_LENGTH)
                  showToast(`Room codes have ${ROOM_CODE_LENGTH} characters`);
                else {
                  applyOpponents();
                  void client.joinRoom(code, who);
                }
              }}
            />
            <Btn label="Back" variant="ghost" size={18} onPress={() => setStep('home')} />
          </>
        )}
      </Panel>
    </View>
  );
}

function useStoreActions() {
  const store = useStore();
  return { client: store.client, showToast: (t: string) => store.showToast(t) };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { position: 'absolute', left: 80, top: 90, gap: 10, width: 520 },
  profile: { position: 'absolute', left: 80, top: 330, width: 520, gap: 14 },
  actions: { position: 'absolute', left: 700, top: 200, width: 440, gap: 14 },
  input: {
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    borderColor: COLORS.panelBorder,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 24,
    fontWeight: '700',
  },
  code: { textAlign: 'center', letterSpacing: 8, fontSize: 36 },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarBtn: { padding: 3, borderRadius: 34, borderWidth: 3, borderColor: 'transparent' },
  avatarOn: { borderColor: COLORS.accent },
});
