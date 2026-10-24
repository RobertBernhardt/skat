import { Solver, maskOf } from '../js/dd.js';
import { newDeal, PRESETS } from '../js/engine.js';
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (const k of [0, 4, 5]) {
  let t0 = Date.now(), nodes = 0;
  const N = 20;
  for (let i = 0; i < N; i++) {
    const st = newDeal(0, PRESETS.offiziell, rnd);
    const s = new Solver(k, 1);
    s.setHands(st.hands.map(maskOf));
    const v = k === 5 ? s.fromTrick([], 1, 0, 1) : s.fromTrick([], 1, 60, 61);
    nodes += s.nodes;
  }
  console.log('kind', k, 'ms/search', (Date.now() - t0) / N, 'nodes', Math.round(nodes / N));
}
// exact
let t0 = Date.now();
for (let i = 0; i < 5; i++) { const st = newDeal(0, PRESETS.offiziell, rnd); const s = new Solver(0, 1); s.setHands(st.hands.map(maskOf)); s.fromTrick([], 1, -1, 256); }
console.log('exact ms', (Date.now() - t0) / 5);
