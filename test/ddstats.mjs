import { Solver, maskOf } from '../js/dd.js';
import { newDeal, PRESETS, EFF } from '../js/engine.js';
import { bestDiscards } from '../js/ai.js';
// Realistische Lage: Spieler 0 bekommt das Blatt mit den meisten Trümpfen in Herz
const times = [];
for (let i = 0; i < 60; i++) {
  const st = newDeal(2, PRESETS.offiziell);
  const k = i % 3 === 0 ? 4 : 2;
  // Stärkste Hand als Alleinspieler wählen
  const score = (h) => h.filter(c => EFF[k][c] === 4).length;
  let d = [0,1,2].sort((a,b)=>score(st.hands[b])-score(st.hands[a]))[0];
  const h12 = st.hands[d].concat(st.skat);
  const game = k === 4 ? {type:'grand'} : {type:'suit', trump: 2};
  const [disc] = bestDiscards(h12, game, 1);
  const hands = st.hands.slice(); hands[d] = h12.filter(c=>!disc.includes(c));
  const pts = disc.reduce((s,c)=>s+[0,0,0,10,2,3,4,11][c&7],0);
  const s = new Solver(k, d); s.setHands(hands.map(maskOf));
  const t0 = performance.now();
  s.fromTrick([], 0, 60-pts, 61-pts);
  times.push([performance.now()-t0, s.nodes]);
}
times.sort((a,b)=>b[0]-a[0]);
console.log('max', times.slice(0,5).map(x=>x.map(Math.round)), 'median', times[30].map(Math.round), 'mean', Math.round(times.reduce((s,x)=>s+x[0],0)/times.length));
