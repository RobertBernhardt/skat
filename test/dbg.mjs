import { newDeal, PRESETS, viewFor, card, cardName } from '../js/engine.js';
import { evaluateBidding, bidLimit } from '../js/ai.js';
import { Solver, maskOf } from '../js/dd.js';
// Spieler 1 bekommt starkes Herzblatt
const st = newDeal(0, PRESETS.offiziell);
const strong = [card(0,4),card(1,4),card(2,7),card(2,3),card(2,6),card(2,5),card(2,2),card(0,7),card(1,7),card(3,7)];
const rest = [...Array(32).keys()].filter(c=>!strong.includes(c));
st.hands = [rest.slice(0,10), strong, rest.slice(10,20)]; st.skat = rest.slice(20,22);
const v = viewFor(st, 1);
console.log(evaluateBidding(v, 'stark'));
console.log('limit', bidLimit(v,'stark','normal'));
const s = new Solver(2, 1); s.setHands(st.hands.map(maskOf));
console.log('exact decl pts', s.fromTrick([], 1, -1, 256));
