import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Action, Card, CardId, Rank } from '@five-kingdoms/engine';
import {
  checkDraft,
  draftFromPlan,
  draftToAction,
  moveCard,
  type ArrangeDraft,
  type ArrangeMode,
  type Target,
} from '../../arrange/model';
import type { TurnPlan } from '../../game/plans';
import { COLORS } from '../../design/tokens';
import { CardFace } from '../cards/CardFace';
import { Btn, Txt } from '../ui';

const CARD_W = 62;

/** One tappable drop zone holding a row of cards. */
function Zone({
  title,
  note,
  cards,
  wildRank,
  selectedId,
  armed,
  tone = 'neutral',
  onCard,
  onZone,
  width,
}: {
  title: string;
  note?: string | null;
  cards: readonly Card[];
  wildRank: Rank;
  selectedId: CardId | null;
  /** A card is selected, so this zone is a valid place to put it. */
  armed: boolean;
  tone?: 'neutral' | 'bad' | 'good';
  onCard: (id: CardId) => void;
  onZone: () => void;
  width: number;
}) {
  const border = tone === 'bad' ? COLORS.danger : tone === 'good' ? COLORS.ok : COLORS.panelBorder;
  return (
    <Pressable
      onPress={onZone}
      accessibilityRole="button"
      accessibilityLabel={`${title}${armed ? ': move selected card here' : ''}`}
      style={[styles.zone, { width, borderColor: border }, armed && styles.armed]}
    >
      <View style={styles.zoneHead}>
        <Txt size={14} weight="800" color={COLORS.textDim}>
          {title}
        </Txt>
        {note ? (
          <Txt size={13} weight="700" color={tone === 'bad' ? COLORS.danger : COLORS.ok}>
            {note}
          </Txt>
        ) : null}
      </View>
      <View style={styles.cards}>
        {cards.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onCard(c.id)}
            accessibilityRole="button"
            style={[styles.cardBox, c.id === selectedId && styles.selected]}
          >
            <CardFace card={c} wildRank={wildRank} width={CARD_W} />
          </Pressable>
        ))}
        {cards.length === 0 && (
          <Txt size={14} color={COLORS.textDim}>
            {armed ? 'Tap to place here' : 'Empty'}
          </Txt>
        )}
      </View>
    </Pressable>
  );
}

/**
 * The arrange-melds mode used for going out and for final-turn lay-downs. It starts from the
 * solver's plan; tap a card, then tap where it should go. Confirm sends the engine action.
 */
export function ArrangeSheet({
  hand,
  wildRank,
  mode,
  plan,
  bannedDiscardId,
  onConfirm,
  onCancel,
}: {
  hand: readonly Card[];
  wildRank: Rank;
  mode: ArrangeMode;
  plan: TurnPlan;
  bannedDiscardId: CardId | null;
  onConfirm: (action: Extract<Action, { type: 'goOut' | 'finalTurnLayDown' }>) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ArrangeDraft>(() => draftFromPlan(hand, plan));
  const [selectedId, setSelectedId] = useState<CardId | null>(null);
  const check = useMemo(
    () => checkDraft(draft, wildRank, mode, bannedDiscardId),
    [draft, wildRank, mode, bannedDiscardId],
  );

  const place = (target: Target): void => {
    if (selectedId === null) return;
    setDraft((d) => moveCard(d, selectedId, target));
    setSelectedId(null);
  };
  const toggle = (id: CardId): void => setSelectedId((cur) => (cur === id ? null : id));
  const armed = selectedId !== null;

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <Txt size={28} weight="800">
          {mode === 'goOut' ? 'Go out' : 'Final turn: lay down your melds'}
        </Txt>
        <Txt size={16} color={COLORS.textDim}>
          {mode === 'goOut'
            ? 'Every card must be in a meld except the one you discard. Tap a card, then tap where it goes.'
            : 'Lay down what you can; cards left over are scored against you. Tap a card, then tap where it goes.'}
        </Txt>

        <View style={styles.meldGrid}>
          {draft.melds.map((meld, i) => (
            <Zone
              key={meld.map((c) => c.id).join('-')}
              title={`MELD ${i + 1}`}
              note={check.meldProblems[i] ?? '✓ valid'}
              tone={check.meldProblems[i] ? 'bad' : 'good'}
              cards={meld}
              wildRank={wildRank}
              selectedId={selectedId}
              armed={armed}
              width={meld.length > 4 ? 520 : 260}
              onCard={toggle}
              onZone={() => place({ kind: 'meld', index: i })}
            />
          ))}
          <Zone
            title="NEW MELD"
            cards={[]}
            wildRank={wildRank}
            selectedId={selectedId}
            armed={armed}
            width={200}
            onCard={toggle}
            onZone={() => place({ kind: 'newMeld' })}
          />
        </View>

        <View style={styles.bottomRow}>
          <Zone
            title={mode === 'goOut' ? 'NOT IN A MELD (must be empty)' : 'LEFT IN HAND (scored)'}
            tone={mode === 'goOut' && draft.rest.length > 0 ? 'bad' : 'neutral'}
            cards={draft.rest}
            wildRank={wildRank}
            selectedId={selectedId}
            armed={armed}
            width={560}
            onCard={toggle}
            onZone={() => place({ kind: 'rest' })}
          />
          <Zone
            title="DISCARD"
            tone={draft.discard && draft.discard.id !== bannedDiscardId ? 'good' : 'bad'}
            cards={draft.discard ? [draft.discard] : []}
            wildRank={wildRank}
            selectedId={selectedId}
            armed={armed}
            width={200}
            onCard={toggle}
            onZone={() => place({ kind: 'discard' })}
          />
        </View>

        <View style={styles.footer}>
          <Txt
            size={16}
            color={check.ok ? COLORS.ok : COLORS.danger}
            weight="700"
            style={{ flex: 1 }}
          >
            {check.ok ? 'Ready to confirm' : check.problems.join(' · ')}
          </Txt>
          <Btn
            label="Auto-arrange"
            variant="secondary"
            size={18}
            onPress={() => {
              setDraft(draftFromPlan(hand, plan));
              setSelectedId(null);
            }}
          />
          <Btn label="Cancel" variant="ghost" size={18} onPress={onCancel} />
          <Btn
            label={mode === 'goOut' ? 'Go out!' : 'Lay down'}
            disabled={!check.ok}
            size={20}
            onPress={() => onConfirm(draftToAction(draft, mode))}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,10,9,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  sheet: {
    width: 1160,
    height: 650,
    backgroundColor: COLORS.panel,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.panelBorder,
    padding: 22,
    gap: 10,
  },
  meldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    flex: 1,
    alignContent: 'flex-start',
  },
  bottomRow: { flexDirection: 'row', gap: 10 },
  zone: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 8,
    minHeight: 124,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  armed: { borderStyle: 'dashed', borderColor: COLORS.accent },
  zoneHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  cardBox: { borderRadius: 9, borderWidth: 3, borderColor: 'transparent' },
  selected: { borderColor: COLORS.accent, transform: [{ translateY: -6 }] },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
