import { newDeal, PRESETS, viewFor, applyDecision, scoreGame, gameName, evaluate } from '../js/engine.js';
import { decide } from '../js/ai.js';
const level = process.argv[2] || 'stark';
const N = +(process.argv[3] || 10);
const rules = { ...PRESETS.offiziell, kontra: true };
let stats = { games: 0, passed: 0, won: 0, types: {}, maxMs: {}, totMs: {}, cnt: {} };
for (let g = 0; g < N; g++) {
  let st = newDeal(g % 3, rules);
  while (st.phase !== 'done' && st.phase !== 'passed') {
    const v = viewFor(st, st.turn);
    const t0 = Date.now();
    const d = decide(v, level, 'normal');
    const ms = Date.now() - t0;
    const ph = st.phase;
    stats.maxMs[ph] = Math.max(stats.maxMs[ph] || 0, ms);
    stats.totMs[ph] = (stats.totMs[ph] || 0) + ms; stats.cnt[ph] = (stats.cnt[ph] || 0) + 1;
    st = applyDecision(st, d);
  }
  if (st.phase === 'passed') { stats.passed++; continue; }
  stats.games++;
  if (st.result.won) stats.won++;
  const tn = st.game.type === 'suit' ? 'farbe' : st.game.type + (st.game.hand ? '-hand' : '') + (st.game.ouvert ? '-ouvert' : '');
  stats.types[tn] = (stats.types[tn] || 0) + 1;
  console.log(`${gameName(st.game)} gereizt ${st.bidValue} -> ${st.result.won ? 'gewonnen' : 'verloren'} ${st.result.declPts} Augen, Wert ${st.result.gameValue}, kontra ${st.kontra} | ${st.result.detail.join(', ')} | Liste ${scoreGame(st)}`);
}
for (const k in stats.totMs) stats.totMs[k] = Math.round(stats.totMs[k] / stats.cnt[k]);
console.log(JSON.stringify(stats));
