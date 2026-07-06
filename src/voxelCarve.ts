import type { SilhouetteFrame } from "./types";

/**
 * Reconstructs a voxel occupancy grid (the visual hull) from a set of
 * turntable silhouettes using shape-from-silhouette / space carving.
 *
 * Camera model: a single fixed orthographic camera looking along -Z, the
 * object rotates about the vertical Y axis between frames. Every frame is
 * recentered on its own silhouette bounding box (so the object does not
 * need to be pixel-perfectly centered in every shot), but all frames share
 * one isotropic pixels-per-world-unit scale, derived from the largest
 * silhouette extent seen across every frame. Calibrating X and Y
 * independently per frame would let each axis stretch to fill the voxel
 * cube on its own, warping the aspect ratio of anything that isn't
 * roughly cubic (e.g. a flat or elongated object) — a single shared scale
 * keeps proportions faithful to the real object.
 *
 * Returns a Uint8Array of length resolution^3 (1 = occupied), indexed as
 * `((y * resolution) + z) * resolution + x`.
 */
export interface CarveResult {
  occupancy: Uint8Array;
  resolution: number;
}

const BBOX_MARGIN = 0.06;

export function carveVisualHull(
  frames: SilhouetteFrame[],
  resolution: number,
): CarveResult {
  const n = resolution;
  const occupancy = new Uint8Array(n * n * n).fill(1);

  interface Calibrated {
    cos: number;
    sin: number;
    mask: Uint8Array;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  }

  const bboxes: { angle: number; mask: Uint8Array; width: number; height: number; box: NonNullable<ReturnType<typeof tightBoundingBox>> }[] = [];
  for (const frame of frames) {
    const box = tightBoundingBox(frame.mask, frame.width, frame.height);
    if (!box) continue;
    bboxes.push({ angle: frame.angle, mask: frame.mask, width: frame.width, height: frame.height, box });
  }

  if (bboxes.length === 0) {
    return { occupancy, resolution };
  }

  let globalExtent = 0;
  for (const { box } of bboxes) {
    const paddedWidth = (box.maxX - box.minX) * (1 + 2 * BBOX_MARGIN);
    const paddedHeight = (box.maxY - box.minY) * (1 + 2 * BBOX_MARGIN);
    globalExtent = Math.max(globalExtent, paddedWidth, paddedHeight);
  }
  const halfScale = globalExtent / 2;

  const calibrated: Calibrated[] = bboxes.map(({ angle, mask, width, height, box }) => ({
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    mask,
    width,
    height,
    centerX: (box.minX + box.maxX) / 2,
    centerY: (box.minY + box.maxY) / 2,
  }));

  const step = 2 / n;
  for (let iy = 0; iy < n; iy++) {
    const y = -1 + step * (iy + 0.5);
    for (let iz = 0; iz < n; iz++) {
      const z = -1 + step * (iz + 0.5);
      for (let ix = 0; ix < n; ix++) {
        const x = -1 + step * (ix + 0.5);
        const idx = (iy * n + iz) * n + ix;
        if (occupancy[idx] === 0) continue;

        let occupied = 1;
        for (const view of calibrated) {
          const xr = x * view.cos + z * view.sin;
          const yr = y;

          const col = Math.round(view.centerX + xr * halfScale);
          const row = Math.round(view.centerY - yr * halfScale);

          if (col < 0 || col >= view.width || row < 0 || row >= view.height) {
            occupied = 0;
            break;
          }
          if (view.mask[row * view.width + col] === 0) {
            occupied = 0;
            break;
          }
        }
        occupancy[idx] = occupied;
      }
    }
  }

  return { occupancy, resolution };
}

function tightBoundingBox(
  mask: Uint8Array,
  width: number,
  height: number,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX >= 0 ? { minX, maxX, minY, maxY } : null;
}
