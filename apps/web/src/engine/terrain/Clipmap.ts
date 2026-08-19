import * as THREE from 'three/webgpu'

/**
 * Geometry clipmap terrain.
 *
 * Concentric square rings at doubling cell sizes, each snapped to **its own** cell grid
 * so vertices never swim as the camera moves. Chosen over chunked LOD because it gives
 * a *deterministic* triangle count with no quadtree, no per-chunk culling bookkeeping,
 * and no streaming state machine — which matters enormously when the whole point is a
 * fixed frame budget in a background tab.
 *
 * Clipmaps are bad for authored terrain, caves, and overhangs. We have none of those.
 *
 * Geometry: two meshes, not one.
 *   - `rings`  — an InstancedMesh of a square annulus, one instance per level
 *   - `center` — a solid patch filling the innermost hole
 * A single draw call would require per-instance index sets, which no API offers. Two is
 * the honest floor.
 *
 * **Both are `InstancedMesh`, and that is not incidental.** The terrain material derives
 * its world XZ from `positionWorld` inside `positionNode`. An InstancedMesh and a plain
 * Mesh resolve that differently — instance matrix vs object matrix — so a plain-Mesh
 * centre patch was transformed onto a different scale and vanished off-screen, leaving a
 * 32m hole directly under the camera. Keeping both on the identical transform path
 * removes the whole class of bug rather than compensating for it.
 */

export type ClipmapOptions = {
  /** World size of one cell at the finest level, in metres. */
  baseCell: number
  /** Quads per side per level. Must be even. */
  gridSide: number
  /** Number of ring levels. Outer radius = baseCell * gridSide/2 * 2^(levels-1). */
  levels: number
}

export const DEFAULT_CLIPMAP: ClipmapOptions = {
  baseCell: 0.5,
  gridSide: 128,
  // 7 levels = 2 km outer radius. One more than the highest tier uses, so the tier
  // ladder has somewhere to *go* — with levels === the high tier's count, `medium` and
  // `high` would render identical geometry again.
  levels: 7,
}

export class Clipmap {
  readonly group = new THREE.Group()
  readonly rings: THREE.InstancedMesh
  readonly center: THREE.InstancedMesh
  readonly options: ClipmapOptions

  #ringGeometry: THREE.BufferGeometry
  #centerGeometry: THREE.BufferGeometry
  #matrix = new THREE.Matrix4()
  #snapped = new THREE.Vector2(Number.NaN, Number.NaN)

  constructor(material: THREE.Material, options: ClipmapOptions = DEFAULT_CLIPMAP) {
    this.options = options
    const { gridSide, levels } = options

    this.#ringGeometry = buildRingGeometry(gridSide)
    this.#centerGeometry = buildGridGeometry(gridSide / 2, -0.25, 0.25)

    this.rings = new THREE.InstancedMesh(this.#ringGeometry, material, levels)
    this.rings.frustumCulled = false // the clipmap is always centred on the camera
    this.rings.receiveShadow = true

    this.center = new THREE.InstancedMesh(this.#centerGeometry, material, 1)
    this.center.frustumCulled = false
    this.center.receiveShadow = true

    this.group.add(this.rings, this.center)
    this.group.matrixAutoUpdate = false
  }

  /** Outer radius in metres. */
  get radius(): number {
    const { baseCell, gridSide, levels } = this.options
    return baseCell * (gridSide / 2) * 2 ** (levels - 1)
  }

  /** Limit how many ring levels actually draw. Cheap per-tier LOD: no rebuild needed. */
  setVisibleLevels(levels: number): void {
    this.rings.count = Math.max(1, Math.min(levels, this.options.levels))
  }

  get triangleCount(): number {
    const { gridSide, levels } = this.options
    const ringQuads = gridSide * gridSide - (gridSide / 2) * (gridSide / 2)
    const centerQuads = (gridSide / 2) * (gridSide / 2)
    return (ringQuads * levels + centerQuads) * 2
  }

  /**
   * Re-centre on the camera. Each level snaps to a multiple of **twice** its own cell
   * size — snapping to one cell would still let the parity of the grid flip each step,
   * which is visible as a shimmer along ring boundaries.
   */
  update(cameraX: number, cameraZ: number): void {
    const { baseCell, gridSide, levels } = this.options

    const finestSnap = baseCell * 2
    const sx = Math.floor(cameraX / finestSnap) * finestSnap
    const sz = Math.floor(cameraZ / finestSnap) * finestSnap
    if (sx === this.#snapped.x && sz === this.#snapped.y) return
    this.#snapped.set(sx, sz)

    for (let level = 0; level < levels; level++) {
      const cell = baseCell * 2 ** level
      const span = cell * gridSide
      const snap = cell * 2
      const x = Math.floor(cameraX / snap) * snap
      const z = Math.floor(cameraZ / snap) * snap
      this.#matrix.makeScale(span, 1, span)
      this.#matrix.setPosition(x, 0, z)
      this.rings.setMatrixAt(level, this.#matrix)
    }
    this.rings.instanceMatrix.needsUpdate = true

    // Identical convention to the rings: an instance matrix, not an object matrix.
    const centerSpan = baseCell * gridSide
    this.#matrix.makeScale(centerSpan, 1, centerSpan)
    this.#matrix.setPosition(sx, 0, sz)
    this.center.setMatrixAt(0, this.#matrix)
    this.center.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.#ringGeometry.dispose()
    this.#centerGeometry.dispose()
    this.rings.dispose()
    this.center.dispose()
  }
}

/**
 * A flat grid on the XZ plane spanning [min, max]² in unit space, so an instance matrix
 * scales it to world size. Y is left at 0 — displacement happens in the vertex node.
 */
function buildGridGeometry(quads: number, min: number, max: number): THREE.BufferGeometry {
  const verts = quads + 1
  const positions = new Float32Array(verts * verts * 3)
  const uvs = new Float32Array(verts * verts * 2)
  const span = max - min

  for (let j = 0; j < verts; j++) {
    for (let i = 0; i < verts; i++) {
      const k = j * verts + i
      const u = i / quads
      const v = j / quads
      positions[k * 3] = min + u * span
      positions[k * 3 + 1] = 0
      positions[k * 3 + 2] = min + v * span
      uvs[k * 2] = u
      uvs[k * 2 + 1] = v
    }
  }

  const indices: number[] = []
  for (let j = 0; j < quads; j++) {
    for (let i = 0; i < quads; i++) {
      const a = j * verts + i
      const b = a + 1
      const c = a + verts
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/**
 * A square annulus over [-0.5, 0.5]² with the centre removed — the hole is covered by the
 * next finer level (or by the centre patch at level 0).
 *
 * **The hole is one cell smaller than the finer level's extent, on purpose.** Each level
 * snaps to its own 2x-cell grid, so level L and level L-1 can be offset from each other
 * by up to one of L's cells. With a hole sized exactly to the finer level, that offset
 * opens a crack — which reads as a black square flickering around the camera as you
 * walk. Shrinking the hole by a cell guarantees the levels overlap instead.
 *
 * The overlap is free: both levels sample the same height function at the same world
 * position, so the surfaces coincide exactly and the duplicate pixels are identical.
 */
function buildRingGeometry(quads: number): THREE.BufferGeometry {
  const verts = quads + 1
  const positions = new Float32Array(verts * verts * 3)
  const uvs = new Float32Array(verts * verts * 2)

  for (let j = 0; j < verts; j++) {
    for (let i = 0; i < verts; i++) {
      const k = j * verts + i
      const u = i / quads
      const v = j / quads
      positions[k * 3] = u - 0.5
      positions[k * 3 + 1] = 0
      positions[k * 3 + 2] = v - 0.5
      uvs[k * 2] = u
      uvs[k * 2 + 1] = v
    }
  }

  const lo = quads / 4 + 1
  const hi = quads - quads / 4 - 1
  const indices: number[] = []
  for (let j = 0; j < quads; j++) {
    for (let i = 0; i < quads; i++) {
      if (i >= lo && i < hi && j >= lo && j < hi) continue // the hole
      const a = j * verts + i
      const b = a + 1
      const c = a + verts
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}
