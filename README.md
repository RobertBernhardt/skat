# Skat

Skat mit klassischem deutschem Blatt gegen zwei faire Computergegner. Läuft im Browser auf Android und am PC, lässt sich als App installieren und funktioniert danach offline. Keine Werbung, kein Konto, kein Server.

## Bedienung

- Link in Chrome öffnen, im Menü „App installieren“ (bzw. „Zum Startbildschirm hinzufügen“) tippen. Die App startet dann im Querformat und im Vollbild.
- Spielstand, Liste und Einstellungen werden auf dem Gerät gespeichert, nach jeder Karte.
- „Unsere Runde“ (Hausregeln) lässt sich unter Einstellungen als Link teilen.

## Aufbau

Reines HTML/CSS/JavaScript ohne Build-Schritt.

| Datei | Inhalt |
| --- | --- |
| `js/engine.js` | Regeln: Reizen, Skat, Stiche, Spielwert, Wertung, Spielersicht `viewFor` |
| `js/dd.js` | Double-Dummy-Löser (perfekte Durchrechnung einer offenen Verteilung) |
| `js/ai.js` | Computergegner: Verteilungen auswürfeln, die zum eigenen Wissen passen, und durchrechnen |
| `js/worker.js` | Führt die KI im Hintergrund aus |
| `js/app.js` | Oberfläche und Spielablauf |
| `js/cards-svg.js` | Karten als SVG |
| `js/settings.js` | Einstellungen, Erklärtexte, Regel-Link |
| `sw.js` | Offline-Speicher (bei jeder Änderung `VERSION` erhöhen) |

## Faire Gegner

Die KI bekommt nur `viewFor(state, spieler)`: eigene Karten, gespielte Karten, Reizverlauf, Ansage, eigener Skat (als Alleinspieler) und bei Ouvert die offenen Karten. Die übrigen Karten würfelt sie passend zu diesem Wissen aus (Fehlfarben, beim Meister auch Rückschlüsse aus dem Reizen), rechnet jede Verteilung durch und spielt die Karte mit dem besten Durchschnitt.

## Tests

```
node test/rules.mjs              # Regeltests
node test/selfplay.mjs stark 20  # Computer gegen Computer
```
