import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Card, CardId, Rank } from '@five-kingdoms/engine';
import { CARD_SIZES, COLORS } from '../../design/tokens';
import { handFan } from '../../layout/hand';
import { CardFace } from '../cards/CardFace';

const W = CARD_SIZES.hand;

/** One card in the fan; lifts when selected (animates transform only). */
function FanCard({
  card,
  wildRank,
  x,
  y,
  rotate,
  selected,
  onPress,
}: {
  card: Card;
  wildRank: Rank | null;
  x: number;
  y: number;
  rotate: number;
  selected: boolean;
  onPress: () => void;
}) {
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = withTiming(selected ? -30 : 0, { duration: 140 });
  }, [selected, lift]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y }, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={{ transform: [{ rotate: `${rotate}deg` }] }}
      >
        <View
          style={{
            borderRadius: 10,
            borderWidth: selected ? 3 : 0,
            borderColor: COLORS.accent,
            margin: selected ? -3 : 0,
          }}
        >
          <CardFace card={card} wildRank={wildRank} width={W} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** The viewer's hand, fanned along the bottom of the canvas. */
export function FanHand({
  cards,
  wildRank,
  selectedId,
  onSelect,
}: {
  cards: readonly Card[];
  wildRank: Rank | null;
  selectedId: CardId | null;
  onSelect: (id: CardId) => void;
}) {
  const fan = handFan(cards.length, W);
  return (
    <>
      {cards.map((card, i) => {
        const pos = fan[i];
        if (!pos) return null;
        return (
          <FanCard
            key={card.id}
            card={card}
            wildRank={wildRank}
            x={pos.x}
            y={pos.y}
            rotate={pos.rotate}
            selected={card.id === selectedId}
            onPress={() => onSelect(card.id)}
          />
        );
      })}
    </>
  );
}
