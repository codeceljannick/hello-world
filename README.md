# Farmcraft Idle

Ein Farm-Idle-Spiel im Minecraft-Stil, direkt im Browser spielbar — ohne Build-Schritt, ohne Abhängigkeiten.

## Spielprinzip

- **Anbauen:** Pflanze Weizen, Karotten und Kartoffeln auf deinem Acker. Die Pflanzen wachsen mit der Zeit (auch während du weg bist) und werden per Klick geerntet.
- **Tiere halten:** Halte Schafe (Wolle), Kühe (Milch) und Kugelfische, die regelmäßig Produkte abwerfen, die du einsammelst.
- **Währung:** Verkaufe Ernte und Tierprodukte für **Smaragde**. Damit kaufst du neues Saatgut, weitere Ackerfelder und mehr Tiere.
- **Idle:** Der Fortschritt wird per Zeitstempel berechnet — Felder und Ställe entwickeln sich auch weiter, während der Tab geschlossen ist. Der Spielstand wird automatisch in `localStorage` gesichert.

## Starten

Keine Installation nötig — es ist eine reine HTML/CSS/JS-Anwendung:

```bash
python3 -m http.server 8000
# dann im Browser: http://localhost:8000
```

Oder die `index.html` direkt im Browser öffnen.

## Technik

- Reines Vanilla JavaScript (kein Framework, kein Build-Schritt).
- Alle Grafiken (Böden, Pflanzen-Wachstumsstufen, Tiere, Icons) werden zur Laufzeit als Pixel-Art auf `<canvas>` erzeugt (`js/textures.js`) — es werden keine originalen Minecraft-Texturdateien verwendet, sondern eigene, im gleichen blockigen Pixel-Stil gehaltene Grafiken.
- Schriftarten: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) und [VT323](https://fonts.google.com/specimen/VT323) (beide SIL Open Font License), lokal eingebunden unter `fonts/`.
- Spiellogik & Rendering in `js/game.js`, Speicherstand in `localStorage`.

## Projektstruktur

```
index.html        Grundgerüst / DOM-Struktur
style.css         Minecraft-artiges GUI-Styling (Holz-Panele, Hotbar, Pixel-Font)
js/textures.js     Prozeduraler Pixel-Art-Generator (Böden, Pflanzen, Tiere, Icons)
js/game.js         Spielzustand, Wachstum, Wirtschaft, Rendering, Speichern/Laden
fonts/             Lokal eingebundene Pixel-Schriftarten (OFL)
```
