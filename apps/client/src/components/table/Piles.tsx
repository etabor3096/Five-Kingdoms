import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import type { Card, Rank } from '@five-kingdoms/engine';
import { CANVAS, CARD, CARD_SIZES, COLORS } from '../../design/tokens';
import { CardBack } from '../cards/CardBack';
import { CardFace } from '../cards/CardFace';
import { Txt } from '../ui';

const W = CARD_SIZES.pile;
export const PILES_TOP = 240;

/** Draw pile and discard top in the middle of the table. Both are tappable to draw. */
export function Piles({
  drawCount,
  discardTop,
  discardCount,
  wildRank,
  highlight,
  onDrawStock,
  onDiscardPile,
}: {
  drawCount: number;
  discardTop: Card | null;
  discardCount: number;
  wildRank: Rank | null;
  /** Glow the piles when the viewer must draw. */
  highlight: boolean;
  onDrawStock: () => void;
  onDiscardPile: () => void;
}) {
  const ring = highlight
    ? { borderColor: COLORS.accent, borderWidth: 3 }
    : { borderColor: 'transparent', borderWidth: 3 };
  return (
    <>
      <Pressable
        onPress={onDrawStock}
        accessibilityRole="button"
        accessibilityLabel={`Draw pile, ${drawCount} cards`}
        style={[styles.pile, { left: CANVAS.width / 2 - W - 16, top: PILES_TOP }, ring]}
      >
        <View style={styles.stack}>
          <CardBack width={W} />
        </View>
        <Txt size={16} weight="800" style={styles.count}>
          {drawCount}
        </Txt>
      </Pressable>
      <Pressable
        onPress={onDiscardPile}
        accessibilityRole="button"
        accessibilityLabel="Discard pile"
        style={[styles.pile, { left: CANVAS.width / 2 + 16, top: PILES_TOP }, ring]}
      >
        {discardTop ? (
          <Animated.View key={discardTop.id} entering={ZoomIn.duration(170)}>
            <CardFace card={discardTop} wildRank={wildRank} width={W} />
          </Animated.View>
        ) : (
          <View style={[styles.empty, { width: W, height: W * CARD.aspect }]} />
        )}
        <Txt size={16} weight="800" style={styles.count}>
          {discardCount}
        </Txt>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  pile: { position: 'absolute', borderRadius: 14, padding: 2 },
  stack: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 3, height: 4 },
  },
  count: { position: 'absolute', bottom: -26, alignSelf: 'center' },
  empty: { borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.textDim },
});
