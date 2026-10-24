// Misst die Bedenkzeit der KI im Browser mit 4-fach gedrosselter CPU (grob ein Mittelklasse-Handy).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const level = process.argv[2] || 'meister';
const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 800, height: 370 } });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await p.addInitScript((lv) => localStorage.setItem('skat-v1', JSON.stringify({ settings: { level: lv, tempo: 'schnell', taps: 1 }, list: [], dealer: 2, bock: 0, st: null })), level);
await p.goto('http://localhost:8123/');
await p.waitForTimeout(500);
await p.evaluate(() => {
  window.__times = [];
  const W = window.Worker;
  // Zeiten über die Konsole messen ist einfacher: wir patchen postMessage nicht, sondern messen Zugwechsel.
});
await p.click('[data-act=deal]');
const t0 = Date.now(); let last = Date.now(); const waits = [];
for (let i = 0; i < 600; i++) {
  await p.waitForTimeout(100);
  const s = await p.evaluate(() => { const g = window.__skat.state.st; return { phase: g.phase, turn: g.turn, n: g.tricks.length }; });
  if (s.phase === 'done' || s.phase === 'passed') break;
  if (s.turn !== 0) continue;
  waits.push(Date.now() - last);
  const btn = await p.$('#panel [data-act=pass], #panel [data-act=take], #panel [data-act=nokontra], #panel [data-act=nore]');
  if (s.phase === 'bid' || s.phase === 'skat' || s.phase === 'kontra') { if (btn) await btn.click(); last = Date.now(); continue; }
  if (s.phase === 'discard' || s.phase === 'declare') break;
  const ids = await p.$$eval('#hand .hc:not(.dim)', els => els.map(e => e.dataset.c));
  if (ids.length) { await p.click(`#hand .hc[data-c="${ids[0]}"]`); last = Date.now(); }
}
console.log(level, 'Wartezeiten bis man wieder dran ist (ms, inkl. Tempo "schnell" und Stich-Anzeige):', waits.join(' '));
await b.close();
