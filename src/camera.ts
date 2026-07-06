export const WORKING_SIZE = 220;

export class CameraController {
  readonly video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private grabCanvas: HTMLCanvasElement;
  private grabCtx: CanvasRenderingContext2D;

  constructor() {
    this.video = document.createElement("video");
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;

    this.grabCanvas = document.createElement("canvas");
    this.grabCanvas.width = WORKING_SIZE;
    this.grabCanvas.height = WORKING_SIZE;
    const ctx = this.grabCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D-Kontext konnte nicht erstellt werden");
    this.grabCtx = ctx;
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Kamerazugriff wird von diesem Browser nicht unterstützt.");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  get isActive(): boolean {
    return this.stream !== null;
  }

  /** Grabs the current video frame, center-cropped to a square, at WORKING_SIZE resolution. */
  grabFrame(): ImageData {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) throw new Error("Videostream noch nicht bereit.");

    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;

    this.grabCtx.drawImage(
      this.video,
      sx,
      sy,
      side,
      side,
      0,
      0,
      WORKING_SIZE,
      WORKING_SIZE,
    );

    return this.grabCtx.getImageData(0, 0, WORKING_SIZE, WORKING_SIZE);
  }

  grabThumbnail(maxSize = 96): string {
    const canvas = document.createElement("canvas");
    canvas.width = maxSize;
    canvas.height = maxSize;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(this.grabCanvas, 0, 0, maxSize, maxSize);
    return canvas.toDataURL("image/jpeg", 0.7);
  }
}
