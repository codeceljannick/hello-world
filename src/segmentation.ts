/**
 * Background-subtraction based silhouette segmentation.
 * A reference frame of the empty turntable is compared against each
 * captured frame; pixels that differ enough from the background are
 * considered part of the scanned object.
 */

export function diffMask(
  background: ImageData,
  frame: ImageData,
  threshold: number,
): Uint8Array {
  const { width, height, data: bg } = background;
  const fg = frame.data;
  const mask = new Uint8Array(width * height);
  const thresholdSq = threshold * threshold;

  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    const dr = bg[i] - fg[i];
    const dg = bg[i + 1] - fg[i + 1];
    const db = bg[i + 2] - fg[i + 2];
    const distSq = dr * dr + dg * dg + db * db;
    mask[p] = distSq > thresholdSq ? 1 : 0;
  }
  return mask;
}

/** Keeps only the largest 4-connected component of `1`s, discarding speckle noise. */
export function keepLargestComponent(
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const labels = new Int32Array(mask.length).fill(-1);
  const componentSizes: number[] = [];
  const queue = new Int32Array(mask.length);

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1 || labels[start] !== -1) continue;

    const label = componentSizes.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    let size = 0;

    while (head < tail) {
      const p = queue[head++];
      size++;
      const x = p % width;
      const y = (p / width) | 0;

      const neighbors = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && mask[n] === 1 && labels[n] === -1) {
          labels[n] = label;
          queue[tail++] = n;
        }
      }
    }
    componentSizes.push(size);
  }

  if (componentSizes.length === 0) return new Uint8Array(mask.length);

  let bestLabel = 0;
  for (let i = 1; i < componentSizes.length; i++) {
    if (componentSizes[i] > componentSizes[bestLabel]) bestLabel = i;
  }

  const result = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p++) {
    result[p] = labels[p] === bestLabel ? 1 : 0;
  }
  return result;
}

/** Flood-fills background from the image border and marks unreached `0` pixels as foreground holes. */
export function fillHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  const reached = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;

  const trySeed = (p: number) => {
    if (mask[p] === 0 && reached[p] === 0) {
      reached[p] = 1;
      queue[tail++] = p;
    }
  };

  for (let x = 0; x < width; x++) {
    trySeed(x);
    trySeed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    trySeed(y * width);
    trySeed(y * width + width - 1);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = (p / width) | 0;
    const neighbors = [
      x > 0 ? p - 1 : -1,
      x < width - 1 ? p + 1 : -1,
      y > 0 ? p - width : -1,
      y < height - 1 ? p + width : -1,
    ];
    for (const n of neighbors) {
      if (n >= 0) trySeed(n);
    }
  }

  const result = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p++) {
    result[p] = mask[p] === 1 || reached[p] === 0 ? 1 : 0;
  }
  return result;
}

export interface SilhouetteResult {
  mask: Uint8Array;
  width: number;
  height: number;
  /** Tight bounding box of the foreground, in pixel coordinates. */
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null;
  foregroundRatio: number;
}

export function computeSilhouette(
  background: ImageData,
  frame: ImageData,
  threshold: number,
): SilhouetteResult {
  const { width, height } = frame;
  let mask = diffMask(background, frame, threshold);
  mask = keepLargestComponent(mask, width, height);
  mask = fillHoles(mask, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return {
    mask,
    width,
    height,
    bbox: count > 0 ? { minX, minY, maxX, maxY } : null,
    foregroundRatio: count / (width * height),
  };
}
