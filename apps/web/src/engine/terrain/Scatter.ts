import type { HeightSpec } from './HeightSpec'
import { permutationFor, sampleHeight, sampleNormal } from './HeightFieldCpu'
import { gradientNoise2D } from './noise'

/**
 * Placement for scattered props (grass, rocks, palms) over the heightfield.
 *
 * This is decoration, not gameplay — unlike terrain height, it has no CPU/GPU parity
 * requirement, so it can use plain deterministic hashing rather than the shared
 * permutation-table noise. Determinism still matters (a reload should not shuffle the
 * beach), which is why this never touches `Math.random`.
 */

export type ScatterInstance = {
  x: number
  y: number
  z: number
  rotY: number
  scale: number
  /** 0..1, for per-instance tint/height variation — meaning is up to the caller. */
  variant: number
}

/** A cylindrical (Y-axis) collision footprint, ground plane only — the character's
 * kinematic controller only ever needs XZ separation, never full 3D collision. */
export type Collider = { x: number; z: number; radius: number }

/** Instance positions/scales are already exactly what a collider needs; this just picks
 * a radius per instance from its scale so rocks/palms don't have to duplicate the map. */
export function collidersFromInstances(
  instances: ScatterInstance[],
  baseRadius: number,
): Collider[] {
  return instances.map((inst) => ({ x: inst.x, z: inst.z, radius: baseRadius * inst.scale }))
}

type ScatterBand = {
  /** Height above sea level, metres. */
  minAboveSea: number
  maxAboveSea: number
  /** Minimum `normal.y` (1 = flat, 0 = vertical) — excludes cliff faces. */
  minSlope?: number
  /** Maximum slope — set low + a low `minSlope` band to target cliff faces instead. */
  maxSlope?: number
}

export type ScatterOptions = ScatterBand & {
  /** Disk radius from the world origin to scan, metres. */
  radius: number
  /** "Above sea" is measured from this height, not a hardcoded sea level — a ridge
   * scenery has no sea to measure from, but still wants the same elevation/slope
   * banding logic. Coastal callers pass `spec.seaLevelM`; ridge callers pass
   * `spec.valleyFloorM`. */
  referenceHeightM: number
  /** Candidate grid spacing, metres — smaller gives finer clump shapes, costs more CPU. */
  cellSize: number
  /** Instances placed in a fully-accepted cell. */
  maxPerCell: number
  /** Clump-noise frequency, cycles/metre. */
  patchFrequency: number
  /** 0..1: fraction of the clump field that is rejected outright. Higher = sparser. */
  patchThreshold: number
  /** Decorrelates this scatter pass's clump field from others sharing the same spec. */
  seedSalt: number
}

/** xxhash-ish integer mix — cheap, well-distributed, and stable across reloads. */
function hash01(a: number, b: number, salt: number): number {
  let h =
    Math.imul(a | 0, 0x27d4eb2f) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 0xffffffff
}

/**
 * Scatter instances over bands of the heightfield defined by elevation and slope.
 *
 * Two-pass per cell: a cheap centre sample decides whether the cell is in-band and how
 * dense its clump is, and only accepted cells pay for per-instance placement — most of
 * the scan area (open sea, mountainside, steep dune faces) rejects on the first sample.
 */
export function scatterInBand(spec: HeightSpec, opts: ScatterOptions): ScatterInstance[] {
  const instances: ScatterInstance[] = []
  const perm = permutationFor(spec)
  const half = Math.floor(opts.radius / opts.cellSize)
  const minSlope = opts.minSlope ?? 0
  const maxSlope = opts.maxSlope ?? 1

  for (let cz = -half; cz <= half; cz++) {
    for (let cx = -half; cx <= half; cx++) {
      const baseX = cx * opts.cellSize
      const baseZ = cz * opts.cellSize
      if (baseX * baseX + baseZ * baseZ > opts.radius * opts.radius) continue

      const jx = (hash01(cx, cz, spec.seed ^ opts.seedSalt ^ 0x1) - 0.5) * opts.cellSize
      const jz = (hash01(cx, cz, spec.seed ^ opts.seedSalt ^ 0x2) - 0.5) * opts.cellSize
      const sx = baseX + jx
      const sz = baseZ + jz

      const h = sampleHeight(spec, sx, sz)
      const aboveSea = h - opts.referenceHeightM
      if (aboveSea < opts.minAboveSea || aboveSea > opts.maxAboveSea) continue

      const [, ny] = sampleNormal(spec, sx, sz, 1.5)
      if (ny < minSlope || ny > maxSlope) continue

      const patch =
        gradientNoise2D(perm, sx * opts.patchFrequency + 500, sz * opts.patchFrequency - 500) *
          0.5 +
        0.5
      if (patch < opts.patchThreshold) continue
      const density = (patch - opts.patchThreshold) / (1 - opts.patchThreshold)
      const count = Math.max(1, Math.round(density * opts.maxPerCell))

      for (let i = 0; i < count; i++) {
        const bx =
          baseX +
          (hash01(cx * 7 + i, cz * 13 - i, spec.seed ^ opts.seedSalt ^ 0x3) - 0.5) * opts.cellSize
        const bz =
          baseZ +
          (hash01(cx * 11 - i, cz * 17 + i, spec.seed ^ opts.seedSalt ^ 0x4) - 0.5) * opts.cellSize
        const by = sampleHeight(spec, bx, bz)
        const bAboveSea = by - opts.referenceHeightM
        if (bAboveSea < opts.minAboveSea || bAboveSea > opts.maxAboveSea) continue

        instances.push({
          x: bx,
          y: by,
          z: bz,
          rotY: hash01(cx * 3 + i, cz * 5 - i, spec.seed ^ opts.seedSalt ^ 0x5) * Math.PI * 2,
          scale: 0.75 + hash01(cx * 19 - i, cz * 23 + i, spec.seed ^ opts.seedSalt ^ 0x6) * 0.6,
          variant: hash01(cx * 29 + i, cz * 31 - i, spec.seed ^ opts.seedSalt ^ 0x7),
        })
      }
    }
  }

  return instances
}
