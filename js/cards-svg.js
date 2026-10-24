// Klassisches deutsches Blatt als SVG, ohne Bilddateien.
// Farbsymbole werden einmal als <symbol> definiert und in jeder Karte per <use> eingesetzt.

import { suitOf, rankOf, RANK_LABELS } from './engine.js';

const INK = '#2b2118';

export function defsSVG() {
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="g-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe38a"/><stop offset=".55" stop-color="#e2ad2a"/><stop offset="1" stop-color="#a8761a"/></linearGradient>
  <linearGradient id="g-red" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f05a4f"/><stop offset=".6" stop-color="#c8231b"/><stop offset="1" stop-color="#8e130f"/></linearGradient>
  <linearGradient id="g-green" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7cc66a"/><stop offset=".6" stop-color="#2f8a2f"/><stop offset="1" stop-color="#1c5a1f"/></linearGradient>
  <linearGradient id="g-nut" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e3b25a"/><stop offset=".5" stop-color="#c47f2c"/><stop offset="1" stop-color="#8a4f17"/></linearGradient>
  <linearGradient id="g-paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#f3ead6"/></linearGradient>
  <pattern id="p-cap" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#9c7a2e"/><path d="M0 0H8M0 4H8M0 0V8M4 0V8" stroke="#5e4614" stroke-width="1.2"/></pattern>
  <pattern id="p-back" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="#8e1b1b"/><rect x="2" y="2" width="12" height="12" fill="none" stroke="#d9a441" stroke-width="1.2"/><circle cx="8" cy="8" r="1.8" fill="#d9a441"/></pattern>

  <symbol id="s2" viewBox="0 0 100 100"><path d="M50 90C22 68 6 50 6 31 6 16 17 6 31 6c9 0 15 5 19 12 4-7 10-12 19-12 14 0 25 10 25 25 0 19-16 37-44 59z" fill="url(#g-red)" stroke="#6e0f0b" stroke-width="3"/><path d="M24 22c5-6 13-6 17 0" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/></symbol>

  <symbol id="s3" viewBox="0 0 100 100"><circle cx="50" cy="12" r="6" fill="url(#g-gold)" stroke="#6b4a10" stroke-width="2.5"/><circle cx="50" cy="55" r="38" fill="url(#g-gold)" stroke="#6b4a10" stroke-width="3"/><path d="M13 46q37-14 74 0v14q-37-14-74 0z" fill="#c8231b" stroke="#6e0f0b" stroke-width="2"/><path d="M14 47q36-12 72 0" fill="none" stroke="#fbe38a" stroke-width="1.5"/><circle cx="38" cy="76" r="4.5" fill="${INK}"/><circle cx="62" cy="76" r="4.5" fill="${INK}"/><path d="M38 76h24" stroke="${INK}" stroke-width="3"/><path d="M30 30c6-6 14-8 20-8" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="5" stroke-linecap="round"/></symbol>

  <symbol id="s1" viewBox="0 0 100 100"><path d="M50 4C76 24 88 50 72 73 64 83 56 86 50 87 44 86 36 83 28 73 12 50 24 24 50 4z" fill="url(#g-green)" stroke="#123d14" stroke-width="3"/><path d="M50 12V96" stroke="#123d14" stroke-width="3.5" stroke-linecap="round"/><path d="M50 34 34 24M50 34l16-10M50 50 30 38M50 50l20-12M50 66 33 56M50 66l17-10" stroke="#123d14" stroke-width="2.2" stroke-linecap="round"/><path d="M36 26c-6 8-8 18-6 26" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="4" stroke-linecap="round"/></symbol>

  <symbol id="s0" viewBox="0 0 100 100"><path d="M50 3v10" stroke="#5e4614" stroke-width="4" stroke-linecap="round"/><path d="M50 10c-9 0-12 4-12 8" fill="none" stroke="#2f8a2f" stroke-width="3"/><ellipse cx="50" cy="65" rx="22" ry="31" fill="url(#g-nut)" stroke="#5a320c" stroke-width="3"/><path d="M42 50c-3 10-3 22 1 32" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="4" stroke-linecap="round"/><path d="M22 44c0-16 12-28 28-28s28 12 28 28c0 4-12 6-28 6s-28-2-28-6z" fill="url(#p-cap)" stroke="#4a370f" stroke-width="3"/></symbol>
  </defs></svg>`;
}

const ROBE = [
  { main: '#7a4a1e', light: '#d9a441', dark: '#4a2a0c' }, // Eichel
  { main: '#2f7d32', light: '#a8d48a', dark: '#174a1a' }, // Grün
  { main: '#b5241c', light: '#f2a29c', dark: '#6e0f0b' }, // Herz
  { main: '#d39b18', light: '#f8e08a', dark: '#7a560a' }, // Schellen
];

const pip = (s, x, y, size) => `<use href="#s${s}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"/>`;

const PIPS = {
  0: [[68, 70], [132, 70], [68, 150], [132, 150], [68, 230], [132, 230], [100, 110]],
  1: [[68, 60], [132, 60], [68, 120], [132, 120], [68, 180], [132, 180], [68, 240], [132, 240]],
  2: [[68, 60], [132, 60], [68, 120], [132, 120], [68, 180], [132, 180], [68, 240], [132, 240], [100, 150]],
  3: [[68, 60], [132, 60], [68, 120], [132, 120], [68, 180], [132, 180], [68, 240], [132, 240], [100, 90], [100, 210]],
};

function corner(s, r) {
  const label = RANK_LABELS[r];
  const fs = label.length > 1 ? 25 : 30;
  const one = `<text x="22" y="40" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="${fs}" fill="${INK}" letter-spacing="-1">${label}</text>${pip(s, 22, 60, 24)}`;
  return `${one}<g transform="rotate(180 100 150)">${one}</g>`;
}

// Halbe Figur (obere Kartenhälfte); wird gespiegelt für das klassische doppelköpfige Bild.
function halfFigure(s, r) {
  const c = ROBE[s];
  const skin = '#f2cfa5';
  const king = r === 6;
  const ober = r === 5;
  let hat;
  if (king) {
    hat = `<path d="M80 54 84 30 92 44 100 26 108 44 116 30 120 54z" fill="url(#g-gold)" stroke="#6b4a10" stroke-width="2"/><circle cx="100" cy="26" r="3.5" fill="#c8231b"/><circle cx="84" cy="30" r="3" fill="#2f8a2f"/><circle cx="116" cy="30" r="3" fill="#2f8a2f"/>`;
  } else if (ober) {
    hat = `<path d="M72 56c4-16 16-24 28-24s24 8 28 24z" fill="${c.main}" stroke="${c.dark}" stroke-width="2"/><path d="M70 56h60" stroke="${c.dark}" stroke-width="4" stroke-linecap="round"/><path d="M116 38c10-14 22-18 30-16-8 4-16 12-22 22z" fill="${c.light}" stroke="${c.dark}" stroke-width="1.5"/>`;
  } else {
    hat = `<path d="M78 56c2-12 10-18 22-18s20 6 22 18z" fill="${c.dark}" stroke="${INK}" stroke-width="1.5"/><path d="M76 56h48" stroke="${c.light}" stroke-width="3" stroke-linecap="round"/>`;
  }
  const beard = king
    ? `<path d="M86 76c2 14 8 20 14 20s12-6 14-20c-4 4-8 6-14 6s-10-2-14-6z" fill="#e9e4da" stroke="#9a9184" stroke-width="1.2"/>`
    : ober
      ? `<path d="M88 78c3 9 7 12 12 12s9-3 12-12c-4 3-8 4-12 4s-8-1-12-4z" fill="#7a4a1e" stroke="#4a2a0c" stroke-width="1"/>`
      : `<path d="M93 77q7 4 14 0" fill="none" stroke="#7a4a1e" stroke-width="2.5" stroke-linecap="round"/>`;
  const face = `<circle cx="100" cy="68" r="15" fill="${skin}" stroke="#8a5a36" stroke-width="1.5"/><circle cx="94.5" cy="66" r="1.8" fill="${INK}"/><circle cx="105.5" cy="66" r="1.8" fill="${INK}"/><path d="M100 68v5" stroke="#8a5a36" stroke-width="1.3"/>`;
  const body = `<path d="M46 150c2-30 18-52 40-58h28c22 6 38 28 40 58z" fill="${c.main}" stroke="${c.dark}" stroke-width="2"/>
    <path d="M86 92h28l-14 22z" fill="${c.light}" stroke="${c.dark}" stroke-width="1.5"/>
    <path d="M78 92c6 8 16 10 22 10s16-2 22-10" fill="none" stroke="#fffdf6" stroke-width="7" stroke-linecap="round"/>
    <path d="M78 92c6 8 16 10 22 10s16-2 22-10" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="2 3"/>
    <path d="M100 114v36" stroke="${c.light}" stroke-width="5"/>
    <circle cx="100" cy="124" r="2.6" fill="url(#g-gold)"/><circle cx="100" cy="137" r="2.6" fill="url(#g-gold)"/>
    <path d="M60 150c6-18 14-30 24-36M140 150c-6-18-14-30-24-36" fill="none" stroke="${c.dark}" stroke-width="1.5" stroke-opacity=".6"/>`;
  let prop;
  if (king) prop = `<path d="M150 150 136 52" stroke="url(#g-gold)" stroke-width="5" stroke-linecap="round"/><circle cx="136" cy="50" r="6" fill="url(#g-gold)" stroke="#6b4a10" stroke-width="1.5"/>${pip(s, 58, 116, 30)}`;
  else if (ober) prop = `<path d="M142 118c4-12 4-28 2-40" stroke="${skin}" stroke-width="8" stroke-linecap="round"/>${pip(s, 146, 58, 36)}`;
  else prop = `<path d="M120 132c10-2 18-6 22-12" stroke="${skin}" stroke-width="8" stroke-linecap="round"/>${pip(s, 148, 118, 32)}`;
  return `${body}${face}${beard}${hat}${prop}`;
}

function frame(inner) {
  return `<rect x="1" y="1" width="198" height="298" rx="14" fill="url(#g-paper)" stroke="#8c7b5e" stroke-width="2"/>${inner}`;
}

export function cardSVG(c, cls = '') {
  const s = suitOf(c);
  const r = rankOf(c);
  let inner = '';
  if (r <= 3) {
    inner = PIPS[r].map(([x, y]) => pip(s, x, y, r === 3 ? 42 : 46)).join('');
  } else if (r === 7) {
    inner = `<ellipse cx="100" cy="150" rx="62" ry="92" fill="none" stroke="#c9a54a" stroke-width="3"/><ellipse cx="100" cy="150" rx="54" ry="84" fill="none" stroke="#c9a54a" stroke-width="1" stroke-dasharray="3 4"/>
      <path d="M58 228c14 10 28 14 42 14s28-4 42-14M58 72c14-10 28-14 42-14s28 4 42 14" fill="none" stroke="#2f8a2f" stroke-width="2.5"/>
      ${pip(s, 100, 150, 104)}`;
  } else {
    inner = `<rect x="38" y="16" width="150" height="268" rx="8" fill="#fbf4e2" stroke="#b9a37a" stroke-width="1.5"/>
      <svg x="38" y="16" width="150" height="268" viewBox="25 10 150 280" preserveAspectRatio="none"><g>${halfFigure(s, r)}</g><g transform="rotate(180 100 150)">${halfFigure(s, r)}</g><path d="M25 150h150" stroke="#b9a37a" stroke-width="1.5"/></svg>`;
  }
  return `<svg class="card ${cls}" viewBox="0 0 200 300" data-card="${c}" role="img" aria-label="">${frame(inner + corner(s, r))}</svg>`;
}

export function backSVG(cls = '') {
  return `<svg class="card back ${cls}" viewBox="0 0 200 300" aria-hidden="true"><rect x="1" y="1" width="198" height="298" rx="14" fill="#fffdf6" stroke="#8c7b5e" stroke-width="2"/><rect x="12" y="12" width="176" height="276" rx="8" fill="url(#p-back)"/><ellipse cx="100" cy="150" rx="40" ry="56" fill="#8e1b1b" stroke="#d9a441" stroke-width="3"/><text x="100" y="158" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="26" fill="#f3d27a">Skat</text></svg>`;
}

export function suitIcon(s, size = 24) {
  return `<svg class="suit-icon" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><use href="#s${s}"/></svg>`;
}
