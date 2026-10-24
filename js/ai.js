// Computergegner. Bekommt ausschließlich die Spielersicht (viewFor) und entscheidet daraus.
// Kern: viele zum eigenen Wissen passende Verteilungen auswürfeln, jede perfekt durchrechnen,
// die Karte mit dem besten Durchschnitt spielen (Perfect Information Monte Carlo).

import {
  EFF, POWER, POINTS, kindOf, legalCards, pointsOf, suitOf, rankOf, UNTER, card,
  nextBid, normalizeGame, gameAllowed, guaranteedValue, nullValue, matadors, baseValue,
} from './engine.js';
import { Solver, maskOf, Abort } from './dd.js';

// Knotenlimits je Suche, damit kein Zug auf dem Handy hängt. Zu schwere Verteilungen werden übersprungen.
const DD_LIMIT = 150000;
const PLAY_LIMIT = 400000;

export const LEVELS = {
  gemuetlich: { pimc: false, bidWorlds: 4, playWorlds: 0, budget: 0, mistakes: 0.22, bidNoise: 0.15, inference: false, kontra: false },
  ordentlich: { pimc: false, bidWorlds: 8, playWorlds: 0, budget: 0, mistakes: 0, bidNoise: 0.05, inference: false, kontra: true },
  stark: { pimc: true, bidWorlds: 12, playWorlds: 14, budget: 900, mistakes: 0, bidNoise: 0, inference: false, kontra: true },
  meister: { pimc: true, bidWorlds: 20, playWorlds: 48, budget: 1800, mistakes: 0, bidNoise: 0, inference: true, kontra: true },
};

// Schwellen für die geschätzte Gewinnchance beim Reizen.
export const RISK = { vorsichtig: 0.68, normal: 0.55, mutig: 0.42 };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function others(me) {
  return [(me + 1) % 3, (me + 2) % 3];
}

// ---------------------------------------------------------------------------
// Verteilungen auswürfeln

// slots: {q: Anzahl} für Spieler und 'skat'; voids[q][eff] = true heißt: q hat diese Farbe nicht.
function dealWorld(unknown, slots, voids, k) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const cap = { ...slots };
    const out = { 0: [], 1: [], 2: [], skat: [] };
    const cards = shuffle(unknown.slice());
    const opts = (c) =>
      Object.keys(cap).filter((s) => cap[s] > 0 && (s === 'skat' || attempt > 50 || !voids[s] || k === null || !voids[s][EFF[k][c]]));
    cards.sort((a, b) => opts(a).length - opts(b).length);
    let ok = true;
    for (const c of cards) {
      const o = opts(c);
      if (o.length === 0) {
        ok = false;
        break;
      }
      let total = 0;
      for (const s of o) total += cap[s];
      let r = Math.random() * total;
      let pick = o[o.length - 1];
      for (const s of o) {
        r -= cap[s];
        if (r < 0) {
          pick = s;
          break;
        }
      }
      out[pick].push(c);
      cap[pick]--;
    }
    if (ok) return out;
  }
  return null;
}

function voidsFrom(view, k) {
  const v = { 0: {}, 1: {}, 2: {} };
  const scan = (cards) => {
    if (!cards.length) return;
    const lead = EFF[k][cards[0].c];
    for (let i = 1; i < cards.length; i++) if (EFF[k][cards[i].c] !== lead) v[cards[i].p][lead] = true;
  };
  for (const t of view.tricks) scan(t.cards);
  scan(view.trick);
  return v;
}

function playedCards(view) {
  const out = [];
  for (const t of view.tricks) for (const x of t.cards) out.push(x.c);
  for (const x of view.trick) out.push(x.c);
  return out;
}

// Plausibilität einer Verteilung gemessen am Reizen und an der Ansage (nur Meister).
function plausibility(view, world, declStart) {
  let w = 1;
  const g = view.game;
  if (g && view.declarer !== view.me && declStart) {
    if (g.type === 'suit') {
      const t = declStart.filter((c) => EFF[g.trump][c] === 4).length;
      w *= [0.01, 0.01, 0.02, 0.05, 0.15, 0.5, 0.9, 1, 1, 1, 1, 1, 1][t];
    } else if (g.type === 'grand') {
      const u = declStart.filter((c) => rankOf(c) === UNTER).length;
      const a = declStart.filter((c) => rankOf(c) === 7).length;
      w *= [0.08, 0.35, 0.9, 1, 1][u] * (a >= 2 ? 1 : a === 1 ? 0.6 : 0.3);
    } else {
      const high = declStart.filter((c) => rankOf(c) >= 5).length;
      w *= high <= 2 ? 1 : high <= 4 ? 0.5 : 0.15;
    }
  }
  // Wer hoch gereizt hat und nicht Alleinspieler ist, hatte ein brauchbares Blatt.
  for (const q of others(view.me)) {
    if (q === view.declarer) continue;
    const hand = world[q].concat(view.tricks.flatMap((t) => t.cards.filter((x) => x.p === q).map((x) => x.c)), view.trick.filter((x) => x.p === q).map((x) => x.c));
    const best = Math.max(...[0, 1, 2, 3].map((s) => hand.filter((c) => EFF[s][c] === 4).length));
    const u = hand.filter((c) => rankOf(c) === UNTER).length;
    const bid = view.bid.lastBid[q];
    if (bid >= 18 && best < 4 && u === 0) w *= 0.3;
    if (bid === 0 && view.bid.passed[q] && best >= 6 && u >= 2) w *= 0.3;
  }
  return w;
}

// ---------------------------------------------------------------------------
// Kartenspiel

export function choosePlay(view, levelName) {
  const L = LEVELS[levelName] || LEVELS.stark;
  const k = kindOf(view.game);
  const legal = legalCards(view.hand, view.trick.map((x) => x.c), k);
  if (legal.length === 1) return legal[0];
  if (!L.pimc) {
    if (L.mistakes && Math.random() < L.mistakes) return legal[Math.floor(Math.random() * legal.length)];
    return heuristicPlay(view, legal, k);
  }
  return pimcPlay(view, legal, k, L);
}

function pimcPlay(view, legal, k, L) {
  const me = view.me;
  const d = view.declarer;
  const played = playedCards(view);
  const known = new Set([...view.hand, ...played, ...view.myDiscard, ...(view.ouvert || [])]);
  const unknown = [];
  for (let c = 0; c < 32; c++) if (!known.has(c)) unknown.push(c);
  const slots = {};
  for (const q of others(me)) slots[q] = q === d && view.ouvert ? 0 : view.handSizes[q];
  const skatKnown = me === d && !view.handGame;
  if (!skatKnown) slots.skat = 2;
  const voids = voidsFrom(view, k);

  // Gleichwertige eigene Karten zusammenfassen
  const remaining = new Set(unknown.concat(view.hand, view.ouvert || []));
  const cands = reduceEquivalent(legal, remaining, k);
  if (cands.length === 1) return cands[0];

  const score = new Map(cands.map((c) => [c, 0]));
  let totalW = 0;
  const t0 = now();
  const myTeamDecl = me === d;
  const isNull = k === 5;
  const tricksLeft = 10 - view.tricks.length;
  let worlds = 0;
  for (let i = 0; i < L.playWorlds * 3 && worlds < L.playWorlds; i++) {
    if (worlds >= 4 && now() - t0 > L.budget) break;
    const w = dealWorld(unknown, slots, voids, k);
    if (!w) continue;
    const hands = [[], [], []];
    hands[me] = view.hand;
    for (const q of others(me)) hands[q] = q === d && view.ouvert ? view.ouvert : w[q];
    const skat = skatKnown ? view.myDiscard : w.skat;
    let weight = 1;
    if (L.inference) {
      const declStart = d === me ? null : hands[d].concat(played.filter((c, idx) => ownerOf(view, c) === d), skat);
      weight = plausibility(view, { ...w, [me]: view.hand }, declStart);
    }
    if (weight < 0.005) continue;
    // Bisherige Augen des Alleinspielers in dieser Welt
    let declPts = skat.reduce((s, c) => s + pointsOf(c), 0);
    for (const t of view.tricks) if (t.winner === d) declPts += t.cards.reduce((s, x) => s + pointsOf(x.c), 0);
    const solver = new Solver(k, d);
    solver.limit = PLAY_LIMIT;
    solver.setHands(hands.map(maskOf));
    const ws = new Map();
    try {
    for (const c of cands) {
      let s;
      if (isNull) {
        if (view.trickCount[d] > 0) s = 0;
        else {
          const declTakes = solver.testMove(view.trick, me, c, 1);
          s = declTakes === myTeamDecl ? 0 : 1;
        }
      } else if (tricksLeft <= 4) {
        const v = solver.exactMove(view.trick, me, c) + declPts;
        const declWins = v >= 61;
        s = (declWins === myTeamDecl ? 1 : 0) + 0.25 * (myTeamDecl ? (v >= 90 ? 1 : 0) - (v <= 30 ? 1 : 0) : (v <= 30 ? 1 : 0) - (v >= 90 ? 1 : 0)) + 0.002 * (myTeamDecl ? v : 120 - v);
      } else {
        const declWins = solver.testMove(view.trick, me, c, 61 - declPts);
        s = declWins === myTeamDecl ? 1 : 0;
        if (tricksLeft <= 7) {
          if (declWins) {
            if (solver.testMove(view.trick, me, c, 90 - declPts)) s += myTeamDecl ? 0.25 : -0.25;
          } else if (!solver.testMove(view.trick, me, c, 31 - declPts)) {
            s += myTeamDecl ? -0.25 : 0.25;
          }
        }
      }
      ws.set(c, s);
    }
    } catch (e) {
      if (e instanceof Abort) continue;
      throw e;
    }
    worlds++;
    totalW += weight;
    for (const [c, s] of ws) score.set(c, score.get(c) + weight * s);
  }
  if (totalW === 0) return heuristicPlay(view, legal, k);
  let best = -Infinity;
  for (const v of score.values()) if (v > best) best = v;
  const top = cands.filter((c) => score.get(c) >= best - 1e-9 * Math.max(1, totalW));
  if (top.length === 1) return top[0];
  return heuristicPlay(view, top, k);
}

function ownerOf(view, c) {
  for (const t of view.tricks) for (const x of t.cards) if (x.c === c) return x.p;
  for (const x of view.trick) if (x.c === c) return x.p;
  return -1;
}

function reduceEquivalent(legal, remaining, k) {
  const sorted = legal.slice().sort((a, b) => (EFF[k][a] - EFF[k][b]) || POWER[k][b] - POWER[k][a]);
  const out = [];
  let prev = -1;
  for (const c of sorted) {
    if (prev >= 0 && EFF[k][prev] === EFF[k][c] && (k === 5 || POINTS[prev & 7] === POINTS[c & 7])) {
      let gap = false;
      for (const x of remaining) {
        if (x === prev || x === c || legal.includes(x)) continue;
        if (EFF[k][x] === EFF[k][c] && POWER[k][x] < POWER[k][prev] && POWER[k][x] > POWER[k][c]) {
          gap = true;
          break;
        }
      }
      if (!gap) {
        prev = c;
        continue;
      }
    }
    out.push(c);
    prev = c;
  }
  return out;
}

// Faustregeln: werden von den unteren Stufen gespielt und entscheiden Gleichstände.
export function heuristicPlay(view, legal, k) {
  const me = view.me;
  const d = view.declarer;
  const eff = EFF[k];
  const pow = POWER[k];
  const isNull = k === 5;
  const trick = view.trick;
  const played = new Set(playedCards(view));
  const lowest = (cs) => cs.slice().sort((a, b) => pow[a] - pow[b] || pointsOf(a) - pointsOf(b))[0];
  const highest = (cs) => cs.slice().sort((a, b) => pow[b] - pow[a])[0];
  const cheapest = (cs) => cs.slice().sort((a, b) => pointsOf(a) - pointsOf(b) || pow[a] - pow[b])[0];
  const richest = (cs) => cs.slice().sort((a, b) => pointsOf(b) - pointsOf(a) || pow[a] - pow[b])[0];
  // Ist c die höchste noch im Spiel befindliche Karte seiner Farbe?
  const isTop = (c) => {
    for (let x = 0; x < 32; x++) {
      if (x === c || played.has(x) || view.hand.includes(x)) continue;
      if (eff[x] === eff[c] && pow[x] > pow[c]) return false;
    }
    return true;
  };

  if (isNull) {
    if (me === d) {
      if (!trick.length) return lowest(legal);
      const best = currentWinner(trick, k);
      const under = legal.filter((c) => !(beats(c, best.c, k)));
      return under.length ? highest(under) : highest(legal);
    }
    if (!trick.length) return lowest(legal);
    const best = currentWinner(trick, k);
    if (best.p === d) {
      const under = legal.filter((c) => !beats(c, best.c, k));
      return under.length ? highest(under) : lowest(legal);
    }
    return lowest(legal);
  }

  const trumps = (cs) => cs.filter((c) => eff[c] === 4);
  const side = (cs) => cs.filter((c) => eff[c] !== 4);
  const trumpsOut = (() => {
    let n = 0;
    for (let x = 0; x < 32; x++) if (eff[x] === 4 && !played.has(x) && !view.hand.includes(x)) n++;
    return n;
  })();

  if (!trick.length) {
    if (me === d) {
      const t = trumps(legal);
      if (t.length && trumpsOut > 0) {
        const top = t.filter(isTop);
        if (top.length) return highest(top);
        if (t.length >= 3) return lowest(t);
      }
      const aces = side(legal).filter(isTop);
      if (aces.length) return richest(aces);
      const s = side(legal);
      if (s.length) return lowest(s);
      return lowest(legal);
    }
    const aces = side(legal).filter((c) => isTop(c) && pointsOf(c) >= 10);
    if (aces.length) return aces[0];
    const s = side(legal);
    if (s.length) {
      // Kurzer Weg, lange Farbe; langer Weg, kurze Farbe
      const declNext = (me + 1) % 3 === d;
      const bySuit = {};
      for (const c of s) (bySuit[eff[c]] = bySuit[eff[c]] || []).push(c);
      const suits = Object.values(bySuit).sort((a, b) => (declNext ? b.length - a.length : a.length - b.length));
      return cheapest(suits[0]);
    }
    return lowest(legal);
  }

  const best = currentWinner(trick, k);
  const partnerWins = me !== d && best.p !== d;
  const last = trick.length === 2;
  const winners = legal.filter((c) => beats(c, best.c, k));
  if (partnerWins) {
    const safe = last || isTop(best.c) || (trick.length === 1 && (best.p + 1) % 3 === me && false);
    if (safe) return richest(legal.filter((c) => eff[c] !== 4 || legal.every((x) => eff[x] === 4)));
    return cheapest(legal);
  }
  if (winners.length) {
    const trickPts = trick.reduce((s, x) => s + pointsOf(x.c), 0);
    if (last) return trickPts > 0 || me === d ? lowest(winners) : cheapest(legal);
    const sure = winners.filter(isTop);
    if (sure.length) return me === d || trickPts >= 3 ? richest(sure) : cheapest(legal);
    if (me === d && trickPts >= 10) return lowest(winners.filter((c) => eff[c] === 4).concat()) || cheapest(legal);
  }
  return cheapest(legal);
}

function beats(c, b, k) {
  return (EFF[k][c] === 4 && EFF[k][b] !== 4) || (EFF[k][c] === EFF[k][b] && POWER[k][c] > POWER[k][b]);
}

function currentWinner(trick, k) {
  let best = trick[0];
  for (let i = 1; i < trick.length; i++) if (beats(trick[i].c, best.c, k)) best = trick[i];
  return best;
}

// ---------------------------------------------------------------------------
// Skat drücken

function nullSafety(hand) {
  // Je Farbe: unsicher, wenn die i-te niedrigste Karte (0-basiert) zu hoch ist.
  let unsafe = 0;
  for (let s = 0; s < 4; s++) {
    const r = hand.filter((c) => suitOf(c) === s).map(rankOf).sort((a, b) => a - b);
    for (let i = 0; i < r.length; i++) {
      if (r[i] > 2 * i) {
        unsafe++;
        break;
      }
    }
  }
  return unsafe;
}

function discardScore(hand12, pair, game) {
  const rest = hand12.filter((c) => c !== pair[0] && c !== pair[1]);
  if (game.type === 'null') return -nullSafety(rest) * 10 - rest.filter((c) => rankOf(c) >= 5).length * 0.5;
  const k = kindOf(game);
  let s = 0;
  for (const c of pair) {
    if (EFF[k][c] === 4) s -= 6;
    if (rankOf(c) === 7) s -= 4; // Asse behalten
    s += pointsOf(c) * 0.12;
  }
  for (let su = 0; su < 4; su++) {
    if (game.type === 'suit' && su === game.trump) continue;
    const cs = rest.filter((c) => EFF[k][c] === su);
    const hasA = cs.some((c) => rankOf(c) === 7);
    const has10 = cs.some((c) => rankOf(c) === 3);
    if (cs.length === 0) s += game.type === 'grand' ? 0.6 : 1.6;
    if (has10 && !hasA) s -= cs.length >= 3 ? 1.2 : 2.2;
    if (cs.length === 1 && !hasA) s -= 0.8;
    if (cs.some((c) => rankOf(c) === 6) && !hasA && !has10 && cs.length <= 2) s -= 0.6;
  }
  return s;
}

export function bestDiscards(hand12, game, n = 1) {
  const pairs = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) pairs.push([hand12[i], hand12[j]]);
  return pairs
    .map((p) => ({ p, s: discardScore(hand12, p, game) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.p);
}

// ---------------------------------------------------------------------------
// Spiele bewerten

function candidateGames(cards, rules) {
  const u = cards.filter((c) => rankOf(c) === UNTER).length;
  const games = [];
  const bySuit = [0, 1, 2, 3].map((s) => ({ s, n: cards.filter((c) => EFF[s][c] === 4).length }));
  bySuit.sort((a, b) => b.n - a.n);
  games.push({ type: 'suit', trump: bySuit[0].s });
  if (bySuit[1].n >= bySuit[0].n - 1) games.push({ type: 'suit', trump: bySuit[1].s });
  const aces = cards.filter((c) => rankOf(c) === 7).length;
  if (u >= 2 || (u >= 1 && aces >= 3)) games.push({ type: 'grand' });
  const high = cards.filter((c) => rankOf(c) >= 5 || rankOf(c) === UNTER).length;
  if (nullSafety(cards) <= 2 && high <= 5) {
    games.push({ type: 'null' });
    if (rules.nullOuvert) games.push({ type: 'null', ouvert: true });
  }
  return games;
}

// Ein Spiel in einer Welt durchrechnen: gewinnt der Alleinspieler bei offenen Karten?
// Bei offenen Karten verteidigen die Gegner perfekt zusammen; im echten Spiel (und gegen die eigene Kartenspiel-KI)
// holt der Alleinspieler im Schnitt mehr. Beim Bewerten eines Blatts reicht ihm deshalb in der Durchrechnung etwas weniger.
export const DD_MARGIN = { value: 12 };

// Gibt true/false zurück, oder null, wenn die Verteilung zu aufwendig ist.
function ddWins(hands, decl, leader, game, startPts, margin = DD_MARGIN.value) {
  const k = kindOf(game);
  const s = new Solver(k, decl);
  s.limit = DD_LIMIT;
  s.setHands(hands.map(maskOf));
  try {
    if (k === 5) return s.fromTrick([], leader, 0, 1) < 1;
    const need = 61 - margin - startPts;
    return s.fromTrick([], leader, need - 1, need) >= need;
  } catch (e) {
    if (e instanceof Abort) return null;
    throw e;
  }
}

// Bewertung beim Reizen: für jede Welt der höchste Spielwert, der gewonnen würde (nach Skataufnahme bzw. Hand).
const bidCache = new Map();

export function evaluateBidding(view, levelName) {
  const L = LEVELS[levelName] || LEVELS.stark;
  const key = `${levelName}|${view.dealer}|${view.me}|${view.hand.slice().sort((a, b) => a - b).join(',')}`;
  if (bidCache.has(key)) return bidCache.get(key);
  const me = view.me;
  const leader = (view.dealer + 1) % 3;
  const unknown = [];
  for (let c = 0; c < 32; c++) if (!view.hand.includes(c)) unknown.push(c);
  const take = [];
  const hand = [];
  const games = candidateGames(view.hand, view.rules);
  for (let w = 0; w < L.bidWorlds; w++) {
    const world = dealWorld(unknown, { [(me + 1) % 3]: 10, [(me + 2) % 3]: 10, skat: 2 }, {}, null);
    let bestTake = 0;
    let bestHand = 0;
    const hand12 = view.hand.concat(world.skat);
    for (const g0 of candidateGames(hand12, view.rules)) {
      const game = normalizeGame(g0, false);
      const [disc] = bestDiscards(hand12, game, 1);
      const rest = hand12.filter((c) => !disc.includes(c));
      const hands = [[], [], []];
      hands[me] = rest;
      for (const q of others(me)) hands[q] = world[q];
      const pts = disc.reduce((s, c) => s + pointsOf(c), 0);
      const v = guaranteedValue(hand12, game);
      if (v > bestTake && ddWins(hands, me, leader, game, pts) === true) bestTake = v;
    }
    for (const g0 of games) {
      if (g0.type === 'null' && g0.ouvert) continue;
      const game = normalizeGame(g0, true);
      const hands = [[], [], []];
      hands[me] = view.hand;
      for (const q of others(me)) hands[q] = world[q];
      const pts = world.skat.reduce((s, c) => s + pointsOf(c), 0);
      const v = guaranteedValue(view.hand.concat(world.skat), game);
      // Handspiel braucht etwas mehr Sicherheit, weil der Skat unbekannt bleibt: gleiche Welt, aber ohne Nutzen aus dem Skat.
      if (v > bestHand && ddWins(hands, me, leader, game, pts) === true) bestHand = v;
    }
    take.push(bestTake);
    hand.push(bestHand);
  }
  const res = { take, hand };
  bidCache.set(key, res);
  if (bidCache.size > 50) bidCache.delete(bidCache.keys().next().value);
  return res;
}

function limitAt(values, theta) {
  const sorted = values.slice().sort((a, b) => b - a);
  const idx = Math.ceil(theta * sorted.length) - 1;
  return idx < 0 ? 0 : sorted[Math.min(idx, sorted.length - 1)];
}

export function bidLimit(view, levelName, riskName) {
  const L = LEVELS[levelName] || LEVELS.stark;
  const ev = evaluateBidding(view, levelName);
  let theta = RISK[riskName] || RISK.normal;
  if (L.bidNoise) theta = Math.min(0.95, Math.max(0.25, theta + (Math.random() * 2 - 1) * L.bidNoise));
  return Math.max(limitAt(ev.take, theta), limitAt(ev.hand, theta + 0.08));
}

export function chooseBid(view, levelName, riskName) {
  const b = view.bid;
  const limit = bidLimit(view, levelName, riskName);
  if (b.stage === 3) return limit >= 18 ? { t: 'bid', v: 18 } : { t: 'pass' };
  if (b.waiting === 'asker') {
    const nb = nextBid(b.value);
    return nb <= limit ? { t: 'bid', v: nb } : { t: 'pass' };
  }
  return b.value <= limit ? { t: 'hold' } : { t: 'pass' };
}

export function chooseHandOrTake(view, levelName, riskName) {
  const ev = evaluateBidding(view, levelName);
  const theta = (RISK[riskName] || RISK.normal) + 0.08;
  const pHand = ev.hand.filter((v) => v >= view.bidValue).length / ev.hand.length;
  const pTake = ev.take.filter((v) => v >= view.bidValue).length / ev.take.length;
  return pHand >= theta && pHand >= pTake - 0.05 ? { t: 'hand' } : { t: 'take' };
}

// Spiel ansagen (und vorher drücken). Gibt {discard, game} zurück.
export function chooseGame(view, levelName) {
  const L = LEVELS[levelName] || LEVELS.stark;
  const me = view.me;
  const leader = (view.dealer + 1) % 3;
  const handGame = view.handGame;
  const cards = view.hand; // 12 Karten nach Aufnahme, 10 bei Hand
  const unknown = [];
  for (let c = 0; c < 32; c++) if (!cards.includes(c)) unknown.push(c);
  const W = Math.max(6, L.bidWorlds);
  const worlds = [];
  for (let i = 0; i < W; i++) worlds.push(dealWorld(unknown, { [(me + 1) % 3]: 10, [(me + 2) % 3]: 10, ...(handGame ? { skat: 2 } : {}) }, {}, null));
  const options = [];
  for (const g0 of candidateGames(cards, view.rules)) {
    const game = normalizeGame(g0, handGame);
    if (!gameAllowed(game, view.rules, view.bidValue)) continue;
    const discs = handGame ? [[]] : bestDiscards(cards, game, L.pimc ? 2 : 1);
    for (const disc of discs) {
      const rest = cards.filter((c) => !disc.includes(c));
      let wins = 0;
      let counted = 0;
      for (const w of worlds) {
        const hands = [[], [], []];
        hands[me] = rest;
        for (const q of others(me)) hands[q] = w[q];
        const skat = handGame ? w.skat : disc;
        const pts = skat.reduce((s, c) => s + pointsOf(c), 0);
        const r = ddWins(hands, me, leader, game, pts);
        if (r === null) continue;
        counted++;
        if (r) wins++;
      }
      const p = counted ? wins / counted : 0;
      const all = handGame ? cards : cards; // Spitzen: Hand + Skat; bei Hand ist der Skat unbekannt, wir rechnen mit der eigenen Hand
      let v = guaranteedValue(all, game);
      const pEff = v >= view.bidValue ? p : 0;
      if (v < view.bidValue) v = game.type === 'null' ? view.bidValue : baseValue(game) * Math.ceil(view.bidValue / baseValue(game));
      const ev = pEff * v - (1 - pEff) * 2 * v;
      options.push({ game, disc, p: pEff, v, ev });
    }
  }
  if (!options.length) {
    // Notlösung: irgendein erlaubtes Farbspiel
    const game = normalizeGame({ type: 'suit', trump: 0 }, handGame);
    return { game, discard: handGame ? [] : bestDiscards(cards, game, 1)[0] };
  }
  // Null ouvert nur, wenn es nötig ist oder sicher
  options.sort((a, b) => b.ev - a.ev);
  const best = options[0];
  return { game: best.game, discard: best.disc };
}

// Kontra / Re
export function chooseKontra(view, levelName) {
  const L = LEVELS[levelName] || LEVELS.stark;
  if (!L.kontra) return view.me === view.declarer ? { t: 'nore' } : { t: 'nokontra' };
  const p = declarerWinChance(view, Math.max(8, Math.floor(L.bidWorlds / 2)));
  if (view.me === view.declarer) return p > 0.97 ? { t: 're' } : { t: 'nore' };
  // Kontra nur mit eigenem Trumpfrückhalt; ein Computer soll nicht leichtsinnig doppeln.
  const k = kindOf(view.game);
  const myTrumps = view.hand.filter((c) => EFF[k][c] === 4).length;
  const myUnter = view.hand.filter((c) => rankOf(c) === UNTER).length;
  const myAces = view.hand.filter((c) => rankOf(c) === 7 && EFF[k][c] !== 4).length;
  const backed = view.game.type === 'null' ? false : view.game.type === 'grand' ? myUnter >= 2 && myAces >= 2 : myTrumps >= 4 && myUnter >= 1;
  return backed && p < 0.04 ? { t: 'kontra' } : { t: 'nokontra' };
}

function declarerWinChance(view, W) {
  const me = view.me;
  const d = view.declarer;
  const k = kindOf(view.game);
  const known = new Set([...view.hand, ...view.myDiscard]);
  const unknown = [];
  for (let c = 0; c < 32; c++) if (!known.has(c)) unknown.push(c);
  const slots = {};
  for (const q of others(me)) slots[q] = 10;
  if (!(me === d && !view.handGame)) slots.skat = 2;
  let wins = 0;
  let total = 0;
  for (let i = 0; i < W * 12 && total < W; i++) {
    const w = dealWorld(unknown, slots, {}, k);
    const hands = [[], [], []];
    hands[me] = view.hand;
    for (const q of others(me)) hands[q] = w[q];
    const skat = me === d && !view.handGame ? view.myDiscard : w.skat;
    // Gegner: nur Verteilungen zählen, in denen der Alleinspieler sein Spiel plausibel ansagen konnte.
    if (me !== d) {
      const weight = plausibility(view, { ...w, [me]: view.hand }, hands[d].concat(skat));
      if (Math.random() > weight) continue;
    }
    const pts = skat.reduce((s, c) => s + pointsOf(c), 0);
    const r = ddWins(hands, d, (view.dealer + 1) % 3, view.game, pts);
    if (r === null) continue;
    total++;

    if (r) wins++;
  }
  return total ? wins / total : 0.5;
}

// Einstieg für den Worker: entscheidet für die gegebene Sicht.
export function decide(view, levelName, riskName) {
  switch (view.phase) {
    case 'bid':
      return chooseBid(view, levelName, riskName);
    case 'skat':
      return chooseHandOrTake(view, levelName, riskName);
    case 'discard':
    case 'declare': {
      const g = chooseGame(view, levelName);
      return { t: 'declareAll', discard: g.discard, game: g.game };
    }
    case 'kontra':
      return chooseKontra(view, levelName);
    case 'play':
      return { t: 'play', c: choosePlay(view, levelName) };
  }
  return null;
}
