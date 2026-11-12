import { G, Path } from 'react-native-svg';
import type { Suit } from '@five-kingdoms/engine';
import { bestInk } from '../../design/color';
import { COLORS, KINGDOM_COLORS } from '../../design/tokens';
import { CREST_BOX, CREST_PATHS, SYMBOL_BOX, SYMBOL_PATHS } from './suitArt';

/** Symbol colour that reads best on a kingdom's crest fill. */
export function symbolInk(suit: Suit): string {
  return bestInk(KINGDOM_COLORS[suit], [COLORS.symbolDark, COLORS.inkLight]);
}

/**
 * A kingdom crest: its own outline shape, filled with the kingdom colour, holding the
 * classic suit symbol. Draws in a 40 x 40 box placed at (x, y) and scaled by `size / 40`.
 */
export function Crest({ suit, x, y, size }: { suit: Suit; x: number; y: number; size: number }) {
  const s = size / CREST_BOX;
  const inset = (CREST_BOX - SYMBOL_BOX * 0.78) / 2;
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Path
        d={CREST_PATHS[suit]}
        fill={KINGDOM_COLORS[suit]}
        stroke={COLORS.cardEdge}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <G transform={`translate(${inset} ${inset + 1}) scale(0.78)`}>
        <Path d={SYMBOL_PATHS[suit]} fill={symbolInk(suit)} fillRule="evenodd" />
      </G>
    </G>
  );
}
