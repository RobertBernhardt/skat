// Einstellungen, Erklärtexte für die ⓘ-Knöpfe und der teilbare Link für "Unsere Runde".

import { PRESETS } from './engine.js';

export const DEFAULTS = {
  preset: 'offiziell',
  runde: { ...PRESETS.runde },
  level: 'stark',
  risk: 'normal',
  tempo: 'normal',
  taps: 2,
  dim: true,
  sound: true,
  talk: true,
};

export function activeRules(settings) {
  return settings.preset === 'offiziell' ? { ...PRESETS.offiziell } : { ...PRESETS.offiziell, ...settings.runde };
}

export const RULE_ITEMS = [
  {
    key: 'kontra',
    label: 'Kontra und Re',
    info: 'Ein Gegenspieler kann vor dem ersten Ausspielen „Kontra“ sagen, wenn er glaubt, dass der Alleinspieler verliert. Dann zählt das Spiel doppelt. Der Alleinspieler kann mit „Re“ antworten, dann zählt es vierfach. Beispiel: Grand mit einem, Spiel 2, sind 48. Mit Kontra 96, mit Re 192. In der Skatordnung von 1998 steht Kontra nicht.',
  },
  {
    key: 'bock',
    label: 'Bockrunden',
    info: 'Nach bestimmten Ereignissen folgt eine Bockrunde: Die nächsten drei Spiele (eine Runde, jeder gibt einmal) zählen doppelt. Hier lässt sich einstellen, was eine Bockrunde auslöst. Kommen mehrere zusammen, werden die Bockspiele hintereinander gespielt. Nicht in der offiziellen Skatordnung.',
  },
  {
    key: 'bockAfter6060',
    label: 'Bock nach 60 zu 60',
    sub: 'bock',
    info: 'Endet ein Spiel genau 60 zu 60, hat der Alleinspieler verloren, und es folgt eine Bockrunde.',
  },
  {
    key: 'bockAfterKontraRe',
    label: 'Bock nach Kontra und Re',
    sub: 'bock',
    info: 'Wurde in einem Spiel Kontra und Re gesagt, folgt danach eine Bockrunde.',
  },
  {
    key: 'nullOuvert',
    label: 'Null ouvert',
    info: 'Null-Spiel mit offen hingelegten Karten: Der Alleinspieler legt vor dem ersten Ausspielen alle Karten offen hin und darf trotzdem keinen Stich bekommen. Wert 46, als Handspiel 59. Gehört zu den offiziellen Regeln.',
  },
  {
    key: 'ouvertGames',
    label: 'Ouvert bei Farb- und Grandspielen',
    info: 'Ein Farb- oder Grandspiel mit offenen Karten. Es geht nur als Handspiel, und der Alleinspieler muss alle Stiche machen (Schwarz ist automatisch angesagt). Sehr selten, aber offiziell erlaubt.',
  },
  {
    key: 'lostDouble',
    label: 'Verlorene Spiele doppelt',
    info: 'Offiziell wird jedes verlorene Spiel doppelt abgezogen, auch Handspiele. Beispiel: Herz mit zweien, Spiel 3, sind 30. Verloren werden 60 abgezogen. Ausgeschaltet zieht man nur den einfachen Wert ab. Bei der Seeger-Fabian-Wertung zählt Verlorenes immer doppelt.',
  },
];

export const SCORING_INFO = {
  simple: 'Einfache Liste: Gewinnt der Alleinspieler, bekommt er den Spielwert gutgeschrieben. Verliert er, wird ihm der doppelte Spielwert abgezogen (oder der einfache, wenn „Verlorene Spiele doppelt“ aus ist). Die Gegenspieler bekommen nichts. So rechnen die meisten am Küchentisch.',
  sf: 'Seeger-Fabian ist die Turnierwertung des Skatverbands. Gewonnenes Spiel: Spielwert plus 50. Verlorenes Spiel: doppelter Spielwert, dazu minus 50. Außerdem bekommt jeder Gegenspieler 40 Punkte, wenn der Alleinspieler verliert. Beispiel: Grün mit einem, Spiel 2, sind 22. Gewonnen: 72. Verloren: minus 94, und beide Gegner bekommen je 40.',
};

export const OTHER_INFO = {
  level: 'Wie gut die Computer die Karten spielen. Gemütlich: einfache Faustregeln, gelegentlich echte Fehler. Ordentlich: Faustregeln ohne Fehler. Stark: rechnet für jede Karte viele mögliche Verteilungen der unbekannten Karten durch. Meister: rechnet noch mehr Verteilungen durch und zieht Schlüsse aus dem Reizen. Kein Computer schaut in fremde Karten.',
  risk: 'Wie hoch die Computer reizen. Vorsichtig: nur mit klar guten Karten. Normal: wie ein erfahrener Spieler. Mutig: reizt auch knappe Blätter. Das gilt auch, wenn ein Computer mit dir zusammen gegen den Alleinspieler spielt: Ein vorsichtiger Partner sagt seltener Kontra.',
  tempo: 'Wie lange die Karten der Computer liegen bleiben, bevor der Stich eingesammelt wird.',
  taps: 'Ein Tipp: Die Karte wird sofort gelegt. Zwei Tipps: Der erste Tipp hebt die Karte an, der zweite legt sie. Das schützt vor Vertippern, denn im Skat wird nichts zurückgenommen.',
  dim: 'Karten, die du gerade wegen der Bedienpflicht nicht legen darfst, werden grau. Eine Hilfe, keine Regel.',
  presets: 'Offiziell: Regeln der Internationalen Skatordnung, Wertung nach Seeger-Fabian, ohne Kontra und Bock. Unsere Runde: eure eigene Mischung. Jede Änderung unten wird in „Unsere Runde“ gespeichert. Mit „Runde teilen“ schickst du die Regeln als Link an andere.',
};

// Kurzer, robuster Link: nur die Abweichungen von „Offiziell“.
const SHORT = { kontra: 'k', bock: 'b', bockAfter6060: 'b6', bockAfterKontraRe: 'bk', nullOuvert: 'n', ouvertGames: 'o', lostDouble: 'l', scoring: 's' };

export function encodeRunde(runde) {
  const parts = [];
  for (const [key, short] of Object.entries(SHORT)) {
    const v = runde[key];
    if (key === 'scoring') parts.push(`${short}${v === 'sf' ? 'f' : 'e'}`);
    else parts.push(`${short}${v ? 1 : 0}`);
  }
  return parts.join('.');
}

export function decodeRunde(text) {
  const out = { ...PRESETS.runde };
  if (!text) return null;
  let found = false;
  for (const part of String(text).split('.')) {
    for (const [key, short] of Object.entries(SHORT)) {
      if (!part.startsWith(short)) continue;
      const rest = part.slice(short.length);
      if (key === 'scoring' && (rest === 'f' || rest === 'e')) {
        out.scoring = rest === 'f' ? 'sf' : 'simple';
        found = true;
      } else if (key !== 'scoring' && (rest === '0' || rest === '1')) {
        out[key] = rest === '1';
        found = true;
      }
    }
  }
  return found ? out : null;
}

export function describeRunde(runde) {
  const lines = [];
  for (const item of RULE_ITEMS) {
    if (item.sub && !runde[item.sub]) continue;
    lines.push(`${item.label}: ${runde[item.key] ? 'an' : 'aus'}`);
  }
  lines.push(`Wertung: ${runde.scoring === 'sf' ? 'Seeger-Fabian' : 'Einfache Liste'}`);
  return lines;
}
