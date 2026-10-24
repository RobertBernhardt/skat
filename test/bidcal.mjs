import { newDeal, PRESETS, viewFor } from '../js/engine.js';
import { evaluateBidding, DD_MARGIN } from '../js/ai.js';
DD_MARGIN.value = +(process.argv[2] || 8);
const ps = [];
for (let i = 0; i < 50; i++) {
  const st = newDeal(0, PRESETS.offiziell);
  let best = 0;
  for (let p = 0; p < 3; p++) {
    const ev = evaluateBidding(viewFor(st, p), 'stark');
    const f = Math.max(ev.take.filter(v => v >= 18).length, ev.hand.filter(v => v >= 18).length) / ev.take.length;
    best = Math.max(best, f);
  }
  ps.push(best);
}
console.log('margin', DD_MARGIN.value, [0.45, 0.58, 0.7].map(th => `${th}: pass ${(ps.filter(p => p < th).length / ps.length).toFixed(2)}`).join('  '));
