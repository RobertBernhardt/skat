import assert from 'assert/strict';
import { card, matadors, trickWinnerIndex, kindOf, newDeal, applyAction, evaluate, scoreGame, PRESETS, BID_VALUES, legalCards, normalizeGame, gameAllowed } from '../js/engine.js';
import { decodeRunde, encodeRunde } from '../js/settings.js';
const E = 0, G = 1, H = 2, S = 3, U = 4, O = 5, K = 6, A = 7, T = 3;
let n = 0; const ok = (name, f) => { f(); n++; };
ok('Reizwerte', () => { assert.deepEqual(BID_VALUES.slice(0, 12), [18, 20, 22, 23, 24, 27, 30, 33, 35, 36, 40, 44]); });
ok('Spitzen mit 3 Herz', () => { const m = matadors([card(E,U), card(G,U), card(H,U), card(H,A)], { type: 'suit', trump: H }); assert.equal(m.with, true); assert.equal(m.count, 3); });
ok('Spitzen ohne 2 Grand', () => { const m = matadors([card(H,U), card(S,U)], { type: 'grand' }); assert.equal(m.with, false); assert.equal(m.count, 2); });
ok('Unter sticht Ass', () => { assert.equal(trickWinnerIndex([card(H,A), card(S,U), card(H,T)], kindOf({ type: 'suit', trump: E })), 1); });
ok('Grand: Ass vor Zehn', () => { assert.equal(trickWinnerIndex([card(H,T), card(H,A), card(H,K)], 4), 1); });
ok('Null: Unter über Zehn', () => { assert.equal(trickWinnerIndex([card(H,T), card(H,U), card(H,9)], 5), 1); });
ok('Abwerfen gewinnt nicht', () => { assert.equal(trickWinnerIndex([card(H,7), card(S,A), card(G,A)], 4), 0); });
ok('Bedienen: Unter ist Trumpf, nicht Farbe', () => { assert.deepEqual(legalCards([card(H,U), card(G,7)], [card(H,A)], kindOf({ type: 'suit', trump: E })), [card(H,U), card(G,7)]); });
ok('Ouvert heißt Schwarz angesagt', () => { const g = normalizeGame({ type: 'grand', ouvert: true }, true); assert.ok(g.schneider && g.schwarz); });
ok('Null unter Reizwert verboten', () => { assert.equal(gameAllowed(normalizeGame({ type: 'null' }, false), PRESETS.offiziell, 24), false); assert.equal(gameAllowed(normalizeGame({ type: 'null', ouvert: true }, false), PRESETS.offiziell, 24), true); });

// Reizablauf
ok('Alle passen, Vorhand spielt 18', () => {
  let st = newDeal(0, PRESETS.offiziell);
  assert.equal(st.turn, 2); // Mittelhand
  st = applyAction(st, { t: 'pass' }); // M
  assert.equal(st.turn, 0); // Hinterhand = Geber
  st = applyAction(st, { t: 'pass' });
  assert.equal(st.bid.stage, 3); assert.equal(st.turn, 1);
  st = applyAction(st, { t: 'bid', v: 18 });
  assert.equal(st.declarer, 1); assert.equal(st.bidValue, 18);
});
ok('Einpassen', () => { let st = newDeal(0, PRESETS.offiziell); st = applyAction(st, { t: 'pass' }); st = applyAction(st, { t: 'pass' }); st = applyAction(st, { t: 'pass' }); assert.equal(st.phase, 'passed'); });
ok('Reizen bis 20, Hinterhand gewinnt', () => {
  let st = newDeal(0, PRESETS.offiziell);
  st = applyAction(st, { t: 'bid', v: 18 }); st = applyAction(st, { t: 'pass' }); // V passt
  assert.equal(st.turn, 0); st = applyAction(st, { t: 'bid', v: 20 }); st = applyAction(st, { t: 'pass' });
  assert.equal(st.declarer, 0); assert.equal(st.bidValue, 20);
});

// Wertung mit konstruiertem Ende
function finished({ game, start, declPts, declTricks = 5, bid, hand = false, kontra = 0, rules = PRESETS.offiziell, bock = false }) {
  const st = { game: normalizeGame(game, hand), declarer: 0, startCards: start, points: [declPts, 0, 0], trickCount: [declTricks, 0, 0], tricks: Array(10).fill({}), bidValue: bid, kontra, bock, rules, hands: [[], [], []], skat: [] };
  st.tricks = Array.from({ length: 10 }, (_, i) => ({ cards: [], winner: i < declTricks ? 0 : 1 }));
  st.trickCount = [declTricks, 10 - declTricks, 0];
  st.result = evaluate(st);
  return st;
}
const herzMit1 = [card(E,U), card(H,A)];
ok('Herz mit 1 gewonnen = 20', () => { const st = finished({ game: { type: 'suit', trump: H }, start: herzMit1, declPts: 70, bid: 18 }); assert.equal(st.result.won, true); assert.equal(st.result.value, 20); });
ok('Schneider zählt', () => { const st = finished({ game: { type: 'suit', trump: H }, start: herzMit1, declPts: 95, bid: 18 }); assert.equal(st.result.value, 30); });
ok('Schwarz zählt', () => { const st = finished({ game: { type: 'suit', trump: H }, start: herzMit1, declPts: 120, declTricks: 10, bid: 18 }); assert.equal(st.result.value, 40); });
ok('60 Augen verloren', () => { const st = finished({ game: { type: 'suit', trump: H }, start: herzMit1, declPts: 60, bid: 18 }); assert.equal(st.result.won, false); });
ok('Überreizt', () => { const st = finished({ game: { type: 'suit', trump: H }, start: herzMit1, declPts: 70, bid: 24 }); assert.equal(st.result.won, false); assert.equal(st.result.value, 30); assert.deepEqual(scoreGame({ ...st, rules: PRESETS.runde }), [-60, 0, 0]); });
ok('Seeger-Fabian verloren', () => { const st = finished({ game: { type: 'suit', trump: H }, start: herzMit1, declPts: 50, bid: 18 }); assert.deepEqual(scoreGame(st), [-90, 40, 40]); });
ok('Seeger-Fabian gewonnen', () => { const st = finished({ game: { type: 'grand' }, start: [card(E,U)], declPts: 70, bid: 18 }); assert.deepEqual(scoreGame(st), [98, 0, 0]); });
ok('Kontra und Bock', () => { const st = finished({ game: { type: 'grand' }, start: [card(E,U)], declPts: 70, bid: 18, kontra: 2, bock: true }); assert.equal(st.result.gameValue, 48 * 8); });
ok('Hand Schneider angesagt nicht erreicht', () => { const st = finished({ game: { type: 'suit', trump: H, schneider: true }, hand: true, start: herzMit1, declPts: 80, bid: 18 }); assert.equal(st.result.won, false); assert.equal(st.result.value, 40); });
ok('Null ouvert Hand', () => { const st = finished({ game: { type: 'null', ouvert: true }, hand: true, start: [], declPts: 0, declTricks: 0, bid: 18 }); assert.equal(st.result.won, true); assert.equal(st.result.value, 59); });
ok('Einfache Liste, verloren einfach', () => { const st = finished({ game: { type: 'suit', trump: H }, start: herzMit1, declPts: 50, bid: 18, rules: { ...PRESETS.runde, lostDouble: false } }); assert.deepEqual(scoreGame(st), [-20, 0, 0]); });
ok('Regel-Link hin und zurück', () => { const r = { ...PRESETS.runde, bock: true, scoring: 'sf', lostDouble: false }; assert.deepEqual(decodeRunde(encodeRunde(r)), r); });
console.log(`${n} Regeltests bestanden`);
