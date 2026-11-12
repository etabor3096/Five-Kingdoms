import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { EMOTE_IDS, type EmoteId } from '@five-kingdoms/protocol';
import { EMOTES } from '../../design/emotes';
import { COLORS } from '../../design/tokens';
import { Btn, Txt } from '../ui';

/** The emote button and its popup of eight quick emotes. */
export function EmotePicker({
  onPick,
  left,
  top,
}: {
  onPick: (emote: EmoteId) => void;
  left: number;
  top: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ position: 'absolute', left, top, zIndex: 60 }}>
      {open && (
        <View style={styles.popup}>
          {EMOTE_IDS.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={EMOTES[id].label}
              onPress={() => {
                onPick(id);
                setOpen(false);
              }}
              style={styles.item}
            >
              <Txt size={30}>{EMOTES[id].glyph}</Txt>
              <Txt size={12} color={COLORS.textDim} weight="700">
                {EMOTES[id].label}
              </Txt>
            </Pressable>
          ))}
        </View>
      )}
      <Btn
        label={open ? 'Close' : '😀 Emote'}
        variant="secondary"
        size={18}
        onPress={() => setOpen((o) => !o)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  popup: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    width: 328,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 8,
    borderRadius: 14,
    backgroundColor: COLORS.panel,
    borderWidth: 2,
    borderColor: COLORS.panelBorder,
  },
  item: { width: 74, alignItems: 'center', paddingVertical: 6, borderRadius: 10 },
});
