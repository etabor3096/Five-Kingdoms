import { StyleSheet, Text, View } from 'react-native';
import { avatarById } from '../design/avatars';
import { COLORS } from '../design/tokens';

/** A round avatar: palette colour behind a glyph. */
export function Avatar({
  id,
  size = 64,
  ring,
}: {
  id: string;
  size?: number;
  /** Highlight ring colour (e.g. the player whose turn it is). */
  ring?: string;
}) {
  const a = avatarById(id);
  return (
    <View
      accessibilityLabel={`${a.label} avatar`}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: a.color,
          borderColor: ring ?? COLORS.cardEdge,
          borderWidth: ring ? 4 : 2,
        },
      ]}
    >
      <Text style={{ fontSize: size * 0.52 }}>{a.glyph}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
