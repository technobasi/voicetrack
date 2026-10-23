# VoiceTrack — Stimmfeminisierung & Echtzeit-Pitch-Monitor

**VoiceTrack** ist eine moderne Progressive Web App (PWA) für das Training der Stimmfeminisierung, inspiriert von **VoiceTools** und speziell optimiert als **Live-Begleiter während Gesprächen in Discord** sowie für das strukturierte tägliche Stimmtraining auf allen Geräten.

## Hauptfunktionen

1. **Live-Pitch-Monitor (Discord-Begleiter)**
   - **Echtzeit-Frequenzverlauf (Canvas)** mit klar gekennzeichneten Bereichen für **Feminin** (`185–255+ Hz`), **Androgyn** (`165–185 Hz`), **Maskulin** (`85–165 Hz`) und deinem **persönlichen Zielkorridor** (inkl. Notenanzeige wie `F3`, `G3`, `A3`).
   - **Intelligente Sprechpausen-Erkennung & Noise-Gate**: Ignoriert Stille, Atemgeräusche und Tastaturklicks. Im **Discord-Smart-Scroll-Modus** pausiert die Zeitachse automatisch, solange du anderen im Sprachkanal zuhörst.
   - **Always-on-Top Mini-Overlay (Picture-in-Picture & Kompakt-Ansicht)**: Öffnet ein schwebendes Mini-Fenster im Vordergrund für Discord oder Spiele.
   - **Sanftes visuelles Feedback**: Dezentes Pulsieren des Rahmens, wenn deine Stimme beim Sprechen längere Zeit unter deinen Zielbereich fällt (ohne störende Warntöne).
   - **Integrierter Simulations-/Demo-Modus**: Teste alle Ansichten jederzeit mit synthetischen Stimmprofilen (*Discord-Talk*, *Feminin*, *Androgyn*, *Maskulin*).

2. **Lese- & Sprechtraining**
   - Phonetisch ausgewogene deutsche Standardtexte (*Der Nordwind und die Sonne*, *Die Regenbogen-Passage*), typische **Discord- & Gaming-Alltagssätze** sowie Resonanz- & Intonationsübungen.
   - Eigene Übungstexte lokal anlegen und verwalten.
   - Synchronisierte **Audio-Aufnahme & Wiedergabe** mit Mitlauf-Cursor auf deinem aufgezeichneten Pitch-Verlauf und automatischem Coaching-Feedback.

3. **Resonanz- & Klangfarben-Analyse (Formanten F1 / F2)**
   - Echtzeit-Obertonspektrum (`0–3.6 kHz`) mit Markierung der Grundfrequenz ($F_0$) sowie der Formanten $F_1$ (Rachenraum) und $F_2$ (Mundraum-Helligkeit).
   - **2D-Zielmatrix (Tonhöhe × Resonanz-Helligkeit)**, um Tonhöhe und helle Klangfarbe gleichzeitig in den Zielquadranten zu steuern.

4. **Zielton- & Tonhalte-Übungen**
   - Warmer Referenzton-Generator (`E3` bis `B3` bzw. `140–265 Hz`) mit drei angenehmen Klangfarben (*Warmer Dreieck-Ton*, *Vokal-Oberton*, *Sanfter Sinus*).
   - Drei geführte Modi: *Zielton treffen & 5s halten*, *Sanfte Stimm-Sirene (Glide)* und *Melodische Satz-Stufen*.

5. **Session-Historie & Geräteübergreifendes Backup**
   - **100 % Datenschutz**: Alle Sprachdaten und Aufnahmen werden ausschließlich lokal in deinem Browser (**IndexedDB**) verarbeitet.
   - Langzeit-Trenddiagramm deiner Durchschnittstonhöhe (`Ø Hz`) und **1-Klick JSON-Backup Export/Import** für den einfachen Wechsel zwischen PC, Laptop, Tablet und Smartphone.

## Starten & Entwickeln

```bash
# Entwicklungsserver starten
npm run dev

# Produktions-Build erstellen
npm run build

# Unit-Tests ausführen
npm test
```
