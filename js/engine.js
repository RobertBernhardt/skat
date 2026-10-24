// Skat-Regelwerk: Karten, Reizen, Spielablauf, Spielwert, Wertung.
// Reine Funktionen ohne DOM, damit dieselbe Datei im Browser, im Worker und in Node-Tests läuft.

export const SUIT_NAMES = ['Eichel', 'Grün', 'Herz', 'Schellen'];
export const RANK_LABELS = ['7', '8', '9', '10', 'U', 'O', 'K', 'A'];
export const RANK_NAMES = ['Sieben', 'Acht', 'Neun', 'Zehn', 'Unter', 'Ober', 'König', 'Daus'];
export const POINTS = [0, 0, 0, 10, 2, 3, 4, 11];
export const UNTER = 4;

// Karte = Farbe * 8 + Rang. Farbe 0 Eichel, 1 Grün, 2 Herz, 3 Schellen.
export const suitOf = (c) => c >> 3;
export const rankOf = (c) => c & 7;
export const card = (s, r) => s * 8 + r;
export const pointsOf = (c) => POINTS[c & 7];
export const cardName = (c) => `${SUIT_NAMES[suitOf(c)]}-${RANK_NAMES[rankOf(c)]}`;

export const SUIT_BASE = [12, 11, 10, 9];
export const GRAND_BASE = 24;
export const NULL_VALUES = { plain: 23, hand: 35, ouvert: 46, ouvertHand: 59 };

// Spielart-Schlüssel für die Tabellen: 0-3 Farbspiel mit Trumpf s, 4 Grand, 5 Null.
export function kindOf(game) {
  if (game.type === 'suit') return game.trump;
  return game.type === 'grand' ? 4 : 5;
}

// effSuit: 0-3 Farbe, 4 Trumpf. power: höher sticht.
export const EFF = [];
export const POWER = [];
export const SUITMASK = [];
const PLAIN_ORDER = [0, 1, 2, 5, -1, 3, 4, 6]; // 7,8,9,10,U,O,K,A in Farbe: 7<8<9<O<K<10<A
for (let k = 0; k < 6; k++) {
  const eff = new Int8Array(32);
  const pow = new Int8Array(32);
  const masks = [0, 0, 0, 0, 0];
  for (let c = 0; c < 32; c++) {
    const s = suitOf(c);
    const r = rankOf(c);
    if (k === 5) {
      eff[c] = s;
      pow[c] = r; // Null: 7 8 9 10 U O K A
    } else if (r === UNTER) {
      eff[c] = 4;
      pow[c] = 40 + (3 - s);
    } else if (k < 4 && s === k) {
      eff[c] = 4;
      pow[c] = 20 + PLAIN_ORDER[r];
    } else {
      eff[c] = s;
      pow[c] = PLAIN_ORDER[r];
    }
    masks[eff[c]] |= 1 << c;
  }
  EFF.push(eff);
  POWER.push(pow);
  SUITMASK.push(masks);
}

export function trickWinnerIndex(cards, k) {
  const eff = EFF[k];
  const pow = POWER[k];
  let best = 0;
  for (let i = 1; i < cards.length; i++) {
    const c = cards[i];
    const b = cards[best];
    if (eff[c] === 4 && eff[b] !== 4) best = i;
    else if (eff[c] === eff[b] && pow[c] > pow[b]) best = i;
  }
  return best;
}

export function legalCards(hand, trickCards, k) {
  if (trickCards.length === 0) return hand.slice();
  const lead = EFF[k][trickCards[0]];
  const follow = hand.filter((c) => EFF[k][c] === lead);
  return follow.length ? follow : hand.slice();
}

// Sortierung für die Anzeige: Trümpfe links, dann Farben, jeweils hoch nach niedrig.
export function sortHand(hand, game) {
  const k = game ? kindOf(game) : 0;
  const suitOrder = game && game.type === 'suit' ? [game.trump, ...[0, 1, 2, 3].filter((s) => s !== game.trump)] : [0, 1, 2, 3];
  const key = (c) => {
    const e = EFF[k][c];
    const group = e === 4 ? -1 : suitOrder.indexOf(e);
    return group * 100 - POWER[k][c];
  };
  return hand.slice().sort((a, b) => key(a) - key(b));
}

// Trumpfreihenfolge von oben, für Spitzen.
export function trumpOrder(game) {
  const order = [card(0, UNTER), card(1, UNTER), card(2, UNTER), card(3, UNTER)];
  if (game.type === 'suit') {
    const s = game.trump;
    for (const r of [7, 3, 6, 5, 2, 1, 0]) order.push(card(s, r));
  }
  return order;
}

export function matadors(cards, game) {
  const set = new Set(cards);
  const order = trumpOrder(game);
  const withTop = set.has(order[0]);
  let n = 0;
  for (const c of order) {
    if (set.has(c) === withTop) n++;
    else break;
  }
  return { with: withTop, count: n };
}

// Alle möglichen Reizwerte.
export const BID_VALUES = (() => {
  const s = new Set();
  for (const base of [9, 10, 11, 12]) for (let m = 2; m <= 18; m++) s.add(base * m);
  for (let m = 2; m <= 11; m++) s.add(GRAND_BASE * m);
  for (const v of Object.values(NULL_VALUES)) s.add(v);
  return [...s].filter((v) => v >= 18).sort((a, b) => a - b);
})();

export function nextBid(v) {
  return BID_VALUES.find((x) => x > v);
}

export function nullValue(game) {
  if (game.ouvert) return game.hand ? NULL_VALUES.ouvertHand : NULL_VALUES.ouvert;
  return game.hand ? NULL_VALUES.hand : NULL_VALUES.plain;
}

export function baseValue(game) {
  if (game.type === 'suit') return SUIT_BASE[game.trump];
  if (game.type === 'grand') return GRAND_BASE;
  return nullValue(game);
}

// Höchster Wert, den ein Spiel mit diesen Karten ohne Schneider/Schwarz sicher erreicht.
export function guaranteedValue(cards, game) {
  if (game.type === 'null') return nullValue(game);
  let mult = matadors(cards, game).count + 1;
  if (game.hand) mult++;
  if (game.schneider) mult += 2; // angesagt zählt und muss erreicht werden
  if (game.schwarz) mult += 2;
  if (game.ouvert) mult++;
  return baseValue(game) * mult;
}

// Spiel normalisieren: Ouvert bei Farbe/Grand heißt Hand + Schneider + Schwarz angesagt.
export function normalizeGame(g, hand) {
  const game = { type: g.type, hand: !!hand, schneider: false, schwarz: false, ouvert: !!g.ouvert };
  if (g.type === 'suit') game.trump = g.trump;
  if (g.type === 'null') return game;
  if (game.ouvert) {
    game.schneider = true;
    game.schwarz = true;
  } else if (hand) {
    game.schneider = !!g.schneider || !!g.schwarz;
    game.schwarz = !!g.schwarz;
  }
  return game;
}

export function gameAllowed(game, rules, bid, declCards) {
  if (game.type === 'null') {
    if (game.ouvert && !rules.nullOuvert) return false;
    return nullValue(game) >= bid;
  }
  if (game.ouvert && (!rules.ouvertGames || !game.hand)) return false;
  if ((game.schneider || game.schwarz) && !game.hand) return false;
  return true;
}

export function gameName(game) {
  let n = game.type === 'suit' ? SUIT_NAMES[game.trump] : game.type === 'grand' ? 'Grand' : 'Null';
  if (game.ouvert) n += ' ouvert';
  if (game.hand) n += ' Hand';
  if (game.type !== 'null' && !game.ouvert) {
    if (game.schwarz) n += ', Schwarz angesagt';
    else if (game.schneider) n += ', Schneider angesagt';
  }
  return n;
}

// ---------------------------------------------------------------------------
// Spielzustand

export const PRESETS = {
  offiziell: {
    kontra: false,
    bock: false,
    bockAfter6060: true,
    bockAfterKontraRe: true,
    nullOuvert: true,
    ouvertGames: true,
    lostDouble: true,
    scoring: 'sf',
  },
};
PRESETS.runde = { ...PRESETS.offiziell, kontra: true, scoring: 'simple' };

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function newDeal(dealer, rules, rnd = Math.random, bockActive = false) {
  const deck = shuffle([...Array(32).keys()], rnd);
  const hands = [deck.slice(0, 10), deck.slice(10, 20), deck.slice(20, 30)];
  const skat = deck.slice(30, 32);
  const V = (dealer + 1) % 3;
  const M = (dealer + 2) % 3;
  return {
    v: 1,
    rules: { ...rules },
    bock: bockActive,
    dealer,
    hands,
    skat,
    origSkat: skat.slice(),
    phase: 'bid',
    bid: { stage: 1, asker: M, answerer: V, value: 0, waiting: 'asker', history: [], lastBid: [0, 0, 0], passed: [false, false, false] },
    declarer: -1,
    bidValue: 0,
    handGame: false,
    game: null,
    discard: [],
    kontra: 0,
    kontraBy: -1,
    kontraAsked: [],
    trick: [],
    leader: V,
    tricks: [],
    points: [0, 0, 0],
    trickCount: [0, 0, 0],
    turn: M,
    result: null,
  };
}

export function forehand(st) {
  return (st.dealer + 1) % 3;
}

// Gibt zurück, wer gerade dran ist (oder -1).
export function currentActor(st) {
  return st.phase === 'done' || st.phase === 'passed' ? -1 : st.turn;
}

// Erlaubte Aktionen für den Spieler am Zug (für Oberfläche und KI).
export function legalActions(st) {
  const p = st.turn;
  switch (st.phase) {
    case 'bid': {
      const b = st.bid;
      if (b.stage === 3) return [{ t: 'bid', v: 18 }, { t: 'pass' }];
      if (b.waiting === 'asker') return [{ t: 'bid', v: nextBid(b.value) }, { t: 'pass' }];
      return [{ t: 'hold' }, { t: 'pass' }];
    }
    case 'skat':
      return [{ t: 'take' }, { t: 'hand' }];
    case 'kontra':
      return p === st.declarer ? [{ t: 're' }, { t: 'nore' }] : [{ t: 'kontra' }, { t: 'nokontra' }];
    case 'play':
      return legalCards(st.hands[p], st.trick.map((x) => x.c), kindOf(st.game)).map((c) => ({ t: 'play', c }));
    default:
      return [];
  }
}

function clone(st) {
  return JSON.parse(JSON.stringify(st));
}

function endBidding(st, winner, value) {
  if (value === 0) {
    st.phase = 'passed';
    st.turn = -1;
    return;
  }
  st.declarer = winner;
  st.bidValue = value;
  st.phase = 'skat';
  st.turn = winner;
}

export function applyAction(st0, a) {
  const st = clone(st0);
  const p = st.turn;
  switch (st.phase) {
    case 'bid': {
      const b = st.bid;
      b.history.push({ p, t: a.t, v: a.v || 0 });
      if (b.stage === 3) {
        if (a.t === 'bid') {
          b.lastBid[p] = 18;
          endBidding(st, p, 18);
        } else endBidding(st, p, 0);
        return st;
      }
      if (b.waiting === 'asker') {
        if (a.t === 'bid') {
          if (a.v !== nextBid(b.value)) throw new Error('Ungültiger Reizwert');
          b.value = a.v;
          b.lastBid[p] = a.v;
          b.waiting = 'answerer';
          st.turn = b.answerer;
        } else {
          b.passed[p] = true;
          stageWon(st, b.answerer);
        }
      } else if (a.t === 'hold') {
        b.lastBid[p] = b.value;
        b.waiting = 'asker';
        st.turn = b.asker;
      } else {
        b.passed[p] = true;
        stageWon(st, b.asker);
      }
      return st;
    }
    case 'skat': {
      if (a.t === 'take') {
        st.hands[p] = st.hands[p].concat(st.skat);
        st.skat = [];
        st.phase = 'discard';
      } else {
        st.handGame = true;
        st.phase = 'declare';
      }
      return st;
    }
    case 'discard': {
      const [x, y] = a.cards;
      if (x === y || !st.hands[p].includes(x) || !st.hands[p].includes(y)) throw new Error('Ungültiges Drücken');
      st.hands[p] = st.hands[p].filter((c) => c !== x && c !== y);
      st.skat = [x, y];
      st.discard = [x, y];
      st.phase = 'declare';
      return st;
    }
    case 'declare': {
      const game = normalizeGame(a.game, st.handGame);
      if (!gameAllowed(game, st.rules, st.bidValue)) throw new Error('Spiel nicht erlaubt');
      st.game = game;
      st.startCards = st.hands[p].concat(st.skat);
      st.points[p] = st.skat.reduce((s, c) => s + pointsOf(c), 0);
      if (st.rules.kontra) {
        st.phase = 'kontra';
        st.turn = (p + 1) % 3;
      } else startPlay(st);
      return st;
    }
    case 'kontra': {
      if (a.t === 'kontra') {
        st.kontra = 1;
        st.kontraBy = p;
        st.turn = st.declarer;
      } else if (a.t === 're') {
        st.kontra = 2;
        startPlay(st);
      } else if (a.t === 'nore') {
        startPlay(st);
      } else {
        st.kontraAsked.push(p);
        const other = 3 - st.declarer - p;
        if (st.kontraAsked.includes(other)) startPlay(st);
        else st.turn = other;
      }
      return st;
    }
    case 'play': {
      const k = kindOf(st.game);
      const legal = legalCards(st.hands[p], st.trick.map((x) => x.c), k);
      if (!legal.includes(a.c)) throw new Error('Karte nicht erlaubt');
      st.hands[p] = st.hands[p].filter((c) => c !== a.c);
      st.trick.push({ p, c: a.c });
      if (st.trick.length < 3) {
        st.turn = (p + 1) % 3;
        return st;
      }
      const cards = st.trick.map((x) => x.c);
      const w = st.trick[trickWinnerIndex(cards, k)].p;
      st.tricks.push({ cards: st.trick, winner: w, leader: st.trick[0].p });
      st.points[w] += cards.reduce((s, c) => s + pointsOf(c), 0);
      st.trickCount[w]++;
      st.trick = [];
      st.turn = w;
      const nullLost = st.game.type === 'null' && w === st.declarer;
      if (nullLost || st.tricks.length === 10) finish(st);
      return st;
    }
  }
  throw new Error('Keine Aktion möglich');
}

function stageWon(st, winner) {
  const b = st.bid;
  if (b.stage === 1) {
    b.stage = 2;
    b.asker = st.dealer; // Hinterhand
    b.answerer = winner;
    b.waiting = 'asker';
    st.turn = b.asker;
    return;
  }
  // Stufe 2 vorbei
  if (b.value === 0) {
    // Niemand hat gereizt: Vorhand darf 18 spielen, wenn sie nicht schon gepasst hat.
    const V = forehand(st);
    if (!b.passed[V]) {
      b.stage = 3;
      st.turn = V;
      return;
    }
    endBidding(st, winner, 0);
    return;
  }
  endBidding(st, winner, b.value);
}

function startPlay(st) {
  st.phase = 'play';
  st.turn = forehand(st);
  st.leader = st.turn;
}

// Ergebnis berechnen.
export function evaluate(st) {
  const game = st.game;
  const d = st.declarer;
  const declCards = st.tricks
    .flatMap((t) => t.cards.map((x) => x))
    .filter((x) => x.p === d)
    .map((x) => x.c)
    .concat(st.hands[d], st.skat);
  // Karten, mit denen der Alleinspieler gestartet ist (Hand + Skat), für Spitzen.
  const startCards = st.startCards || declCards;
  const declPts = st.points[d];
  const declTricks = st.trickCount[d];
  const oppTricks = st.tricks.length - declTricks;
  const bid = st.bidValue;
  let won;
  let value;
  let mult = 0;
  let detail = [];
  let mat = null;
  if (game.type === 'null') {
    won = declTricks === 0;
    value = nullValue(game);
    detail.push(`${gameName(game)}: fester Wert ${value}`);
  } else {
    mat = matadors(startCards, game);
    mult = mat.count + 1;
    detail.push(`${mat.with ? 'mit' : 'ohne'} ${mat.count}, Spiel ${mat.count + 1}`);
    if (game.hand) {
      mult++;
      detail.push(`Hand ${mult}`);
    }
    const schneider = declPts >= 90 || declPts <= 30;
    const schwarz = st.tricks.length === 10 && (declTricks === 10 || oppTricks === 10);
    if (schneider) {
      mult++;
      detail.push(`Schneider ${mult}`);
    }
    if (game.schneider) {
      mult++;
      detail.push(`angesagt ${mult}`);
    }
    if (schwarz) {
      mult++;
      detail.push(`Schwarz ${mult}`);
    }
    if (game.schwarz) {
      mult++;
      detail.push(`angesagt ${mult}`);
    }
    if (game.ouvert) {
      mult++;
      detail.push(`ouvert ${mult}`);
    }
    value = baseValue(game) * mult;
    won = declPts >= 61;
    if (game.schneider && declPts < 90) won = false;
    if (game.schwarz && declTricks < 10) won = false;
    detail.push(`mal ${baseValue(game)} = ${value}`);
  }
  let overbid = false;
  if (value < bid) {
    overbid = true;
    won = false;
    const base = baseValue(game);
    value = game.type === 'null' ? bid : base * Math.ceil(bid / base);
    detail.push(`überreizt (gereizt ${bid}), gewertet ${value}`);
  }
  let factor = 1;
  if (st.kontra === 1) {
    factor *= 2;
    detail.push('Kontra ×2');
  } else if (st.kontra === 2) {
    factor *= 4;
    detail.push('Kontra und Re ×4');
  }
  if (st.bock) {
    factor *= 2;
    detail.push('Bock ×2');
  }
  const gameValue = value * factor;
  return { won, value, gameValue, declPts, declTricks, overbid, detail, matadors: mat, mult };
}

function finish(st) {
  st.phase = 'done';
  st.turn = -1;
  st.result = evaluate(st);
}

// Listenpunkte für ein Spiel. Gibt Array mit drei Einträgen zurück.
export function scoreGame(st) {
  const r = st.result;
  const d = st.declarer;
  const out = [0, 0, 0];
  if (st.rules.scoring === 'sf') {
    if (r.won) out[d] = r.gameValue + 50;
    else {
      out[d] = -2 * r.gameValue - 50;
      for (let p = 0; p < 3; p++) if (p !== d) out[p] = 40;
    }
  } else {
    out[d] = r.won ? r.gameValue : -(st.rules.lostDouble ? 2 : 1) * r.gameValue;
  }
  return out;
}

// Löst das Spiel eine Bockrunde aus?
export function triggersBock(st) {
  if (!st.rules.bock || st.phase !== 'done') return false;
  if (st.rules.bockAfter6060 && st.game.type !== 'null' && st.result.declPts === 60) return true;
  if (st.rules.bockAfterKontraRe && st.kontra === 2) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Sicht eines Spielers: nur das, was er wissen darf.

export function viewFor(st, p) {
  const v = {
    me: p,
    dealer: st.dealer,
    phase: st.phase,
    turn: st.turn,
    rules: st.rules,
    hand: st.hands[p].slice(),
    handSizes: st.hands.map((h) => h.length),
    bid: JSON.parse(JSON.stringify(st.bid)),
    declarer: st.declarer,
    bidValue: st.bidValue,
    handGame: st.handGame,
    game: st.game,
    kontra: st.kontra,
    trick: st.trick.slice(),
    tricks: st.tricks,
    points: st.points.slice(),
    trickCount: st.trickCount.slice(),
    myDiscard: p === st.declarer && !st.handGame ? st.discard.slice() : [],
    ouvert: null,
  };
  // Der Alleinspieler kennt seine eigenen Skatpunkte; die Gegner nicht.
  if (p !== st.declarer && st.declarer >= 0) v.points[st.declarer] = st.points[st.declarer] - (st.phase === 'play' || st.phase === 'done' ? st.skat.reduce((s, c) => s + pointsOf(c), 0) : 0);
  if (st.game && st.game.ouvert && p !== st.declarer && st.phase === 'play') v.ouvert = st.hands[st.declarer].slice();
  return v;
}

// Entscheidung der KI (oder der Oberfläche) anwenden; 'declareAll' = drücken und ansagen.
export function applyDecision(st, d) {
  if (d.t === 'declareAll') {
    let s = st;
    if (s.phase === 'discard') s = applyAction(s, { t: 'discard', cards: d.discard });
    return applyAction(s, { t: 'declare', game: d.game });
  }
  return applyAction(st, d);
}
