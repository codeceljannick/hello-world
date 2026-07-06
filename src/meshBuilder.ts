import * as THREE from "three";

type Offset = [number, number, number];

const FACES: { dir: Offset; corners: Offset[] }[] = [
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
];

function isOccupied(
  occupancy: Uint8Array,
  n: number,
  x: number,
  y: number,
  z: number,
): boolean {
  if (x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n) return false;
  return occupancy[(y * n + z) * n + x] === 1;
}

export interface RawMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

/** Converts a solid voxel occupancy grid into a watertight, vertex-welded triangle mesh. */
export function buildMeshFromVoxels(occupancy: Uint8Array, resolution: number): RawMesh {
  const n = resolution;
  const step = 2 / n;
  const vertexIndex = new Map<string, number>();
  const positions: number[] = [];
  const indices: number[] = [];

  function getVertex(cx: number, cy: number, cz: number): number {
    const key = `${cx},${cy},${cz}`;
    let idx = vertexIndex.get(key);
    if (idx === undefined) {
      idx = positions.length / 3;
      positions.push(-1 + step * cx, -1 + step * cy, -1 + step * cz);
      vertexIndex.set(key, idx);
    }
    return idx;
  }

  for (let iy = 0; iy < n; iy++) {
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        if (!isOccupied(occupancy, n, ix, iy, iz)) continue;

        for (const face of FACES) {
          const [dx, dy, dz] = face.dir;
          if (isOccupied(occupancy, n, ix + dx, iy + dy, iz + dz)) continue;

          const v = face.corners.map(([a, b, c]) => getVertex(ix + a, iy + b, iz + c));
          indices.push(v[0], v[1], v[2], v[0], v[2], v[3]);
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

/** In-place Laplacian smoothing over the vertex-adjacency graph derived from the triangle indices. */
export function laplacianSmooth(mesh: RawMesh, iterations: number, lambda = 0.5): void {
  const vertexCount = mesh.positions.length / 3;
  const neighbors: Set<number>[] = Array.from({ length: vertexCount }, () => new Set());

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
    neighbors[a].add(b).add(c);
    neighbors[b].add(a).add(c);
    neighbors[c].add(a).add(b);
  }

  let current = mesh.positions;
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Float32Array(current.length);
    for (let v = 0; v < vertexCount; v++) {
      const nbrs = neighbors[v];
      if (nbrs.size === 0) {
        next[v * 3] = current[v * 3];
        next[v * 3 + 1] = current[v * 3 + 1];
        next[v * 3 + 2] = current[v * 3 + 2];
        continue;
      }
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const nb of nbrs) {
        sx += current[nb * 3];
        sy += current[nb * 3 + 1];
        sz += current[nb * 3 + 2];
      }
      const avgX = sx / nbrs.size;
      const avgY = sy / nbrs.size;
      const avgZ = sz / nbrs.size;
      next[v * 3] = current[v * 3] + lambda * (avgX - current[v * 3]);
      next[v * 3 + 1] = current[v * 3 + 1] + lambda * (avgY - current[v * 3 + 1]);
      next[v * 3 + 2] = current[v * 3 + 2] + lambda * (avgZ - current[v * 3 + 2]);
    }
    current = next;
  }

  mesh.positions.set(current);
}

export function toBufferGeometry(mesh: RawMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}
