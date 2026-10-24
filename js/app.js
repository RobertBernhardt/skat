// Oberfläche und Spielablauf. Die KI läuft im Worker und sieht nur viewFor(...).

import {
  newDeal, applyAction, viewFor, legalCards, kindOf, sortHand, gameName, normalizeGame, gameAllowed,
  guaranteedValue, nullValue, scoreGame, triggersBock, nextBid, SUIT_NAMES, cardName, applyDecision,
} from './engine.js';
import { defsSVG, cardSVG, backSVG, suitIcon } from './cards-svg.js';
import { CHARACTERS, mouseSVG, pickLine } from './characters.js';
import { DEFAULTS, activeRules, RULE_ITEMS, SCORING_INFO, OTHER_INFO, encodeRunde, decodeRunde, describeRunde } from './settings.js';
import * as sound from './sound.js';

const STORE = 'skat-v1';
const NAMES = ['Du', CHARACTERS[0].name, CHARACTERS[1].name];
const TEMPO = {
  langsam: { ai: 1100, trick: 2100 },
  normal: { ai: 650, trick: 1300 },
  schnell: { ai: 300, trick: 700 },
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------------------------------------------------------------------
// Zustand

let S = load();
const ui = {
  sel: null, // angehobene Karte (zwei Tipps)
  disc: [], // gewählte Karten zum Drücken
  newCards: [],
  game: null, // Auswahl im Ansage-Feld
  opts: { ouvert: false, schneider: false, schwarz: false },
  shownTrick: null, // gerade fertiger Stich, der noch liegen bleibt
  busy: false,
  pending: 0,
  bubbles: {},
  bidChips: {},
  spoken: [false, false, false],
  thinking: -1,
};

function freshState() {
  return { settings: { ...DEFAULTS, runde: { ...DEFAULTS.runde } }, list: [], dealer: 2, bock: 0, st: null };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.settings) {
        s.settings = { ...DEFAULTS, ...s.settings, runde: { ...DEFAULTS.runde, ...(s.settings.runde || {}) } };
        return s;
      }
    }
  } catch {
    /* Speicher nicht verfügbar */
  }
  return freshState();
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(S));
  } catch {
    /* privates Fenster o. ä. */
  }
}

const tempo = () => TEMPO[S.settings.tempo] || TEMPO.normal;
const st = () => S.st;

// ---------------------------------------------------------------------------
// KI im Worker

let worker = null;
let fallbackDecide = null;
const waiting = new Map();
try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { id, decision, error } = e.data;
    const cb = waiting.get(id);
    waiting.delete(id);
    if (error) console.error(error);
    if (cb) cb(decision);
  };
  worker.onerror = (e) => {
    console.error('Worker-Fehler', e.message);
    worker = null;
  };
} catch {
  worker = null;
}

let reqId = 0;
async function askAI(view) {
  const level = S.settings.level;
  const risk = S.settings.risk;
  if (worker) {
    const id = ++reqId;
    return new Promise((resolve) => {
      waiting.set(id, resolve);
      worker.postMessage({ id, view, level, risk });
    });
  }
  if (!fallbackDecide) fallbackDecide = (await import('./ai.js')).decide;
  return fallbackDecide(view, level, risk);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Spielablauf

function startDeal() {
  const rules = activeRules(S.settings);
  S.dealer = (S.dealer + 1) % 3;
  S.st = newDeal(S.dealer, rules, Math.random, S.bock > 0);
  ui.sel = null;
  ui.disc = [];
  ui.newCards = [];
  ui.game = null;
  ui.opts = { ouvert: false, schneider: false, schwarz: false };
  ui.shownTrick = null;
  ui.bubbles = {};
  ui.bidChips = {};
  ui.spoken = [false, false, false];
  save();
  sound.play('deal');
  render();
  loop();
}

function apply(action) {
  const before = S.st;
  S.st = applyDecision(before, action);
  afterAction(before, S.st, action);
  save();
}

function afterAction(before, after, a) {
  const p = before.turn;
  if (before.phase === 'bid') {
    let txt = a.t === 'bid' ? String(a.v) : a.t === 'hold' ? 'Ja' : 'Passe';
    ui.bidChips[p] = txt;
    sound.play(a.t === 'pass' ? 'pass' : 'bid');
    if (p !== 0 && a.t === 'bid' && a.v >= 30 && Math.random() < 0.5) say(p, pickLine('bidHigh', { v: a.v }));
    if (after.phase !== 'bid') ui.bidChips = {};
  }
  if (before.phase === 'skat' && p !== 0) bubble(p, a.t === 'take' ? 'Ich nehme den Skat.' : 'Ich spiele Hand.');
  if (after.game && !before.game && p !== 0) {
    const g = after.game;
    let line = `${gameName(g)}!`;
    const extra = g.type === 'grand' ? pickLine('grand') : g.type === 'null' ? pickLine('nullGame') : g.hand ? pickLine('hand') : null;
    if (extra && !ui.spoken[p] && S.settings.talk && Math.random() < 0.7) {
      line += ` ${extra}`;
      ui.spoken[p] = true;
    }
    bubble(p, line, true);
  }
  if (a.t === 'kontra' || a.t === 're') {
    sound.play('kontra');
    if (p !== 0) bubble(p, `${a.t === 'kontra' ? 'Kontra!' : 'Re!'} ${S.settings.talk ? pickLine(a.t) : ''}`, true);
  }
  if (a.t === 'play') {
    sound.play('card');
    if (after.trick.length === 0 && after.tricks.length > before.tricks.length) ui.shownTrick = after.tricks[after.tricks.length - 1];
  }
  if (after.phase === 'done') finishGame(after);
  if (after.phase === 'passed') {
    const p2 = 1 + Math.floor(Math.random() * 2);
    say(p2, pickLine('einpassen'));
  }
}

function finishGame(g) {
  const pts = scoreGame(g);
  const entry = {
    n: S.list.length + 1,
    declarer: g.declarer,
    name: gameName(g.game),
    won: g.result.won,
    value: g.result.gameValue,
    pts,
    bock: g.bock,
    kontra: g.kontra,
  };
  S.list.push(entry);
  if (g.bock && S.bock > 0) S.bock--;
  if (triggersBock(g)) S.bock += 3;
  const humanDecl = g.declarer === 0;
  const humanSideWon = humanDecl ? g.result.won : !g.result.won;
  sound.play(humanSideWon ? 'win' : 'lose');
  // Ein Spruch von einer der Mäuse
  let speaker;
  let kind;
  if (humanDecl) {
    speaker = 1 + Math.floor(Math.random() * 2);
    kind = g.result.won ? 'humanWins' : 'humanLoses';
  } else if (g.result.won) {
    speaker = g.declarer;
    kind = g.result.declPts >= 90 ? 'declWinsBig' : 'declWins';
  } else {
    speaker = Math.random() < 0.5 ? g.declarer : 3 - g.declarer;
    kind = speaker === g.declarer ? 'declLoses' : 'defenseWins';
  }
  say(speaker, pickLine(kind));
}

function say(p, text) {
  if (!text || p === 0 || !S.settings.talk) return;
  bubble(p, text);
}

function bubble(p, text, strong = false) {
  ui.bubbles[p] = { text, strong, t: Date.now() };
  const id = ui.bubbles[p].t;
  setTimeout(() => {
    if (ui.bubbles[p] && ui.bubbles[p].t === id) {
      delete ui.bubbles[p];
      renderSeats();
    }
  }, strong ? 2600 : 3000);
  renderSeats();
}

// Hauptschleife: lässt die Computer ziehen, bis der Mensch dran ist.
async function loop() {
  if (ui.busy) return;
  ui.busy = true;
  try {
    for (;;) {
      const g = st();
      if (!g) break;
      if (ui.shownTrick) {
        render();
        await wait(tempo().trick);
        ui.shownTrick = null;
        sound.play('collect');
        render();
        await wait(150);
        continue;
      }
      if (g.phase === 'done' || g.phase === 'passed') break;
      const p = g.turn;
      if (p === 0) break;
      ui.thinking = p;
      render();
      const t0 = Date.now();
      const view = viewFor(g, p);
      const decision = await askAI(view);
      const rest = tempo().ai - (Date.now() - t0);
      if (rest > 0) await wait(rest);
      ui.thinking = -1;
      if (st() !== g) break; // inzwischen neu gegeben
      let action = decision;
      if (!action) {
        console.error('KI ohne Entscheidung', view.phase);
        action = fallbackAction(g);
      }
      try {
        apply(action);
      } catch (err) {
        console.error('Ungültige KI-Aktion', err, action);
        apply(fallbackAction(g));
      }
      render();
    }
  } finally {
    ui.busy = false;
    ui.thinking = -1;
    render();
  }
}

// Notfall: irgendein gültiger Zug.
function fallbackAction(g) {
  const p = g.turn;
  if (g.phase === 'bid') return { t: 'pass' };
  if (g.phase === 'skat') return { t: 'take' };
  if (g.phase === 'discard') return { t: 'declareAll', discard: g.hands[p].slice(0, 2), game: { type: 'grand' } };
  if (g.phase === 'declare') return { t: 'declare', game: { type: 'grand' } };
  if (g.phase === 'kontra') return p === g.declarer ? { t: 'nore' } : { t: 'nokontra' };
  return { t: 'play', c: legalCards(g.hands[p], g.trick.map((x) => x.c), kindOf(g.game))[0] };
}

function humanAction(a) {
  sound.unlock();
  const g = st();
  if (!g || g.turn !== 0 || ui.busy || ui.shownTrick) return;
  try {
    apply(a);
  } catch (err) {
    console.error(err);
    return;
  }
  ui.sel = null;
  render();
  loop();
}

// ---------------------------------------------------------------------------
// Darstellung

function layout() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const bar = Math.min(62, Math.max(42, H * 0.11));
  const g = st();
  const n = g ? Math.max(10, g.hands[0].length) : 10;
  let ch = Math.min(H * 0.34, 230);
  // Breite: alle Karten müssen nebeneinander passen, mit mindestens 45 % sichtbarer Breite
  const maxByWidth = (W - 20) / (2 / 3 + 0.45 * (2 / 3) * (n - 1));
  ch = Math.max(70, Math.min(ch, maxByWidth));
  const tch = Math.min((H - bar - ch) * 0.52, ch * 0.88);
  document.documentElement.style.setProperty('--ch', `${Math.round(ch)}px`);
  document.documentElement.style.setProperty('--tch', `${Math.round(tch)}px`);
}

function render() {
  layout();
  const g = st();
  const app = $('#app');
  const ouv = g && g.game && g.game.ouvert && g.declarer !== 0 && g.phase === 'play' && g.hands[g.declarer].length > 0;
  app.classList.toggle('ouvert', !!ouv);
  app.classList.toggle('nohand', !!g && g.hands[0].length === 0);
  $('#ouvert').innerHTML = ouv ? `<span class="lbl">${esc(NAMES[g.declarer])} spielt offen:</span><div class="cards">${sortHand(g.hands[g.declarer], g.game).map((c) => cardSVG(c)).join('')}</div>` : '';
  renderStatus();
  renderSeats();
  renderTrick();
  renderPanel();
  renderHand();
}

function roleText(g, p) {
  if (!g) return '';
  if (g.declarer === p && g.game) return `Alleinspieler · ${gameName(g.game)}`;
  if (g.declarer === p) return 'Alleinspieler';
  if (g.phase === 'bid') {
    const V = (g.dealer + 1) % 3;
    const M = (g.dealer + 2) % 3;
    return p === V ? 'Vorhand' : p === M ? 'Mittelhand' : 'Hinterhand';
  }
  if (g.kontraBy === p) return 'Kontra';
  return g.declarer >= 0 ? 'Gegenspieler' : '';
}

function renderStatus() {
  const g = st();
  const el = $('#status');
  if (!g) {
    el.textContent = 'Skat';
    return;
  }
  let t;
  if (g.phase === 'bid') t = `Reizen · ${NAMES[g.dealer]} ${g.dealer === 0 ? 'hast' : 'hat'} gegeben`;
  else if (g.phase === 'passed') t = 'Alle haben gepasst';
  else if (!g.game) t = `${NAMES[g.declarer]} ${g.declarer === 0 ? 'spielst' : 'spielt'} · gereizt bis ${g.bidValue}`;
  else {
    t = `${gameName(g.game)} · ${g.declarer === 0 ? 'Du spielst' : `${NAMES[g.declarer]} spielt`} · gereizt ${g.bidValue}`;
    if (g.kontra === 1) t += ' · Kontra';
    if (g.kontra === 2) t += ' · Re';
  }
  el.innerHTML = esc(t) + (g.bock ? ' · <span class="bock">Bock</span>' : '');
  $('#btn-last').disabled = !(g.tricks && g.tricks.length) || g.phase === 'done';
  $('#btn-sound').textContent = S.settings.sound ? 'Ton an' : 'Ton aus';
}

function renderSeats() {
  const g = st();
  for (const p of [1, 2]) {
    const el = $(`#seat-${p}`);
    const ch = CHARACTERS[p - 1];
    const b = ui.bubbles[p];
    const chip = ui.bidChips[p];
    const cards = '';
    const bubbleHtml = b ? `<div class="bubble ${b.strong ? 'say' : ''}">${esc(b.text)}</div>` : chip ? `<div class="bubble say">${esc(chip)}</div>` : '';
    el.className = `seat ${p === 1 ? 'left' : 'right'}${g && g.turn === p && g.phase !== 'done' ? ' turn' : ''}`;
    el.innerHTML = `<div class="avatar">${mouseSVG(ch)}${bubbleHtml}</div>
      <div class="name">${esc(ch.name)}</div>
      <div class="role">${esc(roleText(g, p))}</div>
      <div class="thinking">${ui.thinking === p ? 'überlegt …' : ''}</div>
      ${cards}`;
  }
  const me = $('#me-label');
  const role = roleText(g, 0);
  const myChip = ui.bidChips[0];
  me.className = g && g.turn === 0 && !ui.shownTrick && g.phase !== 'done' ? 'turn' : '';
  me.innerHTML = `Du${role ? `<span class="role">${esc(role)}</span>` : ''}${myChip ? `<span class="role">${esc(myChip)}</span>` : ''}`;
}

function renderTrick() {
  const g = st();
  const el = $('#trick');
  if (!g || g.phase !== 'play' && !ui.shownTrick) {
    el.innerHTML = '';
    return;
  }
  const cards = ui.shownTrick ? ui.shownTrick.cards : g.trick;
  const prev = el.dataset.key || '';
  const key = cards.map((x) => `${x.p}:${x.c}`).join(',');
  el.dataset.key = key;
  el.innerHTML = cards
    .map((x) => {
      const isNew = !prev.split(',').includes(`${x.p}:${x.c}`);
      return `<div class="tc p${x.p}${isNew ? ' in' : ''}">${cardSVG(x.c)}</div>`;
    })
    .join('');
}

function renderHand() {
  const g = st();
  const el = $('#hand');
  if (!g) {
    el.innerHTML = '';
    return;
  }
  const hand = sortHand(g.hands[0], g.game);
  const n = hand.length;
  const W = window.innerWidth;
  const ch = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ch'));
  const cw = (ch * 2) / 3;
  const avail = W - 24;
  const step = n > 1 ? Math.min(cw * 0.96, (avail - cw) / (n - 1)) : 0;
  const total = cw + step * (n - 1);
  const x0 = (W - total) / 2;
  let legal = null;
  const myPlay = g.phase === 'play' && g.turn === 0 && !ui.shownTrick;
  if (myPlay && S.settings.dim) legal = new Set(legalCards(g.hands[0], g.trick.map((x) => x.c), kindOf(g.game)));
  el.innerHTML = hand
    .map((c, i) => {
      const cls = ['hc'];
      if (ui.sel === c) cls.push('sel');
      if (ui.disc.includes(c)) cls.push('mark');
      if (legal && !legal.has(c)) cls.push('dim');
      if (ui.newCards.includes(c)) cls.push('new');
      return `<div class="${cls.join(' ')}" data-c="${c}" style="left:${Math.round(x0 + i * step)}px;z-index:${i + 1}">${cardSVG(c)}</div>`;
    })
    .join('');
}

function onCardTap(c) {
  sound.unlock();
  const g = st();
  if (!g || g.turn !== 0 || ui.busy || ui.shownTrick) return;
  if (g.phase === 'discard') {
    if (ui.disc.includes(c)) ui.disc = ui.disc.filter((x) => x !== c);
    else if (ui.disc.length < 2) ui.disc = [...ui.disc, c];
    else ui.disc = [ui.disc[1], c];
    sound.play('select');
    ui.newCards = [];
    renderHand();
    renderPanel();
    return;
  }
  if (g.phase !== 'play') return;
  const legal = legalCards(g.hands[0], g.trick.map((x) => x.c), kindOf(g.game));
  if (!legal.includes(c)) {
    flashHint('Diese Karte darfst du nicht legen: Farbe bzw. Trumpf muss bedient werden.');
    return;
  }
  if (S.settings.taps === 2 && ui.sel !== c) {
    ui.sel = c;
    sound.play('select');
    renderHand();
    return;
  }
  humanAction({ t: 'play', c });
}

let hintTimer = null;
function flashHint(text) {
  const el = $('#panel');
  el.innerHTML = `<div class="box"><p>${esc(text)}</p></div>`;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => renderPanel(), 2200);
}

// ---------------------------------------------------------------------------
// Mittelfeld

function renderPanel() {
  const g = st();
  const el = $('#panel');
  if (!g) {
    el.innerHTML = `<div class="box"><h2>Skat</h2><p>Deutsches Blatt, faire Gegner, keine Werbung.</p><div class="row"><button class="btn primary" data-act="deal">Los geht's</button></div></div>`;
    return;
  }
  if (ui.shownTrick) {
    el.innerHTML = '';
    return;
  }
  const mine = g.turn === 0 && !ui.busy;
  switch (g.phase) {
    case 'bid':
      el.innerHTML = bidPanel(g, mine);
      break;
    case 'skat':
      el.innerHTML = mine
        ? `<div class="box"><h2>Du spielst – gereizt bis ${g.bidValue}</h2><p>Möchtest du den Skat aufnehmen?</p>
          <div class="row"><button class="btn primary" data-act="take">Skat aufnehmen</button><button class="btn" data-act="hand">Hand spielen</button></div></div>`
        : waitBox(g);
      break;
    case 'discard':
      el.innerHTML = mine
        ? `<div class="box"><h2>Zwei Karten drücken</h2><p>Tippe zwei Karten an, die in den Skat sollen.</p>
          <div class="row"><button class="btn primary" data-act="discard" ${ui.disc.length === 2 ? '' : 'disabled'}>Drücken</button></div></div>`
        : waitBox(g);
      break;
    case 'declare':
      el.innerHTML = mine ? declarePanel(g) : waitBox(g);
      break;
    case 'kontra':
      if (!mine) el.innerHTML = waitBox(g);
      else if (g.declarer === 0)
        el.innerHTML = `<div class="box"><h2>${esc(NAMES[g.kontraBy])} sagt Kontra!</h2><p>Das Spiel zählt jetzt doppelt. Mit Re zählt es vierfach.</p>
          <div class="row"><button class="btn primary" data-act="re">Re!</button><button class="btn" data-act="nore">Weiter</button></div></div>`;
      else
        el.innerHTML = `<div class="box"><h2>${esc(NAMES[g.declarer])} spielt ${esc(gameName(g.game))}</h2><p>Glaubst du, das Spiel geht verloren? Dann sag Kontra – es zählt doppelt.</p>
          <div class="row"><button class="btn" data-act="kontra">Kontra!</button><button class="btn primary" data-act="nokontra">Weiter</button></div></div>`;
      break;
    case 'play':
      el.innerHTML = '';
      break;
    case 'done':
      el.innerHTML = resultPanel(g);
      break;
    case 'passed':
      el.innerHTML = `<div class="box"><h2>Alle haben gepasst</h2><p>Die Karten werden neu gegeben.</p><div class="mini-cards">${g.origSkat.map((c) => cardSVG(c)).join('')}</div><p class="small">Das lag im Skat.</p>
        <div class="row"><button class="btn primary" data-act="next">Neu geben</button></div></div>`;
      break;
  }
}

function waitBox(g) {
  const p = g.turn;
  if (p < 0) return '';
  return '';
}

function bidPanel(g, mine) {
  const b = g.bid;
  const line = (p) => {
    const chip = ui.bidChips[p];
    return `<span>${esc(NAMES[p])}: <b>${chip ? esc(chip) : b.passed[p] ? 'Passe' : '–'}</b></span>`;
  };
  const head = `<div class="bids">${[0, 1, 2].map(line).join('')}</div>`;
  if (!mine) return `<div class="box">${head}<p class="small">Gereizt wird …</p></div>`;
  let q;
  let btns;
  if (b.stage === 3) {
    q = 'Niemand hat gereizt. Möchtest du 18 spielen?';
    btns = `<button class="btn primary" data-act="bid" data-v="18">18 spielen</button><button class="btn" data-act="pass">Passe (neu geben)</button>`;
  } else if (b.waiting === 'asker') {
    const nb = nextBid(b.value);
    q = b.value ? `${esc(NAMES[b.answerer])} hält ${b.value}. Gehst du höher?` : `Du reizt ${esc(NAMES[b.answerer])}. Was sagst du?`;
    btns = `<button class="btn primary" data-act="bid" data-v="${nb}">${nb} sagen</button><button class="btn" data-act="pass">Passe</button>`;
  } else {
    q = `${esc(NAMES[b.asker])} sagt ${b.value}. Hältst du mit?`;
    btns = `<button class="btn primary" data-act="hold">Ja, ${b.value}</button><button class="btn" data-act="pass">Passe</button>`;
  }
  return `<div class="box">${head}<p>${q}</p><div class="row">${btns}</div></div>`;
}

const GAME_CHOICES = [
  { id: 's3', g: { type: 'suit', trump: 3 }, label: 'Schellen' },
  { id: 's2', g: { type: 'suit', trump: 2 }, label: 'Herz' },
  { id: 's1', g: { type: 'suit', trump: 1 }, label: 'Grün' },
  { id: 's0', g: { type: 'suit', trump: 0 }, label: 'Eichel' },
  { id: 'grand', g: { type: 'grand' }, label: 'Grand' },
  { id: 'null', g: { type: 'null' }, label: 'Null' },
];

function chosenGame(g) {
  const choice = GAME_CHOICES.find((x) => x.id === ui.game);
  if (!choice) return null;
  return normalizeGame({ ...choice.g, ouvert: ui.opts.ouvert, schneider: ui.opts.schneider, schwarz: ui.opts.schwarz }, g.handGame);
}

function declarePanel(g) {
  const known = g.handGame ? g.hands[0] : g.hands[0].concat(g.skat);
  const rules = g.rules;
  const buttons = GAME_CHOICES.map((x) => {
    const game = normalizeGame({ ...x.g, ouvert: x.id === 'null' ? ui.opts.ouvert && rules.nullOuvert : false }, g.handGame);
    const v = game.type === 'null' ? nullValue(game) : guaranteedValue(known, game);
    const allowed = gameAllowed(game, rules, g.bidValue);
    const icon = x.g.type === 'suit' ? suitIcon(x.g.trump) : '';
    return `<button class="game ${ui.game === x.id ? 'on' : ''}" data-act="pick" data-id="${x.id}" ${allowed ? '' : 'disabled'}>${icon || '<span class="noicon"></span>'}<span>${x.label}</span><small>${game.type === 'null' ? v : `${g.handGame ? 'ca. ' : ''}${v}`}</small></button>`;
  }).join('');
  const game = chosenGame(g);
  const isNull = ui.game === 'null';
  const canOuvert = isNull ? rules.nullOuvert : g.handGame && rules.ouvertGames;
  const opts = [];
  opts.push(`<button class="opt ${ui.opts.ouvert ? 'on' : ''}" data-act="opt" data-o="ouvert" ${ui.game && canOuvert ? '' : 'disabled'}>Ouvert</button>`);
  if (g.handGame && !isNull) {
    opts.push(`<button class="opt ${ui.opts.schneider || ui.opts.ouvert || ui.opts.schwarz ? 'on' : ''}" data-act="opt" data-o="schneider" ${ui.game && !ui.opts.ouvert ? '' : 'disabled'}>Schneider ansagen</button>`);
    opts.push(`<button class="opt ${ui.opts.schwarz || ui.opts.ouvert ? 'on' : ''}" data-act="opt" data-o="schwarz" ${ui.game && !ui.opts.ouvert ? '' : 'disabled'}>Schwarz ansagen</button>`);
  }
  let note = `<p class="small">Gereizt bis ${g.bidValue}.${g.handGame ? ' Handspiel: der Skat zählt bei den Spitzen mit.' : ''}</p>`;
  let ok = false;
  if (game) {
    ok = gameAllowed(game, rules, g.bidValue);
    const v = game.type === 'null' ? nullValue(game) : guaranteedValue(known, game);
    if (game.type !== 'null' && v < g.bidValue) note = `<p class="warn">Achtung: ${esc(gameName(game))} bringt sicher nur ${v}. Das reicht nur mit Schneider o. ä., sonst ist das Spiel überreizt.</p>`;
    else note = `<p class="small">${esc(gameName(game))} – Wert ${g.handGame && game.type !== 'null' ? 'ca. ' : ''}${v}, gereizt ${g.bidValue}.</p>`;
  }
  return `<div class="box wide compact"><h2>Was spielst du?</h2><div class="games">${buttons}</div>
    <div class="row"><div class="opts">${opts.join('')}</div><button class="btn primary" data-act="declare" ${game && ok ? '' : 'disabled'}>${game ? `${esc(gameName(game))} ansagen` : 'Spiel wählen'}</button></div>${note}</div>`;
}

function resultPanel(g) {
  const r = g.result;
  const d = g.declarer;
  const humanDecl = d === 0;
  let title;
  if (humanDecl) title = r.won ? 'Gewonnen!' : 'Verloren.';
  else title = r.won ? `${NAMES[d]} gewinnt` : `${NAMES[d]} verliert – gut gemacht!`;
  const pts = scoreGame(g);
  const listLine = [0, 1, 2]
    .filter((p) => pts[p])
    .map((p) => `${NAMES[p]} ${pts[p] > 0 ? '+' : ''}${pts[p]}`)
    .join(' · ');
  const augen = g.game.type === 'null' ? (r.won ? 'Kein Stich – geschafft.' : 'Der Alleinspieler hat einen Stich bekommen.') : `${r.declPts} zu ${120 - r.declPts} Augen`;
  const skat = g.handGame ? g.skat : g.discard;
  return `<div class="box wide"><h2>${esc(title)}</h2>
    <div class="result"><div class="txt">
    <p>${esc(gameName(g.game))}: ${esc(augen)}</p>
    <p class="small">${esc(r.detail.join(' · '))}</p>
    <p><b>Liste: ${esc(listLine || '±0')}</b></p></div>
    <div class="mini-cards"><div>${skat.map((c) => cardSVG(c)).join('')}</div>
    <p class="small">${g.handGame ? 'Skat' : `Gedrückt`}</p></div></div>
    <div class="row"><button class="btn quiet" data-act="list">Liste ansehen</button><button class="btn primary" data-act="next">Nächstes Spiel</button></div></div>`;
}

function onPanel(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  sound.unlock();
  const act = btn.dataset.act;
  const g = st();
  switch (act) {
    case 'deal':
    case 'next':
      startDeal();
      return;
    case 'list':
      showList();
      return;
    case 'bid':
      humanAction({ t: 'bid', v: Number(btn.dataset.v) });
      return;
    case 'hold':
    case 'pass':
    case 'hand':
    case 'kontra':
    case 'nokontra':
    case 're':
    case 'nore':
      humanAction({ t: act });
      return;
    case 'take':
      ui.newCards = g.skat.slice();
      humanAction({ t: 'take' });
      return;
    case 'discard':
      if (ui.disc.length === 2) {
        const cards = ui.disc;
        ui.disc = [];
        humanAction({ t: 'discard', cards });
      }
      return;
    case 'pick':
      ui.game = btn.dataset.id;
      if (ui.game !== 'null' && !g.handGame) ui.opts = { ouvert: false, schneider: false, schwarz: false };
      if (ui.game === 'null') ui.opts.schneider = ui.opts.schwarz = false;
      if (ui.game !== 'null' && !g.rules.ouvertGames) ui.opts.ouvert = false;
      renderPanel();
      return;
    case 'opt': {
      const o = btn.dataset.o;
      ui.opts[o] = !ui.opts[o];
      if (o === 'schwarz' && ui.opts.schwarz) ui.opts.schneider = true;
      if (o === 'schneider' && !ui.opts.schneider) ui.opts.schwarz = false;
      renderPanel();
      return;
    }
    case 'declare': {
      const game = chosenGame(g);
      if (!game) return;
      humanAction({ t: 'declare', game });
      ui.game = null;
      ui.opts = { ouvert: false, schneider: false, schwarz: false };
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Dialoge

function openModal(html, onClick) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.hidden = false;
  m.onclick = (e) => {
    if (e.target === m) closeModal();
    const btn = e.target.closest('[data-m]');
    if (!btn) return;
    if (btn.dataset.m === 'close') closeModal();
    else if (onClick) onClick(btn.dataset.m, btn, e);
  };
}

function closeModal() {
  const m = $('#modal');
  m.hidden = true;
  m.innerHTML = '';
  m.onclick = null;
}

function infoModal(title, text, back) {
  openModal(`<h2>${esc(title)}</h2><p>${esc(text).replace(/\n\n/g, '</p><p>')}</p><div class="close-row"><button class="btn primary" data-m="ok">Verstanden</button></div>`, () => (back ? back() : closeModal()));
}

function showMenu() {
  openModal(
    `<h2>Menü</h2><div class="menu-list">
      <button class="btn primary" data-m="resume">Weiterspielen</button>
      <button class="btn" data-m="list">Liste</button>
      <button class="btn" data-m="settings">Einstellungen</button>
      <button class="btn" data-m="share">Runde teilen</button>
      <button class="btn" data-m="redeal">Neu geben</button>
      <button class="btn" data-m="help">So geht's</button>
    </div>`,
    (m) => {
      if (m === 'resume') closeModal();
      if (m === 'list') showList();
      if (m === 'settings') showSettings();
      if (m === 'share') shareRunde();
      if (m === 'help') showHelp();
      if (m === 'redeal') {
        openModal(`<h2>Neu geben?</h2><p>Das laufende Spiel wird abgebrochen und zählt nicht.</p><div class="close-row"><button class="btn quiet" data-m="close">Abbrechen</button><button class="btn primary" data-m="yes">Neu geben</button></div>`, (x) => {
          if (x === 'yes') {
            closeModal();
            S.dealer = (S.dealer + 2) % 3; // gleicher Geber noch einmal
            startDeal();
          }
        });
      }
    },
  );
}

function showList() {
  const rows = S.list
    .slice()
    .reverse()
    .map(
      (e) =>
        `<tr><td>${e.n}</td><td>${esc(NAMES[e.declarer])}: ${esc(e.name)} ${e.won ? 'gewonnen' : 'verloren'}${e.bock ? ' <span class="bock">Bock</span>' : ''}${e.kontra ? ` <span class="bock">${e.kontra === 2 ? 'Re' : 'Kontra'}</span>` : ''}</td>${e.pts.map((v) => `<td class="${v < 0 ? 'neg' : ''}">${v || ''}</td>`).join('')}</tr>`,
    )
    .join('');
  const tot = [0, 1, 2].map((p) => S.list.reduce((s, e) => s + e.pts[p], 0));
  openModal(
    `<h2>Liste</h2>
    <table class="list"><thead><tr><th>Nr.</th><th>Spiel</th><th>Du</th><th>${esc(NAMES[1])}</th><th>${esc(NAMES[2])}</th></tr></thead>
    <tbody>${rows || '<tr><td></td><td>Noch keine Spiele.</td><td></td><td></td><td></td></tr>'}</tbody>
    <tfoot><tr><td></td><td>Summe</td>${tot.map((v) => `<td class="${v < 0 ? 'neg' : ''}">${v}</td>`).join('')}</tr></tfoot></table>
    ${S.bock ? `<p>Noch ${S.bock} Bockspiel${S.bock > 1 ? 'e' : ''}.</p>` : ''}
    <div class="close-row"><button class="btn quiet" data-m="clear">Neue Liste</button><button class="btn primary" data-m="close">Schließen</button></div>`,
    (m) => {
      if (m === 'clear') {
        openModal(`<h2>Neue Liste anfangen?</h2><p>Die bisherige Liste wird gelöscht.</p><div class="close-row"><button class="btn quiet" data-m="close">Abbrechen</button><button class="btn primary" data-m="yes">Neue Liste</button></div>`, (x) => {
          if (x === 'yes') {
            S.list = [];
            S.bock = 0;
            save();
            showList();
          }
        });
      }
    },
  );
}

function seg(name, options, value) {
  return `<div class="seg">${options.map(([v, label]) => `<button data-m="set" data-k="${name}" data-v="${v}" class="${String(value) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
}

function showSettings() {
  const s = S.settings;
  const r = activeRules(s);
  const ruleRows = RULE_ITEMS.filter((it) => !it.sub || r[it.sub])
    .map(
      (it) =>
        `<div class="set ${it.sub ? 'sub' : ''}"><span class="lbl">${esc(it.label)}</span><button class="info" data-m="info" data-k="${it.key}" aria-label="Erklärung">i</button><button class="switch ${r[it.key] ? 'on' : ''}" data-m="rule" data-k="${it.key}" aria-label="${esc(it.label)}"></button></div>`,
    )
    .join('');
  openModal(
    `<h2>Einstellungen</h2>
    <h3>Gegner</h3>
    <div class="set"><span class="lbl">Stärke</span><button class="info" data-m="oinfo" data-k="level">i</button>${seg('level', [['gemuetlich', 'Gemütlich'], ['ordentlich', 'Ordentlich'], ['stark', 'Stark'], ['meister', 'Meister']], s.level)}</div>
    <div class="set"><span class="lbl">Risikofreude</span><button class="info" data-m="oinfo" data-k="risk">i</button>${seg('risk', [['vorsichtig', 'Vorsichtig'], ['normal', 'Normal'], ['mutig', 'Mutig']], s.risk)}</div>
    <div class="set"><span class="lbl">Tempo</span><button class="info" data-m="oinfo" data-k="tempo">i</button>${seg('tempo', [['langsam', 'Langsam'], ['normal', 'Normal'], ['schnell', 'Schnell']], s.tempo)}</div>
    <h3>Regeln</h3>
    <div class="set"><span class="lbl">Regelwerk</span><button class="info" data-m="oinfo" data-k="presets">i</button>${seg('preset', [['offiziell', 'Offiziell'], ['runde', 'Unsere Runde']], s.preset)}</div>
    ${ruleRows}
    <div class="set"><span class="lbl">Wertung</span><button class="info" data-m="sinfo">i</button>${seg('scoring', [['simple', 'Einfach'], ['sf', 'Seeger-Fabian']], r.scoring)}</div>
    <p class="small" style="color:#6b5f55">Regeländerungen gelten ab dem nächsten Spiel.</p>
    <div class="row" style="justify-content:flex-start"><button class="btn" data-m="share">Unsere Runde teilen</button></div>
    <h3>Bedienung</h3>
    <div class="set"><span class="lbl">Karte legen mit</span><button class="info" data-m="oinfo" data-k="taps">i</button>${seg('taps', [[1, 'Einem Tipp'], [2, 'Zwei Tipps']], s.taps)}</div>
    <div class="set"><span class="lbl">Unspielbare Karten abdunkeln</span><button class="info" data-m="oinfo" data-k="dim">i</button><button class="switch ${s.dim ? 'on' : ''}" data-m="flag" data-k="dim"></button></div>
    <div class="set"><span class="lbl">Töne</span><button class="switch ${s.sound ? 'on' : ''}" data-m="flag" data-k="sound"></button></div>
    <div class="set"><span class="lbl">Sprüche der Mäuse</span><button class="switch ${s.talk ? 'on' : ''}" data-m="flag" data-k="talk"></button></div>
    <div class="close-row"><button class="btn primary" data-m="close">Fertig</button></div>`,
    (m, btn) => {
      const k = btn.dataset.k;
      if (m === 'info') return infoModal(RULE_ITEMS.find((x) => x.key === k).label, RULE_ITEMS.find((x) => x.key === k).info, showSettings);
      if (m === 'oinfo') return infoModal(btn.closest('.set').querySelector('.lbl').textContent, OTHER_INFO[k], showSettings);
      if (m === 'sinfo') return infoModal('Wertung', `${SCORING_INFO.simple}\n\n${SCORING_INFO.sf}`, showSettings);
      if (m === 'share') return shareRunde();
      if (m === 'set') {
        const v = btn.dataset.v;
        if (k === 'scoring') {
          toRunde();
          s.runde.scoring = v;
        } else if (k === 'taps') s.taps = Number(v);
        else s[k] = v;
      }
      if (m === 'rule') {
        toRunde();
        s.runde[k] = !r[k];
      }
      if (m === 'flag') {
        s[k] = !s[k];
        if (k === 'sound') sound.setSound(s.sound);
      }
      save();
      const scroll = document.querySelector('.sheet').scrollTop;
      showSettings();
      document.querySelector('.sheet').scrollTop = scroll;
      render();
    },
  );
}

// Änderung an einer Regel: aus "Offiziell" wird "Unsere Runde" (mit den aktuellen Werten als Ausgangspunkt).
function toRunde() {
  const s = S.settings;
  if (s.preset === 'offiziell') {
    s.runde = activeRules(s);
    s.preset = 'runde';
  }
}

function shareUrl() {
  const code = encodeRunde(activeRules({ ...S.settings, preset: 'runde' }));
  return `${location.origin}${location.pathname}?runde=${encodeURIComponent(code)}`;
}

async function shareRunde() {
  const url = shareUrl();
  const text = 'Unsere Skat-Runde mit unseren Hausregeln:';
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Skat – Unsere Runde', text, url });
      return;
    } catch {
      /* abgebrochen: Link anzeigen */
    }
  }
  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {
    copied = false;
  }
  openModal(
    `<h2>Unsere Runde teilen</h2><p>${copied ? 'Der Link ist kopiert. ' : ''}Wer ihn öffnet, kann eure Hausregeln mit einem Tipp übernehmen:</p>
    <p class="share-url">${esc(url)}</p>
    <p>${describeRunde(activeRules({ ...S.settings, preset: 'runde' })).map(esc).join('<br>')}</p>
    <div class="close-row"><button class="btn primary" data-m="close">Schließen</button></div>`,
  );
}

function checkImport() {
  const params = new URLSearchParams(location.search);
  const code = params.get('runde');
  if (!code) return;
  history.replaceState(null, '', location.pathname);
  const runde = decodeRunde(code);
  if (!runde) return;
  openModal(
    `<h2>Hausregeln übernehmen?</h2><p>Jemand hat dir seine Skat-Runde geschickt:</p><p>${describeRunde(runde).map(esc).join('<br>')}</p>
    <div class="close-row"><button class="btn quiet" data-m="close">Nein danke</button><button class="btn primary" data-m="yes">Übernehmen</button></div>`,
    (m) => {
      if (m === 'yes') {
        S.settings.runde = runde;
        S.settings.preset = 'runde';
        save();
        closeModal();
        render();
      }
    },
  );
}

function showHelp() {
  openModal(
    `<h2>So geht's</h2>
    <p><b>Reizen:</b> Die großen Knöpfe in der Mitte. „18 sagen“ reizt weiter, „Ja“ hält mit, „Passe“ steigt aus.</p>
    <p><b>Spielen:</b> ${S.settings.taps === 2 ? 'Karte einmal antippen hebt sie an, nochmal antippen legt sie.' : 'Karte antippen legt sie.'} Graue Karten darfst du gerade nicht legen.</p>
    <p><b>Letzter Stich:</b> Der Knopf oben zeigt den zuletzt eingesammelten Stich.</p>
    <p><b>Die Gegner</b> sehen nur ihre eigenen Karten und das, was auf dem Tisch lag. Wie stark sie spielen, stellst du unter Einstellungen ein.</p>
    <p><b>Speichern</b> passiert von selbst. Du kannst die App jederzeit schließen und später weiterspielen.</p>
    <div class="close-row"><button class="btn primary" data-m="close">Schließen</button></div>`,
  );
}

function showLastTrick() {
  const g = st();
  if (!g || !g.tricks.length) return;
  const t = g.tricks[g.tricks.length - 1];
  openModal(
    `<h2>Letzter Stich</h2><div class="mini-cards">${t.cards.map((x) => `<div style="text-align:center">${cardSVG(x.c)}<div>${esc(NAMES[x.p])}</div></div>`).join('')}</div>
    <p>${esc(NAMES[t.winner])} ${t.winner === 0 ? 'hast' : 'hat'} den Stich bekommen.</p>
    <div class="close-row"><button class="btn primary" data-m="close">Schließen</button></div>`,
  );
}

// ---------------------------------------------------------------------------
// Start

function init() {
  document.body.insertAdjacentHTML('afterbegin', defsSVG());
  sound.setSound(S.settings.sound);
  $('#hand').addEventListener('click', (e) => {
    const el = e.target.closest('.hc');
    if (el) onCardTap(Number(el.dataset.c));
  });
  $('#panel').addEventListener('click', onPanel);
  $('#btn-menu').addEventListener('click', () => {
    sound.unlock();
    showMenu();
  });
  $('#btn-last').addEventListener('click', showLastTrick);
  $('#btn-sound').addEventListener('click', () => {
    S.settings.sound = !S.settings.sound;
    sound.setSound(S.settings.sound);
    sound.unlock();
    save();
    renderStatus();
  });
  window.addEventListener('resize', () => render());
  document.addEventListener('pointerdown', () => sound.unlock(), { once: true });
  render();
  checkImport();
  if (S.st && S.st.phase !== 'done' && S.st.phase !== 'passed') loop();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();

// Für Tests im Browser
window.__skat = { get state() { return S; }, cardName, SUIT_NAMES };
