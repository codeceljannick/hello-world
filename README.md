# 3D Kamera-Scanner

Eine Web-App, mit der man ein Objekt per Kamera aus mehreren Blickwinkeln
fotografiert und daraus ein 3D-Modell rekonstruiert, das als STL-Datei
heruntergeladen werden kann. Alles läuft clientseitig im Browser – es werden
keine Bilder hochgeladen.

## Funktionsweise

Die App nutzt **Shape-from-Silhouette** (Voxel-Carving) auf Basis eines
virtuellen Drehtellers:

1. **Hintergrund aufnehmen** – ein Referenzbild des leeren Untergrunds.
2. **Objekt aufnehmen** – das Objekt wird zwischen Aufnahmen schrittweise
   gedreht (z. B. auf einem Drehteller); pro Aufnahme wird per
   Hintergrund-Subtraktion eine Silhouette des Objekts berechnet.
3. **Voxel-Carving** – aus allen Silhouetten wird ein 3D-Voxelraster
   rekonstruiert (die sichtbare Hülle des Objekts).
4. **Mesh-Erzeugung & Glättung** – das Voxelraster wird in ein
   wasserdichtes Dreiecksnetz umgewandelt und geglättet.
5. **Vorschau & STL-Export** – das Ergebnis wird in 3D angezeigt und kann
   als binäre STL-Datei heruntergeladen werden (z. B. für den 3D-Druck).

Für gute Ergebnisse: einfarbiger, gleichmäßig beleuchteter Untergrund,
Kamera fixiert, Objekt in der Mitte drehen, mindestens 8–24 Aufnahmen
rundherum.

## Entwicklung

```bash
npm install
npm run dev      # Entwicklungsserver
npm run build    # Produktions-Build (dist/)
npm test         # Pipeline-Test (Voxel-Carving/Mesh/STL) ohne Kamera
```

## Tech-Stack

- Vite + TypeScript
- Three.js (3D-Vorschau, `OrbitControls`, `STLExporter`)
- `getUserMedia` für den Kamerazugriff
