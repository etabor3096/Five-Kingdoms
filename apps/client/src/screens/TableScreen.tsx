import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Action, CardId, GameView } from '@five-kingdoms/engine';
import { PauseBanner } from '../components/PauseBanner';
import { Btn, DevBadge, Txt } from '../components/ui';
import { isDevHarness } from '../net/LocalGameClient';
import { CardFace } from '../components/cards/CardFace';
import { ArrangeSheet } from '../components/table/ArrangeSheet';
import { EmotePicker } from '../components/table/EmotePicker';
import { FanHand } from '../components/table/FanHand';
import { Piles } from '../components/table/Piles';
import { SeatBadge } from '../components/table/SeatBadge';
import { CANVAS, COLORS } from '../design/tokens';
import type { ArrangeMode } from '../arrange/model';
import { applyOrder, reconcileOrder, sortedOrder } from '../game/handOrder';
import { planFinalTurn, planGoOut, type TurnPlan } from '../game/plans';
import { seatLayout } from '../layout/seats';
import { useSnapshot, useStore } from '../state/ClientContext';

/** What the viewer should do right now, as one line of guidance. */
function promptFor(view: GameView, isMyTurn: boolean, canOut: boolean): string {
  const current = view.players.find((p) => p.id === view.currentPlayerId)?.name ?? '…';
  if (!isMyTurn)
    return view.outPlayerId ? `${current} is on a final turn…` : `${current} is playing…`;
  if (view.phase === 'awaitingDraw') return 'Your turn: tap the draw pile or the top discard';
  if (view.outPlayerId) return 'Final turn: lay down what you can and discard';
  return canOut ? 'You can go out!' : 'Select a card, then Discard';
}

/** The table: seats, piles, the viewer's fanned hand, and the turn actions. */
export function TableScreen() {
  const store = useStore();
  const { client } = store;
  const { view, room, emotes, bannedDiscardId } = useSnapshot();
  const [selectedId, setSelectedId] = useState<CardId | null>(null);
  const [order, setOrder] = useState<CardId[]>([]);
  const [arrange, setArrange] = useState<{ mode: ArrangeMode; plan: TurnPlan } | null>(null);

  const hand = view?.hand;
  useEffect(() => {
    if (!hand) return;
    setOrder((prev) => reconcileOrder(prev, hand));
    setSelectedId((cur) => (cur !== null && hand.some((c) => c.id === cur) ? cur : null));
  }, [hand]);

  const wildRank = view?.wildRank ?? null;
  const isMyTurn = view !== null && view.currentPlayerId === view.viewerId;
  const canAct = isMyTurn && view?.phase === 'awaitingDiscard';
  const finalTurn = view?.outPlayerId != null;

  const goOutPlan = useMemo(
    () =>
      view && wildRank && canAct && !finalTurn
        ? planGoOut(view.hand, wildRank, bannedDiscardId)
        : null,
    [view, wildRank, canAct, finalTurn, bannedDiscardId],
  );

  const ordered = useMemo(() => (hand ? applyOrder(order, hand) : []), [order, hand]);
  const slots = useMemo(
    () =>
      view
        ? seatLayout(
            view.players.map((p) => p.id),
            view.viewerId,
          )
        : [],
    [view],
  );

  if (!view || !room || !wildRank) return null;

  const send = (action: Exclude<Action, { type: 'startNextRound' }>): void => {
    void client.sendAction(action);
  };

  const drawFromStock = (): void => {
    if (isMyTurn && view.phase === 'awaitingDraw') send({ type: 'drawFromStock' });
    else if (isMyTurn) store.showToast('You have already drawn. Discard a card.');
    else store.showToast("It's not your turn.");
  };
  const tapDiscardPile = (): void => {
    if (!isMyTurn) store.showToast("It's not your turn.");
    else if (view.phase === 'awaitingDraw') send({ type: 'drawFromDiscard' });
    else if (selectedId !== null && !finalTurn) send({ type: 'discard', cardId: selectedId });
    else
      store.showToast(finalTurn ? 'Use Lay down on your final turn.' : 'Select a card to discard.');
  };

  const openArrange = (mode: ArrangeMode): void => {
    const plan = mode === 'goOut' ? goOutPlan : planFinalTurn(view.hand, wildRank, bannedDiscardId);
    if (plan) setArrange({ mode, plan });
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={styles.felt} />

      {slots.map((slot) => {
        const player = view.players.find((p) => p.id === slot.playerId);
        if (!player) return null;
        return (
          <SeatBadge
            key={slot.playerId}
            x={slot.x}
            y={slot.y}
            player={player}
            profile={room.players.find((p) => p.id === slot.playerId)}
            isTurn={view.currentPlayerId === slot.playerId}
            isDealer={view.dealerId === slot.playerId}
            isOut={view.outPlayerId === slot.playerId}
            emote={emotes[slot.playerId]}
            compact={slot.isSelf}
          />
        );
      })}

      <View style={styles.hud}>
        <Txt size={22} weight="800">
          Round {view.round} of 11
        </Txt>
        <View style={styles.wildRow}>
          <Txt size={16} color={COLORS.textDim} weight="700">
            WILD
          </Txt>
          <CardFace
            card={{ id: -1, suit: 'stars', rank: wildRank }}
            wildRank={wildRank}
            width={34}
          />
          <Txt size={16} color={COLORS.textDim}>
            and Jokers
          </Txt>
        </View>
      </View>
      <View style={styles.topRight}>
        {isDevHarness(client) && <DevBadge />}
        <Btn label="Leave" variant="ghost" size={16} onPress={() => void client.leave()} />
      </View>

      <Piles
        drawCount={view.drawPileCount}
        discardCount={view.discardCount}
        discardTop={view.discardTop}
        wildRank={wildRank}
        highlight={isMyTurn && view.phase === 'awaitingDraw'}
        onDrawStock={drawFromStock}
        onDiscardPile={tapDiscardPile}
      />
      <View style={styles.prompt} pointerEvents="none">
        <Txt size={22} weight="700" color={isMyTurn ? COLORS.accent : COLORS.text} align="center">
          {promptFor(view, isMyTurn, goOutPlan !== null)}
        </Txt>
      </View>

      <FanHand
        cards={ordered}
        wildRank={wildRank}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
      />

      <View style={styles.actions}>
        {finalTurn ? (
          <Btn
            label="Lay down melds"
            size={18}
            disabled={!canAct}
            onPress={() => openArrange('finalTurn')}
          />
        ) : (
          <>
            <Btn
              label="Go out"
              disabled={goOutPlan === null}
              onPress={() => openArrange('goOut')}
            />
            <Btn
              label="Discard"
              variant="secondary"
              disabled={!(canAct && selectedId !== null)}
              onPress={() => selectedId !== null && send({ type: 'discard', cardId: selectedId })}
            />
          </>
        )}
        <Btn
          label="Sort hand"
          variant="ghost"
          size={16}
          onPress={() => setOrder(sortedOrder(view.hand))}
        />
      </View>

      <PauseBanner
        room={room}
        onDecide={(ids, decision) => ids.forEach((id) => void client.hostDecision(id, decision))}
      />

      <EmotePicker left={30} top={540} onPick={(e) => void client.sendEmote(e)} />

      {arrange && (
        <ArrangeSheet
          hand={view.hand}
          wildRank={wildRank}
          mode={arrange.mode}
          plan={arrange.plan}
          bannedDiscardId={bannedDiscardId}
          onCancel={() => setArrange(null)}
          onConfirm={(action) => {
            setArrange(null);
            send(action);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  felt: {
    position: 'absolute',
    left: 70,
    top: 24,
    width: CANVAS.width - 140,
    height: 548,
    borderRadius: 274,
    backgroundColor: COLORS.felt,
    borderWidth: 12,
    borderColor: COLORS.feltEdge,
  },
  hud: { position: 'absolute', left: 24, top: 18, gap: 6 },
  wildRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topRight: { position: 'absolute', right: 20, top: 18, alignItems: 'flex-end', gap: 8 },
  prompt: { position: 'absolute', left: 340, width: 600, top: 424 },
  actions: { position: 'absolute', left: 1070, top: 522, width: 190, gap: 8 },
});
