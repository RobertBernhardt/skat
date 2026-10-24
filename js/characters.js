// Die Mäuse am Tisch: Bild und Sprüche. Höchstens ein Spruch pro Spiel und Figur.

export const CHARACTERS = [
  { name: 'Erna', fur: '#b9b4ad', inner: '#f2b8c0', accessory: 'glasses', color: '#7b4fa0' },
  { name: 'Kalle', fur: '#a87b55', inner: '#f2b8c0', accessory: 'cap', color: '#c8231b' },
];

export function mouseSVG(ch) {
  const acc =
    ch.accessory === 'glasses'
      ? `<circle cx="39" cy="54" r="9" fill="none" stroke="#3a2f2a" stroke-width="2.5"/><circle cx="61" cy="54" r="9" fill="none" stroke="#3a2f2a" stroke-width="2.5"/><path d="M48 54h4" stroke="#3a2f2a" stroke-width="2.5"/><path d="M22 86c10 8 46 8 56 0l-4 12H26z" fill="${ch.color}"/>`
      : `<path d="M26 34c4-14 44-14 48 0z" fill="${ch.color}"/><path d="M50 30c14 0 30 2 36 8-12 0-24-2-36-2z" fill="${ch.color}"/><circle cx="50" cy="21" r="3" fill="#fff"/>`;
  return `<svg viewBox="0 0 100 100" class="mouse" aria-hidden="true">
    <circle cx="22" cy="30" r="18" fill="${ch.fur}"/><circle cx="22" cy="30" r="11" fill="${ch.inner}"/>
    <circle cx="78" cy="30" r="18" fill="${ch.fur}"/><circle cx="78" cy="30" r="11" fill="${ch.inner}"/>
    <ellipse cx="50" cy="60" rx="30" ry="28" fill="${ch.fur}"/>
    <ellipse cx="50" cy="72" rx="16" ry="12" fill="#efe7dc"/>
    <circle cx="40" cy="54" r="4" fill="#2b2118"/><circle cx="60" cy="54" r="4" fill="#2b2118"/>
    <circle cx="41.3" cy="52.6" r="1.3" fill="#fff"/><circle cx="61.3" cy="52.6" r="1.3" fill="#fff"/>
    <ellipse cx="50" cy="66" rx="5" ry="4" fill="#e87c8e"/>
    <path d="M44 72q6 5 12 0" fill="none" stroke="#2b2118" stroke-width="2" stroke-linecap="round"/>
    <path d="M30 64 12 60M30 68 12 70M70 64l18-4M70 68l18 2" stroke="#6b5f55" stroke-width="1.5" stroke-linecap="round"/>
    ${acc}
  </svg>`;
}

// Spruch-Sammlung je Anlass. {n} wird durch einen Namen ersetzt.
const LINES = {
  bidHigh: ['Ich sag {v}. Man lebt nur einmal!', '{v}! Mir juckt das Fell.', 'Noch einer drauf: {v}.'],
  pass: ['Ich passe, mein Lieber.', 'Da halt ich mich raus.', 'Passe. Heute nicht.'],
  grand: ['Grand! Jetzt wird es ernst.', 'Grand. Bitte festhalten.'],
  nullGame: ['Null? Na, da bin ich gespannt.', 'Ein Nullchen. Wie mutig.'],
  hand: ['Hand! Der Skat bleibt liegen.', 'Hand. Ich brauch keine Hilfe.'],
  kontra: ['Kontra! Das lass ich mir nicht bieten.', 'Kontra. Wollen wir doch mal sehen.'],
  re: ['Re! Jetzt erst recht.', 'Re. Ich bin mir sicher.'],
  declWins: ['Na bitte. Läuft.', 'Wie geplant.', 'Gelernt ist gelernt.'],
  declWinsBig: ['Schneider! Das tut weh, was?', 'Das war ein Käsefest.'],
  declLoses: ['Oh weh. Das ging daneben.', 'Mist, verzockt.', 'Das Blatt war schöner als das Spiel.'],
  defenseWins: ['Zusammen sind wir stark!', 'Den haben wir erwischt.', 'Schön zusammengespielt.'],
  humanWins: ['Gut gespielt, das muss man sagen.', 'Na gut, gratuliere.'],
  humanLoses: ['Tja, Pech gehabt.', 'Nächstes Mal vielleicht.'],
  einpassen: ['Alle feige heute.', 'Dann eben neu mischen.'],
};

export function pickLine(kind, vars = {}) {
  const arr = LINES[kind];
  if (!arr) return null;
  let s = arr[Math.floor(Math.random() * arr.length)];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
