import type { CoastalTerrainSpec, HeightSpec, RidgeTerrainSpec } from './HeightSpec'
import { buildPermutation, gradientNoise2D } from './noise'

/**
 * The CPU evaluator — authoritative for ALL gameplay: character grounding,
 * camera-arm collision, prop placement, buoyancy, footstep audio.
 *
 * Cost is ~5 octaves of 2D gradient noise, roughly 300-600ns. The local player needs
 * about 5 samples per frame (foot + 4 slope probes) = ~3us. That is nothing, and it
 * is why GPU readback is not needed anywhere in the collision path.
 */

const permCache = new WeakMap<HeightSpec, Uint8Array>()

export function permutationFor(spec: HeightSpec): Uint8Array {
  let perm = permCache.get(spec)
  if (!perm) {
    perm = buildPermutation(spec.seed)
    permCache.set(spec, perm)
  }
  return perm
}

function rawOctaveSum(spec: HeightSpec, perm: Uint8Array, x: number, z: number): number {
  let h = 0
  for (const octave of spec.octaves) {
    const n = gradientNoise2D(perm, x * octave.frequency, z * octave.frequency)
    h += (octave.ridged ? 1 - Math.abs(n) : n) * octave.amplitude
  }
  return h
}

/** Radial island mask: 1 inside the island, easing to 0 across the falloff band. */
export function islandMask(spec: CoastalTerrainSpec, x: number, z: number): number {
  const d = Math.sqrt(x * x + z * z)
  const t = (d - spec.islandRadiusM) / spec.islandFalloffM
  const c = t < 0 ? 0 : t > 1 ? 1 : t
  // smoothstep
  return 1 - c * c * (3 - 2 * c)
}

/** Radial valley mask: 0 at the centre (flat valley floor), easing to 1 across the
 * falloff band (full ridged relief). The inverse shape of `islandMask` — there, the
 * mask protects the *inside*; here, it protects the *outside* from the raw noise. */
export function valleyMask(spec: RidgeTerrainSpec, x: number, z: number): number {
  const d = Math.sqrt(x * x + z * z)
  const t = (d - spec.valleyRadiusM) / spec.valleyFalloffM
  const c = t < 0 ? 0 : t > 1 ? 1 : t
  return c * c * (3 - 2 * c)
}

function sampleCoastalHeight(
  spec: CoastalTerrainSpec,
  perm: Uint8Array,
  x: number,
  z: number,
): number {
  let h = rawOctaveSum(spec, perm, x, z)

  // Blend toward the sea floor, not toward zero — see `seaFloorM`.
  const mask = islandMask(spec, x, z)
  h = spec.seaFloorM + (h - spec.seaFloorM) * mask

  // Flatten toward sea level so the shoreline is a walkable beach, not a cliff.
  // The weight peaks at the waterline and falls off over ~1 heightScale/4.
  if (spec.beachFlatten > 0) {
    const above = (h - spec.seaLevelM) / spec.beachBandM
    const nearness = Math.exp(-above * above)
    h = h * (1 - spec.beachFlatten * nearness) + spec.seaLevelM * spec.beachFlatten * nearness
  }

  return h
}

function sampleRidgeHeight(spec: RidgeTerrainSpec, perm: Uint8Array, x: number, z: number): number {
  const h = rawOctaveSum(spec, perm, x, z)
  const mask = valleyMask(spec, x, z)
  // Ease from the flat valley floor (mask=0) up to the full noise composite (mask=1) —
  // same shape as the coastal blend, just protecting the walkable centre instead of an
  // island's interior.
  return spec.valleyFloorM + (h - spec.valleyFloorM) * mask
}

/**
 * Terrain height in metres at world (x, z).
 *
 * MUST stay in lockstep with `buildHeightNode`. `goldenHeightCheck` is the guard.
 */
export function sampleHeight(spec: HeightSpec, x: number, z: number): number {
  const perm = permutationFor(spec)
  return spec.kind === 'coastal'
    ? sampleCoastalHeight(spec, perm, x, z)
    : sampleRidgeHeight(spec, perm, x, z)
}

/**
 * Surface normal via central differences. `eps` defaults to 0.5m, matching the
 * clipmap's base cell — smaller values just sample noise detail the mesh cannot show.
 */
export function sampleNormal(
  spec: HeightSpec,
  x: number,
  z: number,
  eps = 0.5,
): [number, number, number] {
  const hL = sampleHeight(spec, x - eps, z)
  const hR = sampleHeight(spec, x + eps, z)
  const hD = sampleHeight(spec, x, z - eps)
  const hU = sampleHeight(spec, x, z + eps)

  const nx = hL - hR
  const ny = 2 * eps
  const nz = hD - hU
  const len = Math.hypot(nx, ny, nz)
  return [nx / len, ny / len, nz / len]
}

/**
 * Find a spawn point on the beach, looking out to sea.
 *
 * The scenery spec describes terrain by *parameters*, not by authored geography, so
 * nobody knows where the shoreline actually is until the noise is evaluated. Hardcoding
 * a camera position means re-guessing it every time a parameter changes — and every
 * guess so far has put the camera in open water.
 *
 * Walks rays outward from the origin, finds the outermost crossing of `targetHeight`,
 * and keeps the candidate whose ground is flattest (a spawn on a cliff edge is a bad
 * first impression). Yaw faces away from the island centre, i.e. out to sea.
 */
export function findBeachSpawn(
  spec: CoastalTerrainSpec,
  opts: { setbackM?: number; rays?: number; step?: number } = {},
): { x: number; z: number; y: number; yaw: number } {
  // Find the WATERLINE (height crossing sea level), then step back inland by a fixed
  // distance. Targeting a height contour instead does not work here: `beachFlatten`
  // deliberately makes a broad, near-level beach, so even a 0.35m contour can sit tens
  // of metres from the water and the shot ends up with no sea in it at all.
  const setback = opts.setbackM ?? 3.5
  const rays = opts.rays ?? 96
  const step = opts.step ?? 1

  let best = { x: 0, z: 0, y: 0, yaw: 0, flatness: -Infinity }

  for (let r = 0; r < rays; r++) {
    const angle = (r / rays) * Math.PI * 2
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)

    // Walk inward from beyond the falloff so we find the OUTERMOST crossing — the
    // seaward beach, not an inland pond.
    const maxR = spec.islandRadiusM + spec.islandFalloffM
    let previous = sampleHeight(spec, dx * maxR, dz * maxR)

    for (let d = maxR - step; d > 20; d -= step) {
      const h = sampleHeight(spec, dx * d, dz * d)
      if (previous < spec.seaLevelM && h >= spec.seaLevelM) {
        // `d` is the waterline; sit `setback` metres inland of it.
        const sd = d - setback
        const sx = dx * sd
        const sz = dz * sd
        const sy = sampleHeight(spec, sx, sz)
        const [, ny] = sampleNormal(spec, sx, sz, 2)
        // Prefer flat ground, and reject anywhere the setback lands in a dip that would
        // put the seat below the waterline.
        if (sy > spec.seaLevelM && ny > best.flatness) {
          // Face DOWNHILL, not radially outward. The radial direction from the island
          // centre is only an approximation of "seaward"; where the coast curves, it
          // can point tens of degrees off and the sea ends up beside you instead of in
          // front. The height gradient is the true local shoreline normal.
          const e = 3
          const gx = sampleHeight(spec, sx + e, sz) - sampleHeight(spec, sx - e, sz)
          const gz = sampleHeight(spec, sx, sz + e) - sampleHeight(spec, sx, sz - e)
          const gl = Math.hypot(gx, gz)
          let faceX = dx
          let faceZ = dz
          if (gl > 1e-4) {
            const downX = -gx / gl
            const downZ = -gz / gl
            // Only trust downhill when it broadly agrees with "away from the island".
            // Downhill alone can point into a bay or lagoon, aiming the figure back at
            // land across the water — technically the local shoreline normal, but not
            // the open sea. Blend the two and keep the radial as the sanity check.
            if (downX * dx + downZ * dz > 0.35) {
              faceX = downX * 0.55 + dx * 0.45
              faceZ = downZ * 0.55 + dz * 0.45
              const fl = Math.hypot(faceX, faceZ) || 1
              faceX /= fl
              faceZ /= fl
            }
          }
          best = { x: sx, z: sz, y: sy, yaw: Math.atan2(faceX, faceZ), flatness: ny }
        }
        break
      }
      previous = h
    }
  }

  return { x: best.x, z: best.z, y: best.y, yaw: best.yaw }
}

/**
 * Find a flat spot within a ring around an arbitrary point — the same "scan
 * candidates, score by flatness, keep the best" shape `findBeachSpawn`/
 * `findRidgeSpawn` use, but searching outward from *a given point* (e.g. the
 * scenery's own spawn) instead of the world origin, for placing something that
 * should sit a short, consistent walk from wherever the player starts (the
 * target-practice cluster) rather than at *the* one best point on the whole map.
 *
 * `sy < 0` is rejected as a cheap, scenery-kind-agnostic "avoid the sea" check —
 * every `HeightSpec`'s reference level (`seaLevelM`/`valleyFloorM`) is at or above 0,
 * so this excludes open water on a coastal scenery without needing to know which
 * kind of terrain this is, and does nothing on a ridge scenery (nothing there is
 * ever below 0 to begin with).
 */
export function findFlatSpotNear(
  spec: HeightSpec,
  originX: number,
  originZ: number,
  opts: { minDistM?: number; maxDistM?: number; rays?: number; rings?: number } = {},
): { x: number; z: number; y: number } {
  const minDist = opts.minDistM ?? 6
  const maxDist = opts.maxDistM ?? 10
  const rays = opts.rays ?? 24
  const rings = opts.rings ?? 3

  let best = {
    x: originX,
    z: originZ,
    y: sampleHeight(spec, originX, originZ),
    flatness: -Infinity,
  }

  for (let ring = 0; ring < rings; ring++) {
    const d = minDist + ((maxDist - minDist) * ring) / Math.max(1, rings - 1)
    for (let r = 0; r < rays; r++) {
      const angle = (r / rays) * Math.PI * 2
      const sx = originX + Math.cos(angle) * d
      const sz = originZ + Math.sin(angle) * d
      const sy = sampleHeight(spec, sx, sz)
      if (sy < 0) continue
      const [, ny] = sampleNormal(spec, sx, sz, 1.5)
      if (ny > best.flatness) {
        best = { x: sx, z: sz, y: sy, flatness: ny }
      }
    }
  }

  return { x: best.x, z: best.z, y: best.y }
}

/**
 * Find a spawn point in the valley, facing the peaks.
 *
 * Same reasoning as `findBeachSpawn` — parametric terrain, no authored geography — but
 * there is no waterline to anchor to. Instead: search a ring of candidate radii inside
 * the flattened valley floor and keep the flattest point found, facing uphill toward
 * whichever direction rises fastest (the peaks are the view, not something to spawn
 * with your back to).
 */
export function findRidgeSpawn(
  spec: RidgeTerrainSpec,
  opts: { rays?: number; radii?: number[] } = {},
): { x: number; z: number; y: number; yaw: number } {
  const rays = opts.rays ?? 96
  // Deliberately NOT inside `valleyRadiusM` — the flat floor is exactly flat
  // (`valleyMask` is 0 throughout it), so the height gradient there is exactly zero and
  // every candidate ties on "flatness," with no facing direction worth having. The
  // band immediately past the edge (out to ~1.15x) turns out to be the *steepest* part
  // of the whole terrain — the transition ramps up faster than the ridged relief
  // beyond it eases off. Sweeping out to 2.5x, empirically, is what it actually takes
  // to find a genuinely flat shelf with a view, rather than "least-steep of a bad set."
  const radii = opts.radii ?? [1.0, 1.3, 1.6, 1.9, 2.2, 2.5].map((f) => f * spec.valleyRadiusM)

  let best = { x: 0, z: 0, y: spec.valleyFloorM, yaw: 0, flatness: -Infinity }

  for (const d of radii) {
    for (let r = 0; r < rays; r++) {
      const angle = (r / rays) * Math.PI * 2
      const sx = Math.cos(angle) * d
      const sz = Math.sin(angle) * d
      const sy = sampleHeight(spec, sx, sz)
      const [, ny] = sampleNormal(spec, sx, sz, 2)
      if (ny > best.flatness) {
        // Face uphill — the gradient's ascent direction — so the peaks fill the view.
        const e = 3
        const gx = sampleHeight(spec, sx + e, sz) - sampleHeight(spec, sx - e, sz)
        const gz = sampleHeight(spec, sx, sz + e) - sampleHeight(spec, sx, sz - e)
        const gl = Math.hypot(gx, gz) || 1
        const yaw = Math.atan2(gx / gl, gz / gl)
        best = { x: sx, z: sz, y: sy, yaw, flatness: ny }
      }
    }
  }

  return { x: best.x, z: best.z, y: best.y, yaw: best.yaw }
}
