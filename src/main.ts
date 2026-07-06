import "./style.css";
import { CameraController } from "./camera";
import { computeSilhouette } from "./segmentation";
import { carveVisualHull } from "./voxelCarve";
import { buildMeshFromVoxels, laplacianSmooth, toBufferGeometry, type RawMesh } from "./meshBuilder";
import { Viewer } from "./viewer";
import type { CapturedFrame, SilhouetteFrame, VoxelResolution } from "./types";

type Phase = "setup" | "background" | "objects" | "processing" | "result";

const MIN_FRAMES = 8;

class ScanApp {
  private phase: Phase = "setup";
  private camera = new CameraController();
  private viewer: Viewer | null = null;

  private frameCount = 24;
  private resolution: VoxelResolution = 48;
  private threshold = 45;
  private smoothingIterations = 5;

  private backgroundFrame: ImageData | null = null;
  private capturedFrames: CapturedFrame[] = [];
  private showMaskPreview = false;
  private maskPreviewHandle = 0;

  private stepsEl: HTMLElement;
  private panel: HTMLElement;
  private statusEl: HTMLElement;

  constructor(root: HTMLElement) {
    const header = document.createElement("header");
    header.innerHTML = `
      <h1>3D Kamera-Scanner</h1>
      <p>Scanne ein Objekt mit deiner Kamera und lade das Ergebnis als STL-Datei herunter.
      Verfahren: Silhouetten-basierte 3D-Rekonstruktion (Shape-from-Silhouette) auf einem virtuellen Drehteller.</p>
    `;

    this.stepsEl = document.createElement("div");
    this.stepsEl.className = "steps";

    this.panel = document.createElement("section");
    this.panel.className = "panel";

    this.statusEl = document.createElement("div");
    this.statusEl.className = "status-line";

    const footer = document.createElement("footer");
    footer.textContent = "Läuft vollständig lokal im Browser – es werden keine Bilder hochgeladen.";

    root.append(header, this.stepsEl, this.panel, this.statusEl, footer);

    this.renderSteps();
    this.renderSetup();
  }

  private setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle("error", isError);
  }

  private renderSteps(): void {
    const steps: { key: Phase[]; label: string }[] = [
      { key: ["setup"], label: "1. Einstellungen" },
      { key: ["background"], label: "2. Hintergrund" },
      { key: ["objects"], label: "3. Aufnahme" },
      { key: ["processing"], label: "4. Rekonstruktion" },
      { key: ["result"], label: "5. Ergebnis" },
    ];
    const order: Phase[] = ["setup", "background", "objects", "processing", "result"];
    const currentIdx = order.indexOf(this.phase);

    this.stepsEl.innerHTML = "";
    steps.forEach((step, idx) => {
      const pill = document.createElement("span");
      pill.className = "step-pill";
      if (idx === currentIdx) pill.classList.add("active");
      else if (idx < currentIdx) pill.classList.add("done");
      pill.textContent = step.label;
      this.stepsEl.appendChild(pill);
    });
  }

  private goto(phase: Phase): void {
    this.phase = phase;
    this.renderSteps();
    switch (phase) {
      case "setup":
        this.renderSetup();
        break;
      case "background":
        this.renderBackground();
        break;
      case "objects":
        this.renderObjects();
        break;
      case "processing":
        this.renderProcessing();
        break;
      case "result":
        this.renderResult();
        break;
    }
  }

  // ---------------------------------------------------------------- setup

  private renderSetup(): void {
    this.panel.innerHTML = `
      <h2>Scan vorbereiten</h2>
      <p class="hint">
        Lege das Objekt auf einen möglichst einfarbigen, gleichmäßig beleuchteten Untergrund
        (idealerweise auf einen Drehteller). Du fotografierst das Objekt gleich in mehreren
        Schritten aus derselben Kameraposition, während es sich dreht.
      </p>
      <div class="controls-row">
        <label class="field">
          Anzahl Aufnahmen
          <input type="number" id="opt-frames" min="${MIN_FRAMES}" max="60" value="${this.frameCount}" />
        </label>
        <label class="field">
          Detailgrad
          <select id="opt-resolution">
            <option value="32">Niedrig (schnell)</option>
            <option value="48" selected>Mittel</option>
            <option value="64">Hoch (langsamer)</option>
          </select>
        </label>
      </div>
      <div class="controls-row">
        <button class="primary" id="btn-start-camera">Kamera starten</button>
      </div>
    `;

    const framesInput = this.panel.querySelector<HTMLInputElement>("#opt-frames")!;
    framesInput.addEventListener("change", () => {
      const v = Math.round(Number(framesInput.value));
      this.frameCount = Math.min(60, Math.max(MIN_FRAMES, isNaN(v) ? this.frameCount : v));
      framesInput.value = String(this.frameCount);
    });

    const resSelect = this.panel.querySelector<HTMLSelectElement>("#opt-resolution")!;
    resSelect.value = String(this.resolution);
    resSelect.addEventListener("change", () => {
      this.resolution = Number(resSelect.value) as VoxelResolution;
    });

    this.panel.querySelector<HTMLButtonElement>("#btn-start-camera")!.addEventListener(
      "click",
      () => void this.startCamera(),
    );
  }

  private async startCamera(): Promise<void> {
    this.setStatus("Fordere Kamerazugriff an...");
    try {
      await this.camera.start();
      this.setStatus("");
      this.goto("background");
    } catch (err) {
      this.setStatus(
        err instanceof Error ? err.message : "Kamera konnte nicht gestartet werden.",
        true,
      );
    }
  }

  // ----------------------------------------------------------- background

  private renderBackground(): void {
    this.panel.innerHTML = `
      <h2>Hintergrund aufnehmen</h2>
      <p class="hint">
        Entferne das Objekt aus dem Bild und fotografiere den leeren Untergrund.
        Daraus erkennt die App später, welche Pixel zum Objekt gehören.
      </p>
      <div class="video-wrap"><div class="overlay-ring"></div></div>
      <div class="controls-row">
        <button class="primary" id="btn-capture-bg">Hintergrund aufnehmen</button>
        <button id="btn-cancel-bg">Abbrechen</button>
      </div>
    `;
    this.panel.querySelector(".video-wrap")!.prepend(this.camera.video);

    this.panel.querySelector<HTMLButtonElement>("#btn-capture-bg")!.addEventListener("click", () => {
      try {
        this.backgroundFrame = this.camera.grabFrame();
        this.capturedFrames = [];
        this.setStatus("");
        this.goto("objects");
      } catch (err) {
        this.setStatus(err instanceof Error ? err.message : String(err), true);
      }
    });

    this.panel.querySelector<HTMLButtonElement>("#btn-cancel-bg")!.addEventListener("click", () => {
      this.resetAll();
    });
  }

  // --------------------------------------------------------------- objects

  private renderObjects(): void {
    const angleStep = (2 * Math.PI) / this.frameCount;
    const angleDeg = Math.round((angleStep * 180) / Math.PI);

    this.panel.innerHTML = `
      <h2>Objekt aufnehmen</h2>
      <p class="hint">
        Stelle das Objekt auf denselben Untergrund. Drehe es nach jeder Aufnahme um ca.
        <strong>${angleDeg}°</strong> (z. B. mit einem Drehteller) und klicke erneut auf
        „Foto aufnehmen“. ${MIN_FRAMES}–${this.frameCount} Aufnahmen rundherum ergeben das beste Ergebnis.
      </p>
      <div class="video-wrap"><div class="overlay-ring"></div></div>
      <div class="controls-row">
        <label class="field">
          Empfindlichkeit (Freistellung)
          <input type="range" id="opt-threshold" min="10" max="120" value="${this.threshold}" />
        </label>
        <label class="field" style="flex-direction:row;align-items:center;gap:6px;">
          <input type="checkbox" id="opt-show-mask" ${this.showMaskPreview ? "checked" : ""} />
          Maske anzeigen
        </label>
      </div>
      <div class="progress-bar"><div style="width:${(this.capturedFrames.length / this.frameCount) * 100}%"></div></div>
      <div class="controls-row">
        <button class="primary" id="btn-capture-frame">Foto aufnehmen (${this.capturedFrames.length}/${this.frameCount})</button>
        <button id="btn-undo-frame" ${this.capturedFrames.length === 0 ? "disabled" : ""}>Letztes Bild löschen</button>
        <button class="primary" id="btn-reconstruct" ${this.capturedFrames.length < MIN_FRAMES ? "disabled" : ""}>
          Rekonstruktion starten
        </button>
      </div>
      <div class="frame-grid" id="frame-grid"></div>
    `;

    const videoWrap = this.panel.querySelector(".video-wrap")!;
    videoWrap.prepend(this.camera.video);
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = 220;
    maskCanvas.height = 220;
    videoWrap.appendChild(maskCanvas);

    this.renderFrameGrid();

    const thresholdInput = this.panel.querySelector<HTMLInputElement>("#opt-threshold")!;
    thresholdInput.addEventListener("input", () => {
      this.threshold = Number(thresholdInput.value);
    });

    const showMaskInput = this.panel.querySelector<HTMLInputElement>("#opt-show-mask")!;
    showMaskInput.addEventListener("change", () => {
      this.showMaskPreview = showMaskInput.checked;
    });

    this.startMaskPreviewLoop(maskCanvas);

    this.panel.querySelector<HTMLButtonElement>("#btn-capture-frame")!.addEventListener("click", () => {
      this.captureObjectFrame();
    });
    this.panel.querySelector<HTMLButtonElement>("#btn-undo-frame")!.addEventListener("click", () => {
      this.capturedFrames.pop();
      this.renderObjects();
    });
    this.panel.querySelector<HTMLButtonElement>("#btn-reconstruct")!.addEventListener("click", () => {
      this.goto("processing");
      void this.runReconstruction();
    });
  }

  private renderFrameGrid(): void {
    const grid = this.panel.querySelector<HTMLElement>("#frame-grid");
    if (!grid) return;
    grid.innerHTML = "";
    this.capturedFrames.forEach((frame, idx) => {
      const thumb = document.createElement("div");
      thumb.className = "thumb";
      thumb.innerHTML = `<img src="${frame.thumbnail}" /><span class="idx">${idx + 1}</span>`;
      grid.appendChild(thumb);
    });
  }

  private captureObjectFrame(): void {
    if (this.capturedFrames.length >= this.frameCount) return;
    try {
      const angle = this.capturedFrames.length * ((2 * Math.PI) / this.frameCount);
      const image = this.camera.grabFrame();
      const thumbnail = this.camera.grabThumbnail();
      this.capturedFrames.push({ angle, image, thumbnail });
      this.setStatus("");
      this.renderObjects();
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : String(err), true);
    }
  }

  private startMaskPreviewLoop(canvas: HTMLCanvasElement): void {
    cancelAnimationFrame(this.maskPreviewHandle);
    const ctx = canvas.getContext("2d")!;
    let lastRun = 0;

    const loop = (time: number) => {
      if (this.phase !== "objects") return;
      this.maskPreviewHandle = requestAnimationFrame(loop);

      if (!this.showMaskPreview || !this.backgroundFrame) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      if (time - lastRun < 120) return;
      lastRun = time;

      try {
        const frame = this.camera.grabFrame();
        const silhouette = computeSilhouette(this.backgroundFrame, frame, this.threshold);
        const overlay = ctx.createImageData(silhouette.width, silhouette.height);
        for (let p = 0; p < silhouette.mask.length; p++) {
          const on = silhouette.mask[p] === 1;
          overlay.data[p * 4] = 79;
          overlay.data[p * 4 + 1] = 140;
          overlay.data[p * 4 + 2] = 255;
          overlay.data[p * 4 + 3] = on ? 140 : 0;
        }
        ctx.putImageData(overlay, 0, 0);
      } catch {
        // video not ready yet, skip this tick
      }
    };
    this.maskPreviewHandle = requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ processing

  private renderProcessing(): void {
    this.panel.innerHTML = `
      <h2>Rekonstruiere 3D-Modell...</h2>
      <p class="hint" id="processing-text">Segmentiere Aufnahmen...</p>
      <div class="progress-bar"><div id="processing-bar" style="width:10%"></div></div>
    `;
  }

  private setProcessingText(text: string, percent: number): void {
    const el = this.panel.querySelector<HTMLElement>("#processing-text");
    const bar = this.panel.querySelector<HTMLElement>("#processing-bar");
    if (el) el.textContent = text;
    if (bar) bar.style.width = `${percent}%`;
  }

  private async yieldToPaint(): Promise<void> {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  private async runReconstruction(): Promise<void> {
    if (!this.backgroundFrame) {
      this.goto("background");
      return;
    }

    this.setProcessingText("Segmentiere Aufnahmen...", 10);
    await this.yieldToPaint();

    const silhouettes: SilhouetteFrame[] = [];
    let degenerate = 0;
    for (const frame of this.capturedFrames) {
      const result = computeSilhouette(this.backgroundFrame, frame.image, this.threshold);
      if (!result.bbox || result.foregroundRatio < 0.01 || result.foregroundRatio > 0.85) {
        degenerate++;
        continue;
      }
      silhouettes.push({ angle: frame.angle, mask: result.mask, width: result.width, height: result.height });
    }

    if (silhouettes.length < MIN_FRAMES) {
      this.setStatus(
        `Zu wenige verwertbare Aufnahmen (${silhouettes.length}). Passe die Empfindlichkeit an oder nimm mehr Fotos auf.`,
        true,
      );
      this.goto("objects");
      return;
    }

    this.setProcessingText("Führe Voxel-Carving durch (Shape-from-Silhouette)...", 40);
    await this.yieldToPaint();
    const { occupancy, resolution } = carveVisualHull(silhouettes, this.resolution);

    const occupiedCount = occupancy.reduce((sum, v) => sum + v, 0);
    if (occupiedCount === 0) {
      this.setStatus(
        "Es konnte kein Objekt rekonstruiert werden. Bitte Empfindlichkeit anpassen und erneut versuchen.",
        true,
      );
      this.goto("objects");
      return;
    }

    this.setProcessingText("Erzeuge Oberflächen-Mesh...", 70);
    await this.yieldToPaint();
    const mesh: RawMesh = buildMeshFromVoxels(occupancy, resolution);

    this.setProcessingText("Glätte Oberfläche...", 85);
    await this.yieldToPaint();
    laplacianSmooth(mesh, this.smoothingIterations, 0.5);

    this.setProcessingText("Rendere Vorschau...", 100);
    await this.yieldToPaint();
    const geometry = toBufferGeometry(mesh);

    if (degenerate > 0) {
      this.setStatus(`Hinweis: ${degenerate} Aufnahme(n) konnten nicht ausgewertet werden und wurden übersprungen.`);
    } else {
      this.setStatus("");
    }

    this.goto("result");
    this.viewer?.setGeometry(geometry);
  }

  // ----------------------------------------------------------------- result

  private renderResult(): void {
    this.panel.innerHTML = `
      <h2>Fertig!</h2>
      <p class="hint">Drehe das Modell mit der Maus, um es zu prüfen. Passt das Ergebnis nicht,
      kannst du zur Aufnahme zurückkehren oder einen neuen Scan starten.</p>
      <div class="viewer-wrap" id="viewer-container"></div>
      <div class="controls-row">
        <button class="primary" id="btn-download">STL herunterladen</button>
        <button id="btn-back">Zurück zur Aufnahme</button>
        <button class="danger" id="btn-reset">Neuer Scan</button>
      </div>
    `;

    const container = this.panel.querySelector<HTMLElement>("#viewer-container")!;
    this.viewer?.dispose();
    this.viewer = new Viewer(container);

    this.panel.querySelector<HTMLButtonElement>("#btn-download")!.addEventListener("click", () => {
      try {
        this.viewer!.exportSTL(`scan-${Date.now()}.stl`);
      } catch (err) {
        this.setStatus(err instanceof Error ? err.message : String(err), true);
      }
    });
    this.panel.querySelector<HTMLButtonElement>("#btn-back")!.addEventListener("click", () => {
      this.goto("objects");
    });
    this.panel.querySelector<HTMLButtonElement>("#btn-reset")!.addEventListener("click", () => {
      this.resetAll();
    });
  }

  // ------------------------------------------------------------------ misc

  private resetAll(): void {
    cancelAnimationFrame(this.maskPreviewHandle);
    this.camera.stop();
    this.viewer?.dispose();
    this.viewer = null;
    this.backgroundFrame = null;
    this.capturedFrames = [];
    this.camera = new CameraController();
    this.setStatus("");
    this.goto("setup");
  }
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Root-Element #app nicht gefunden.");
new ScanApp(root);
