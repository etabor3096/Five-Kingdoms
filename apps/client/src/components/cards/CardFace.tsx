import { memo } from 'react';
import Svg, { Circle, G, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { isWild, type Card, type Rank } from '@five-kingdoms/engine';
import { CARD, COLORS } from '../../design/tokens';
import { Crest } from './Crest';
import { rankLabel } from './suitArt';

export interface CardFaceProps {
  card: Card;
  /** The current round's wild rank; matching cards get the wild highlight. Jokers always do. */
  wildRank: Rank | null;
  /** Rendered width in logical pixels; height follows the card's aspect ratio. */
  width: number;
  /** Greys the card out (e.g. cards that cannot be played right now). */
  dim?: boolean;
}

const FONT = 'Georgia, "Times New Roman", serif';

/** An SVG playing card face for the Five Kingdoms deck. */
function CardFaceImpl({ card, wildRank, width, dim = false }: CardFaceProps) {
  const wild = wildRank !== null && isWild(card, wildRank);
  const height = width * CARD.aspect;
  const label = card.suit === 'joker' ? 'Joker' : `${rankLabel(card.rank)} of ${card.suit}`;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${CARD.viewW} ${CARD.viewH}`}
      accessibilityLabel={wild ? `${label}, wild` : label}
      opacity={dim ? 0.55 : 1}
    >
      {wild && (
        <Rect
          x={0}
          y={0}
          width={CARD.viewW}
          height={CARD.viewH}
          rx={CARD.radius + 2}
          fill={COLORS.wildGlow}
        />
      )}
      <Rect
        x={wild ? 3 : 1.5}
        y={wild ? 3 : 1.5}
        width={CARD.viewW - (wild ? 6 : 3)}
        height={CARD.viewH - (wild ? 6 : 3)}
        rx={CARD.radius}
        fill={COLORS.cardFace}
        stroke={wild ? COLORS.wild : COLORS.cardEdge}
        strokeWidth={wild ? 5 : 2}
      />
      {card.suit === 'joker' ? <JokerArt /> : <SuitedArt suit={card.suit} rank={card.rank} />}
      {wild && <WildRibbon text={card.suit === 'joker' ? 'JOKER' : 'WILD'} />}
    </Svg>
  );
}

function SuitedArt({ suit, rank }: { suit: Exclude<Card['suit'], 'joker'>; rank: Rank }) {
  const text = rankLabel(rank);
  return (
    <G>
      <SvgText
        x={text.length > 1 ? 9 : 13}
        y={50}
        fontSize={text.length > 1 ? 40 : 48}
        fontWeight="800"
        fontFamily={FONT}
        fill={COLORS.ink}
      >
        {text}
      </SvgText>
      <Crest suit={suit} x={50} y={56} size={44} />
      <Crest suit={suit} x={11} y={58} size={22} />
    </G>
  );
}

/** An original jester: three-horned cap with bells, a smiling face and a collar. */
function JokerArt() {
  return (
    <G>
      <Polygon
        points="50,76 17,50 12,24 38,47"
        fill={COLORS.jokerA}
        stroke={COLORS.ink}
        strokeWidth={1.6}
      />
      <Polygon
        points="50,76 83,50 88,24 62,47"
        fill={COLORS.jokerB}
        stroke={COLORS.ink}
        strokeWidth={1.6}
      />
      <Polygon
        points="37,68 50,13 63,68"
        fill={COLORS.jokerC}
        stroke={COLORS.ink}
        strokeWidth={1.6}
      />
      <Circle cx={12} cy={22} r={5} fill={COLORS.wild} stroke={COLORS.ink} strokeWidth={1.4} />
      <Circle cx={88} cy={22} r={5} fill={COLORS.wild} stroke={COLORS.ink} strokeWidth={1.4} />
      <Circle cx={50} cy={11} r={5} fill={COLORS.wild} stroke={COLORS.ink} strokeWidth={1.4} />
      <Rect x={30} y={66} width={40} height={9} rx={3} fill={COLORS.ink} />
      <Circle cx={50} cy={92} r={19} fill="#ffffff" stroke={COLORS.ink} strokeWidth={2} />
      <Circle cx={43} cy={88} r={2.6} fill={COLORS.ink} />
      <Circle cx={57} cy={88} r={2.6} fill={COLORS.ink} />
      <Path
        d="M41 97 Q50 106 59 97"
        fill="none"
        stroke={COLORS.ink}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <Polygon
        points="30,108 40,112 50,106 60,112 70,108 62,120 38,120"
        fill={COLORS.jokerA}
        stroke={COLORS.ink}
        strokeWidth={1.4}
      />
    </G>
  );
}

/** The "wild" marker: a gold band across the foot of the card. */
function WildRibbon({ text }: { text: string }) {
  return (
    <G>
      <Rect
        x={6}
        y={118}
        width={88}
        height={17}
        rx={5}
        fill={COLORS.wild}
        stroke={COLORS.ink}
        strokeWidth={1.6}
      />
      <SvgText
        x={50}
        y={131}
        fontSize={13}
        fontWeight="800"
        fontFamily={FONT}
        fill={COLORS.symbolDark}
        textAnchor="middle"
      >
        {text}
      </SvgText>
    </G>
  );
}

export const CardFace = memo(CardFaceImpl);
