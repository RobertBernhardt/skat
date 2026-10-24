// Spielt im Browser ein paar Schritte als Mensch und macht Screenshots.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const out = process.argv[2];
const [w, h] = (process.argv[3] || '800x370').split('x').map(Number);
const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
const p = await ctx.newPage();
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/');
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}-0-start.png` });
await p.click('[data-act=deal]');
let shots = 1;
for (let i = 0; i < 400; i++) {
  await p.waitForTimeout(250);
  const s = await p.evaluate(() => { const S = window.__skat.state; const g = S.st; return { phase: g.phase, turn: g.turn, hand: g.hands[0].length, tricks: g.tricks.length }; });
  const btns = await p.$$eval('#panel [data-act]:not([disabled])', els => els.map(e => e.dataset.act + (e.dataset.id ? ':' + e.dataset.id : '')));
  if (s.turn !== 0 && !['done', 'passed'].includes(s.phase)) continue;
  if (shots < 9 && (i % 3 === 0 || s.phase !== 'play')) { await p.screenshot({ path: `${out}-${shots++}-${s.phase}.png` }); }
  if (s.phase === 'done' || s.phase === 'passed') { await p.screenshot({ path: `${out}-end-${s.phase}.png` }); break; }
  if (s.phase === 'bid') { await p.click(btns.includes('bid') && Math.random() < 0.6 ? '#panel [data-act=bid]' : btns.includes('hold') ? '#panel [data-act=hold]' : '#panel [data-act=pass]'); continue; }
  if (s.phase === 'skat') { await p.click('#panel [data-act=take]'); continue; }
  if (s.phase === 'discard') { const ids = await p.$$eval('#hand .hc', els => els.map(e => e.dataset.c)); await p.click(`#hand .hc[data-c="${ids[ids.length-1]}"]`); await p.click(`#hand .hc[data-c="${ids[ids.length-2]}"]`); await p.screenshot({ path: `${out}-discard.png` }); await p.click('#panel [data-act=discard]'); continue; }
  if (s.phase === 'declare') { await p.click('#panel [data-act=pick][data-id=grand]'); await p.screenshot({ path: `${out}-declare.png` }); await p.click('#panel [data-act=declare]'); continue; }
  if (s.phase === 'kontra') { await p.click('#panel [data-act=nokontra], #panel [data-act=nore]'); continue; }
  if (s.phase === 'play') {
    const ids = await p.$$eval('#hand .hc:not(.dim)', els => els.map(e => e.dataset.c));
    if (!ids.length) continue;
    await p.click(`#hand .hc[data-c="${ids[0]}"]`); await p.waitForTimeout(100); await p.click(`#hand .hc[data-c="${ids[0]}"]`);
  }
}
console.log('errors:', errs);
await b.close();
