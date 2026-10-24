// Baut gezielte Spielzustände und fotografiert die Oberfläche.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { newDeal, applyAction, PRESETS, card } from '../js/engine.js';
import { DEFAULTS } from '../js/settings.js';
const out = process.argv[2];
const base = (st, extra = {}) => ({ settings: { ...DEFAULTS, ...extra }, list: [], dealer: st.dealer, bock: 0, st });
function bidTo(st, declarer) {
  // alle außer declarer passen
  while (st.phase === 'bid') {
    const b = st.bid; const p = st.turn;
    let a;
    if (b.stage === 3) a = p === declarer ? { t: 'bid', v: 18 } : { t: 'pass' };
    else if (b.waiting === 'asker') a = p === declarer ? { t: 'bid', v: [18,20,22,23,24,27,30][Math.min(6, Math.floor(b.value/4))] } : { t: 'pass' };
    else a = p === declarer ? { t: 'hold' } : { t: 'pass' };
    if (a.t === 'bid') { const nb = [18,20,22,23,24,27,30,33,35,36,40].find(x => x > b.value); a.v = nb; }
    st = applyAction(st, a);
  }
  return st;
}
const states = {};
let st = newDeal(2, { ...PRESETS.runde, kontra: true });
st = bidTo(st, 0); st = applyAction(st, { t: 'take' });
const disc = st.hands[0].slice(0, 2); st = applyAction(st, { t: 'discard', cards: disc });
states.declare = base(st);
let st2 = newDeal(2, { ...PRESETS.runde, kontra: true });
st2 = bidTo(st2, 1); st2 = applyAction(st2, { t: 'hand' }); st2 = applyAction(st2, { t: 'declare', game: { type: 'suit', trump: 2 } });
// Kontra-Frage an den Menschen (Spieler 0 ist nach Spieler 2 dran) – Spieler 2 sagt nicht Kontra
if (st2.turn !== 0) st2 = applyAction(st2, { t: 'nokontra' });
states.kontra = base(st2);
// Ergebnis: Spiel durchspielen mit erster erlaubter Karte
let st3 = newDeal(0, PRESETS.offiziell);
st3 = bidTo(st3, 2); st3 = applyAction(st3, { t: 'take' }); st3 = applyAction(st3, { t: 'discard', cards: st3.hands[2].slice(0,2) }); st3 = applyAction(st3, { t: 'declare', game: { type: 'grand' } });
import { legalActions } from '../js/engine.js';
while (st3.phase === 'play') st3 = applyAction(st3, legalActions(st3)[0]);
states.result = base(st3);
// Null ouvert eines Computers
let st4 = newDeal(0, PRESETS.offiziell);
st4 = bidTo(st4, 1); st4 = applyAction(st4, { t: 'hand' }); st4 = applyAction(st4, { t: 'declare', game: { type: 'null', ouvert: true } });
states.ouvert = base(st4);

const b = await pw.chromium.launch();
for (const [name, S] of Object.entries(states)) {
  for (const [w, h] of [[800, 370], [1280, 720]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript((s) => localStorage.setItem('skat-v1', s), JSON.stringify(S));
    await p.goto('http://localhost:8123/');
    await p.waitForTimeout(name === 'ouvert' ? 300 : 600);
    if (name === 'declare') { await p.click('#panel [data-act=pick][data-id=s2]'); }
    await p.screenshot({ path: `${out}-${name}-${w}.png` });
    if (errs.length) console.log(name, errs);
    await ctx.close();
  }
}
// Einstellungen, Liste, Hochkant
const ctx = await b.newContext({ viewport: { width: 800, height: 370 }, deviceScaleFactor: 1.5 });
const p = await ctx.newPage();
await p.addInitScript((s) => localStorage.setItem('skat-v1', s), JSON.stringify(states.result));
await p.goto('http://localhost:8123/'); await p.waitForTimeout(300);
await p.click('#btn-menu'); await p.screenshot({ path: `${out}-menu.png` });
await p.click('[data-m=settings]'); await p.waitForTimeout(200); await p.screenshot({ path: `${out}-settings.png` });
await p.click('[data-m=info][data-k=kontra]'); await p.waitForTimeout(200); await p.screenshot({ path: `${out}-info.png` });
await p.setViewportSize({ width: 370, height: 800 }); await p.waitForTimeout(200); await p.screenshot({ path: `${out}-portrait.png` });
await b.close();
