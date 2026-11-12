/** Design tokens: palette, card geometry and the fixed logical canvas. */

import type { Suit } from '@five-kingdoms/engine';

/** The table is laid out on a fixed 16:9 canvas that is scaled to the screen. */
export const CANVAS = { width: 1280, height: 720 } as const;

/** Okabe-Ito colour-blind-safe palette (https://jfly.uni-koeln.de/color/). */
export const OKABE_ITO = {
  black: '#000000',
  orange: '#E69F00',
  skyBlue: '#56B4E9',
  bluishGreen: '#009E73',
  yellow: '#F0E442',
  blue: '#0072B2',
  vermillion: '#D55E00',
  reddishPurple: '#CC79A7',
} as const;

/** One colour per kingdom. Colour is never the only signal: each also has its own crest shape. */
export const KINGDOM_COLORS: Record<Suit, string> = {
  stars: OKABE_ITO.yellow,
  hearts: OKABE_ITO.vermillion,
  diamonds: OKABE_ITO.skyBlue,
  clubs: OKABE_ITO.bluishGreen,
  spades: OKABE_ITO.blue,
};

export const KINGDOM_NAMES: Record<Suit, string> = {
  stars: 'Stars',
  hearts: 'Hearts',
  diamonds: 'Diamonds',
  clubs: 'Clubs',
  spades: 'Spades',
};

export const COLORS = {
  // Table and chrome
  bg: '#0b1d1a',
  felt: '#14473c',
  feltEdge: '#0d2f28',
  panel: '#12262a',
  panelBorder: '#2c4a50',
  text: '#f4efe2',
  textDim: '#9db3ad',
  accent: '#e8b84a',
  danger: '#e0654f',
  ok: '#58c28b',
  // Cards
  cardFace: '#fbf7ee',
  cardEdge: '#2a2a33',
  ink: '#1b1b22',
  /** Symbols on crest fills use pure black or white, whichever contrasts more. */
  symbolDark: '#000000',
  inkLight: '#ffffff',
  wild: '#f2b705',
  wildGlow: '#fff2b0',
  cardBack: '#1c2f5e',
  cardBackAccent: '#e8b84a',
  jokerA: '#CC79A7',
  jokerB: '#0072B2',
  jokerC: '#E69F00',
} as const;

/** Card art lives in a 100 x 140 viewBox; on screen it is scaled to the requested width. */
export const CARD = { viewW: 100, viewH: 140, aspect: 1.4, radius: 9 } as const;

/** On-canvas card sizes in logical pixels (the canvas as a whole is scaled to the screen). */
export const CARD_SIZES = { hand: 96, pile: 92, meld: 56, seat: 30 } as const;

export const FONT = { display: 'System', mono: 'Menlo, Consolas, monospace' } as const;
