export interface CapturedFrame {
  /** Turntable angle in radians at which this frame was captured. */
  angle: number;
  /** Square working-resolution RGBA image data used for segmentation. */
  image: ImageData;
  /** Small JPEG/PNG data URL used for the thumbnail gallery. */
  thumbnail: string;
}

export interface SilhouetteFrame {
  angle: number;
  mask: Uint8Array;
  width: number;
  height: number;
}

export type VoxelResolution = 32 | 48 | 64;

export interface ScanSettings {
  frameCount: number;
  resolution: VoxelResolution;
  threshold: number;
  smoothingIterations: number;
}
