// Double-Dummy-Löser: rechnet eine Verteilung mit offenen Karten perfekt bis zum Ende durch.
// Die KI nutzt ihn nur auf ausgewürfelten Verteilungen, die zu ihrem eigenen Wissen passen.

import { EFF, POWER, POINTS } from './engine.js';

// between[k][a*32+b]: Karten derselben Farbe, deren Stärke echt zwischen a und b liegt.
const BETWEEN = [];
// higher[k][c]: Karten derselben Farbe, die c stechen.
const HIGHER = [];
// Karten nach Farbe und Stärke absteigend, je Spielart.
const ORDERED = [];
for (let k = 0; k < 6; k++) {
  const t = new Int32Array(1024);
  const h = new Int32Array(32);
  for (let a = 0; a < 32; a++) {
    for (let x = 0; x < 32; x++) if (EFF[k][x] === EFF[k][a] && POWER[k][x] > POWER[k][a]) h[a] |= 1 << x;
    for (let b = 0; b < 32; b++) {
      if (EFF[k][a] !== EFF[k][b]) continue;
      const lo = Math.min(POWER[k][a], POWER[k][b]);
      const hi = Math.max(POWER[k][a], POWER[k][b]);
      let m = 0;
      for (let x = 0; x < 32; x++) {
        if (EFF[k][x] === EFF[k][a] && POWER[k][x] > lo && POWER[k][x] < hi) m |= 1 << x;
      }
      t[a * 32 + b] = m;
    }
  }
  BETWEEN.push(t);
  HIGHER.push(h);
  const all = [...Array(32).keys()].sort((a, b) => {
    if (EFF[k][a] !== EFF[k][b]) return EFF[k][b] - EFF[k][a];
    return POWER[k][b] - POWER[k][a];
  });
  ORDERED.push(Int8Array.from(all));
}

export class Abort extends Error {}

export class Solver {
  // k: Spielart (0-3 Farbe, 4 Grand, 5 Null); decl: Alleinspieler.
  constructor(k, decl) {
    this.k = k;
    this.decl = decl;
    this.isNull = k === 5;
    this.eff = EFF[k];
    this.pow = POWER[k];
    this.masks = [0, 0, 0, 0, 0];
    for (let c = 0; c < 32; c++) this.masks[this.eff[c]] |= 1 << c;
    this.order = ORDERED[k];
    this.between = BETWEEN[k];
    this.higher = HIGHER[k];
    this.tt = new Map();
    this.nodes = 0;
    this.limit = Infinity;
    this.H = [0, 0, 0];
    this.tc = [0, 0, 0];
    this.tp = [0, 0, 0];
    this.bufs = [];
    for (let i = 0; i < 40; i++) this.bufs.push(new Int8Array(12));
    this.score = new Int16Array(12);
    this.depth = 0;
  }

  setHands(h) {
    this.H[0] = h[0];
    this.H[1] = h[1];
    this.H[2] = h[2];
    this.tt.clear();
  }

  maxSide(p) {
    return this.isNull ? p !== this.decl : p === this.decl;
  }

  remPoints(m) {
    let s = 0;
    while (m !== 0) {
      const low = m & -m;
      s += POINTS[(31 - Math.clz32(low)) & 7];
      m ^= low;
    }
    return s;
  }

  // Züge eines Spielers, gleichwertige Karten zusammengefasst.
  moves(p, ply, out) {
    const hand = this.H[p];
    let legal = hand;
    if (ply > 0) {
      const m = hand & this.masks[this.eff[this.tc[0]]];
      if (m !== 0) legal = m;
    }
    const R = (this.H[0] | this.H[1] | this.H[2]) & ~hand;
    let n = 0;
    let prev = -1;
    const ord = this.order;
    for (let i = 0; i < 32; i++) {
      const c = ord[i];
      if ((legal & (1 << c)) === 0) continue;
      if (prev >= 0 && this.eff[prev] === this.eff[c] && (this.isNull || POINTS[prev & 7] === POINTS[c & 7]) && (this.between[prev * 32 + c] & R) === 0) {
        prev = c;
        continue;
      }
      out[n++] = c;
      prev = c;
    }
    return n;
  }

  sortBy(buf, n) {
    const score = this.score;
    for (let i = 1; i < n; i++) {
      const c = buf[i];
      const s = score[i];
      let j = i - 1;
      while (j >= 0 && score[j] < s) {
        buf[j + 1] = buf[j];
        score[j + 1] = score[j];
        j--;
      }
      buf[j + 1] = c;
      score[j + 1] = s;
    }
  }

  // Ausspielen ordnen: sichere Stiche zuerst, Alleinspieler zieht Trümpfe, Gegner spielen Asse und dann klein.
  orderLead(buf, n, p) {
    if (n < 2) return;
    const eff = this.eff;
    const pow = this.pow;
    const R = (this.H[0] | this.H[1] | this.H[2]) & ~this.H[p];
    const score = this.score;
    const decl = p === this.decl;
    for (let i = 0; i < n; i++) {
      const c = buf[i];
      const top = (this.higher[c] & R) === 0;
      const trump = eff[c] === 4;
      let s;
      if (this.isNull) s = decl ? -pow[c] : (top ? -100 : 0) - pow[c];
      else if (decl) s = trump ? (top ? 400 : 150) + pow[c] : top ? 300 + POINTS[c & 7] : 50 - pow[c];
      else s = trump ? -pow[c] : top ? 300 + POINTS[c & 7] : 100 - pow[c] - POINTS[c & 7];
      score[i] = s;
    }
    this.sortBy(buf, n);
  }

  // Folgekarten ordnen: hat die eigene Partei den Stich, zuerst Augen zugeben, sonst billig stechen oder klein bleiben.
  orderFollow(buf, n, p, ply) {
    if (n < 2) return;
    const eff = this.eff;
    const pow = this.pow;
    let b = this.tc[0];
    let bp = this.tp[0];
    if (ply === 2) {
      const c1 = this.tc[1];
      if ((eff[c1] === 4 && eff[b] !== 4) || (eff[c1] === eff[b] && pow[c1] > pow[b])) {
        b = c1;
        bp = this.tp[1];
      }
    }
    const mine = (bp === this.decl) === (p === this.decl);
    const score = this.score;
    for (let i = 0; i < n; i++) {
      const c = buf[i];
      const beats = (eff[c] === 4 && eff[b] !== 4) || (eff[c] === eff[b] && pow[c] > pow[b]);
      const pts = POINTS[c & 7];
      let s;
      if (this.isNull) {
        if (p === this.decl) s = beats ? -100 - pow[c] : 100 + pow[c];
        else s = mine ? -pow[c] : beats ? -50 + pow[c] : 50 + pow[c];
      } else if (mine) s = beats ? -200 + pts : 100 + pts * 4 - (eff[c] === 4 ? 30 : 0);
      else s = beats ? 200 + pts * 2 - pow[c] : -pts * 4 - pow[c];
      score[i] = s;
    }
    this.sortBy(buf, n);
  }

  // Wert der restlichen Stiche für den Alleinspieler (Augen bzw. bei Null: 1, wenn er einen Stich bekommt).
  search(leader, alpha, beta) {
    const all = this.H[0] | this.H[1] | this.H[2];
    if (all === 0) return 0;
    // Schranken: mehr als die restlichen Augen gibt es nicht.
    const rem = this.isNull ? 1 : this.remPoints(all);
    if (rem <= alpha) return rem;
    if (beta <= 0) return 0;
    const key = (all >>> 0) * 4 + leader;
    const e = this.tt.get(key);
    let lo = 0;
    let hi = 255;
    if (e !== undefined) {
      lo = e >> 8;
      hi = e & 255;
      if (lo >= beta) return lo;
      if (hi <= alpha) return hi;
      if (lo === hi) return lo;
      if (lo > alpha) alpha = lo;
      if (hi < beta) beta = hi;
    }
    const a0 = alpha;
    const b0 = beta;
    const v = this.ply(0, leader, alpha, beta);
    if (v <= a0) hi = Math.min(hi, v);
    else if (v >= b0) lo = Math.max(lo, v);
    else lo = hi = v;
    this.tt.set(key, (lo << 8) | hi);
    return v;
  }

  ply(ply, p, alpha, beta) {
    if (++this.nodes > this.limit) throw new Abort();
    if (ply === 3) return this.resolve(alpha, beta);
    const buf = this.bufs[this.depth++];
    const n = this.moves(p, ply, buf);
    if (ply > 0) this.orderFollow(buf, n, p, ply);
    else this.orderLead(buf, n, p);
    const max = this.maxSide(p);
    let best = max ? -1 : 256;
    const next = (p + 1) % 3;
    for (let i = 0; i < n; i++) {
      const c = buf[i];
      this.H[p] &= ~(1 << c);
      this.tc[ply] = c;
      this.tp[ply] = p;
      const v = this.ply(ply + 1, next, alpha, beta);
      this.H[p] |= 1 << c;
      if (max) {
        if (v > best) best = v;
        if (best > alpha) alpha = best;
      } else {
        if (v < best) best = v;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }
    this.depth--;
    return best;
  }

  resolve(alpha, beta) {
    const eff = this.eff;
    const pow = this.pow;
    const c0 = this.tc[0];
    const c1 = this.tc[1];
    const c2 = this.tc[2];
    let bi = 0;
    let b = c0;
    if ((eff[c1] === 4 && eff[b] !== 4) || (eff[c1] === eff[b] && pow[c1] > pow[b])) {
      bi = 1;
      b = c1;
    }
    if ((eff[c2] === 4 && eff[b] !== 4) || (eff[c2] === eff[b] && pow[c2] > pow[b])) {
      bi = 2;
      b = c2;
    }
    const w = this.tp[bi];
    const tp0 = this.tp[0];
    const tp1 = this.tp[1];
    const tp2 = this.tp[2];
    let gain;
    if (this.isNull) {
      if (w === this.decl) return 1; // verloren, Rest egal
      gain = 0;
    } else {
      gain = w === this.decl ? POINTS[c0 & 7] + POINTS[c1 & 7] + POINTS[c2 & 7] : 0;
    }
    const v = gain + this.search(w, alpha - gain, beta - gain);
    this.tc[0] = c0;
    this.tc[1] = c1;
    this.tc[2] = c2;
    this.tp[0] = tp0;
    this.tp[1] = tp1;
    this.tp[2] = tp2;
    return v;
  }

  // Vor jeder Suche: laufenden Stich setzen und Zustand nach einem Abbruch zurücksetzen.
  prepare(trick, hands) {
    this.depth = 0;
    this.H[0] = hands[0];
    this.H[1] = hands[1];
    this.H[2] = hands[2];
    for (let i = 0; i < trick.length; i++) {
      this.tc[i] = trick[i].c;
      this.tp[i] = trick[i].p;
    }
  }

  // Wert ab einem laufenden Stich, Spieler p ist am Zug.
  fromTrick(trick, p, alpha, beta) {
    const saved = this.H.slice();
    this.prepare(trick, saved);
    try {
      if (trick.length === 0) return this.search(p, alpha, beta);
      return this.ply(trick.length, p, alpha, beta);
    } finally {
      this.prepare([], saved);
    }
  }

  // Spielt p die Karte c: erreicht der Alleinspieler dann mindestens t (Null: bekommt er einen Stich, t = 1)?
  testMove(trick, p, c, t) {
    return this.valueMove(trick, p, c, t - 1, t) >= t;
  }

  exactMove(trick, p, c) {
    return this.valueMove(trick, p, c, -1, 256);
  }

  valueMove(trick, p, c, alpha, beta) {
    const saved = this.H.slice();
    this.prepare(trick, saved);
    this.H[p] &= ~(1 << c);
    this.tc[trick.length] = c;
    this.tp[trick.length] = p;
    try {
      return this.ply(trick.length + 1, (p + 1) % 3, alpha, beta);
    } finally {
      this.prepare([], saved);
    }
  }
}

export function maskOf(cards) {
  let m = 0;
  for (const c of cards) m |= 1 << c;
  return m;
}
