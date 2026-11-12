import { memo } from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { CARD, COLORS } from '../../design/tokens';

/** The card back: navy with a gold lattice and a crown. */
function CardBackImpl({ width }: { width: number }) {
  const lines: number[] = [];
  for (let i = -140; i <= 140; i += 20) lines.push(i);
  return (
    <Svg
      width={width}
      height={width * CARD.aspect}
      viewBox={`0 0 ${CARD.viewW} ${CARD.viewH}`}
      accessibilityLabel="Card back"
    >
      <Rect
        x={1.5}
        y={1.5}
        width={97}
        height={137}
        rx={CARD.radius}
        fill={COLORS.cardBack}
        stroke={COLORS.cardEdge}
        strokeWidth={2}
      />
      <Rect
        x={7}
        y={7}
        width={86}
        height={126}
        rx={5}
        fill="none"
        stroke={COLORS.cardBackAccent}
        strokeWidth={1.6}
      />
      <G opacity={0.35}>
        {lines.map((o) => (
          <G key={o}>
            <Path d={`M${o} 0 L${o + 140} 140`} stroke={COLORS.cardBackAccent} strokeWidth={1} />
            <Path d={`M${o + 140} 0 L${o} 140`} stroke={COLORS.cardBackAccent} strokeWidth={1} />
          </G>
        ))}
      </G>
      <Circle
        cx={50}
        cy={70}
        r={25}
        fill={COLORS.cardBack}
        stroke={COLORS.cardBackAccent}
        strokeWidth={2}
      />
      <Path
        d="M34 82 L37 58 L44 68 L50 54 L56 68 L63 58 L66 82 Z"
        fill={COLORS.cardBackAccent}
        stroke={COLORS.cardEdge}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <Circle cx={37} cy={56} r={2.6} fill={COLORS.cardBackAccent} />
      <Circle cx={50} cy={52} r={2.6} fill={COLORS.cardBackAccent} />
      <Circle cx={63} cy={56} r={2.6} fill={COLORS.cardBackAccent} />
    </Svg>
  );
}

export const CardBack = memo(CardBackImpl);
