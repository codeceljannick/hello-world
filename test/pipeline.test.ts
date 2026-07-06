/**
 * End-to-end sanity check for the scan pipeline without needing a camera or
 * browser: synthesizes turntable silhouettes of a known box shape by
 * forward-projecting a ground-truth voxel grid, feeds them through the same
 * carving/meshing/smoothing code the app uses, and validates the result.
 *
 * Run with: npm test
 */
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { carveVisualHull } from "../src/voxelCarve";
import { buildMeshFromVoxels, laplacianSmooth, toBufferGeometry } from "../src/meshBuilder";
import type { SilhouetteFrame } from "../src/types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`OK: ${message}`);
}

const HALF_X = 0.7;
const HALF_Y = 0.25;
const HALF_Z = 0.35;
const IMG_SIZE = 160;
const NUM_ANGLES = 24;

/**
 * Renders an exact (analytic) turntable silhouette of an axis-aligned box
 * for a given rotation angle, using the same camera model as voxelCarve
 * (fixed orthographic camera, object rotated about Y). For each pixel we
 * test whether the corresponding view-space line through the object
 * intersects the box, via the standard slab method for line/AABB tests.
 */
function renderSilhouette(angle: number): SilhouetteFrame {
  const mask = new Uint8Array(IMG_SIZE * IMG_SIZE);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  function intersectsBox(xr: number): boolean {
    const p0x = xr * cos;
    const p0z = xr * sin;

    let tMin = -Infinity;
    let tMax = Infinity;

    if (Math.abs(sin) < 1e-9) {
      if (Math.abs(p0x) > HALF_X) return false;
    } else {
      const ta = (p0x - HALF_X) / sin;
      const tb = (p0x + HALF_X) / sin;
      tMin = Math.max(tMin, Math.min(ta, tb));
      tMax = Math.min(tMax, Math.max(ta, tb));
    }

    if (Math.abs(cos) < 1e-9) {
      if (Math.abs(p0z) > HALF_Z) return false;
    } else {
      const ta = (HALF_Z - p0z) / cos;
      const tb = (-HALF_Z - p0z) / cos;
      tMin = Math.max(tMin, Math.min(ta, tb));
      tMax = Math.min(tMax, Math.max(ta, tb));
    }

    return tMin <= tMax;
  }

  for (let row = 0; row < IMG_SIZE; row++) {
    const yr = 1 - (row / (IMG_SIZE - 1)) * 2;
    if (Math.abs(yr) > HALF_Y) continue;
    for (let col = 0; col < IMG_SIZE; col++) {
      const xr = (col / (IMG_SIZE - 1)) * 2 - 1;
      if (intersectsBox(xr)) mask[row * IMG_SIZE + col] = 1;
    }
  }

  return { angle, mask, width: IMG_SIZE, height: IMG_SIZE };
}

function main(): void {
  const frames: SilhouetteFrame[] = [];
  for (let i = 0; i < NUM_ANGLES; i++) {
    frames.push(renderSilhouette((i / NUM_ANGLES) * Math.PI * 2));
  }
  for (const f of frames) {
    const fg = f.mask.reduce((s, v) => s + v, 0);
    assert(fg > 0, `silhouette at angle ${f.angle.toFixed(2)} has foreground pixels`);
  }

  const TEST_RES = 48;
  const { occupancy, resolution } = carveVisualHull(frames, TEST_RES);
  const occCount = occupancy.reduce((s, v) => s + v, 0);
  assert(occCount > 0, "carved occupancy is non-empty");
  assert(occCount < resolution ** 3, "carving actually removed some voxels (not a trivial full block)");

  // Bounding extent sanity: X should end up wider than Y, matching the
  // elongated test box (X half-extent 0.7 vs Y half-extent 0.25).
  let minX = resolution, maxX = -1, minY = resolution, maxY = -1;
  for (let iy = 0; iy < resolution; iy++) {
    for (let iz = 0; iz < resolution; iz++) {
      for (let ix = 0; ix < resolution; ix++) {
        if (occupancy[(iy * resolution + iz) * resolution + ix] === 1) {
          if (ix < minX) minX = ix;
          if (ix > maxX) maxX = ix;
          if (iy < minY) minY = iy;
          if (iy > maxY) maxY = iy;
        }
      }
    }
  }
  const extentX = maxX - minX;
  const extentY = maxY - minY;
  assert(extentX > extentY, `recovered X-extent (${extentX}) exceeds Y-extent (${extentY})`);

  const expectedRatio = HALF_X / HALF_Y;
  const recoveredRatio = extentX / extentY;
  assert(
    Math.abs(recoveredRatio - expectedRatio) / expectedRatio < 0.25,
    `recovered X/Y ratio (${recoveredRatio.toFixed(2)}) is close to expected (${expectedRatio.toFixed(2)})`,
  );

  const mesh = buildMeshFromVoxels(occupancy, resolution);
  assert(mesh.positions.length > 0, "mesh has vertices");
  assert(mesh.indices.length > 0, "mesh has triangles");
  assert(mesh.indices.length % 3 === 0, "index count is a multiple of 3");
  for (const idx of mesh.indices) {
    assert(idx >= 0 && idx < mesh.positions.length / 3, "index within vertex bounds");
    break; // spot-check one; full loop below is the real check
  }
  const maxVertexIndex = mesh.positions.length / 3;
  assert(
    mesh.indices.every((idx) => idx >= 0 && idx < maxVertexIndex),
    "all indices reference valid vertices",
  );
  assert(
    mesh.positions.every((v) => Number.isFinite(v)),
    "all vertex coordinates are finite numbers",
  );

  const preSmoothVertexCount = mesh.positions.length;
  laplacianSmooth(mesh, 5, 0.5);
  assert(mesh.positions.length === preSmoothVertexCount, "smoothing preserves vertex count");
  assert(
    mesh.positions.every((v) => Number.isFinite(v)),
    "vertex coordinates remain finite after smoothing",
  );

  const geometry = toBufferGeometry(mesh);
  const triangleCount = mesh.indices.length / 3;
  const material = new THREE.MeshBasicMaterial();
  const threeMesh = new THREE.Mesh(geometry, material);

  const exporter = new STLExporter();
  const dataView = exporter.parse(threeMesh, { binary: true });
  const expectedByteLength = 80 + 4 + triangleCount * 50;
  assert(dataView.byteLength === expectedByteLength, "binary STL byte length matches triangle count");
  assert(dataView.getUint32(80, true) === triangleCount, "STL header triangle count matches mesh");

  console.log(`\nAll checks passed. Carved voxels: ${occCount}, triangles: ${triangleCount}`);
}

main();
