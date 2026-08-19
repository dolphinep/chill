import { assertSceneryBounds } from '@chill/protocol'

/**
 * THE SINGLE SOURCE OF TRUTH for terrain shape.
 *
 * Two evaluators consume this and must agree:
 *   - `buildHeightNode(spec)`  -> TSL, runs on the GPU (baking, in-shader detail)
 *   - `sampleHeight(spec, x, z)` -> plain TS, runs on the CPU (ALL gameplay)
 *
 * The agreement is enforced by `goldenHeightCheck`, not by discipline. Without that
 * test the dual-evaluator scheme is a slow-motion bug factory: someone edits one
 * side, the character starts standing 40cm above the sand, and nobody knows why.
 *
 * Deliberately NOT part of this contract: sand deformation. Footprints are <=8cm of
 * visual displacement written to a GPU render target and never read back. The
 * character always stands on `sampleHeight`. That single decision removes the entire
 * GPU->CPU readback problem from the collision path.
 *
 * **A discriminated union, per the plan's own "Scenery as data" section**: "new
 * scenery = data change" is true for variants of a known archetype (another beach,
 * gentler dunes). A genuinely different kind of place — a coastline vs. a mountain
 * range — needs a different shaping *function*, not just different numbers plugged
 * into the same one, which is exactly why `kind` exists here rather than one giant
 * HeightSpec with every field optional.
 */

export type Octave = {
  /** Cycles per metre. */
  frequency: number
  /** Metres of displacement contributed at this octave. */
  amplitude: number
  /**
   * Ridged octaves use `1 - |n|`, which produces creases instead of rolling hills —
   * the difference between a dune field and a mountain ridge.
   */
  ridged: boolean
}

type TerrainBase = {
  id: string
  seed: number
  /** Nominal peak-to-trough range, in metres. Drives the golden-test tolerance. */
  heightScale: number
  octaves: Octave[]
  /**
   * Half-extent of the play area, in metres. Asserted against the wire format at
   * module load — int16 centimetres cannot represent beyond +/-327.67m.
   */
  halfExtentM: number
}

export type CoastalTerrainSpec = TerrainBase & {
  kind: 'coastal'
  /** Beyond this radius the island falls away to the sea floor. */
  islandRadiusM: number
  /** Width of the falloff band, in metres. Larger = gentler shelf. */
  islandFalloffM: number
  seaLevelM: number
  /**
   * Depth of the open sea floor, in metres (negative).
   *
   * The island mask used to scale height *toward zero* — but zero IS sea level, so
   * beyond the island the world was a flat plane exactly at the waterline. Water depth
   * is `seaLevel - bed`, so depth was 0 everywhere, the water rendered fully
   * transparent, and there was no visible sea at all no matter how the water shaded.
   * The mask now blends terrain toward this floor instead.
   */
  seaFloorM: number
  /**
   * Flattens terrain near sea level so the shoreline is a walkable beach rather
   * than a cliff. 0 disables it; ~0.6 gives a broad sand shelf.
   */
  beachFlatten: number
  /**
   * Vertical half-width of the flattening band, in metres.
   *
   * This is the parameter that decides whether you get a *beach* or a *salt flat*. It
   * was previously hardcoded to `heightScale * 0.25` — 10.5m here — which flattened so
   * much terrain that the waterline ended up hundreds of metres from anywhere you could
   * sit. A few metres gives a beach you can sit at the top of and still see the sea.
   */
  beachBandM: number
}

export type RidgeTerrainSpec = TerrainBase & {
  kind: 'ridge'
  /** Radius (m) of the flat valley floor at the centre — inside it, terrain eases
   * toward `valleyFloorM` regardless of what the raw noise says. There is no
   * authored geography (same reasoning as the coastal spec's island mask), so
   * without this a spawn point has no better than random odds of landing on a
   * walkable slope instead of a cliff face. */
  valleyRadiusM: number
  /** Width of the transition band between the flat valley and full ridged relief. */
  valleyFalloffM: number
  valleyFloorM: number
  /** Height (m) above which the terrain material favours snow over exposed rock —
   * a *shading* threshold, not a geometry one; the peaks are the same rock underneath. */
  snowLineM: number
  /** Height (m) below which pines are scattered. Above it, just rock and snow. */
  treeLineM: number
}

export type HeightSpec = CoastalTerrainSpec | RidgeTerrainSpec

/** Kamakura Bay — the v0.1 scenery. Gentle dunes, a broad beach, a shallow bay. */
export const KAMAKURA_BAY: CoastalTerrainSpec = {
  kind: 'coastal',
  id: 'kamakura-bay',
  seed: 20260808,
  heightScale: 42,
  octaves: [
    { frequency: 0.0042, amplitude: 26, ridged: false },
    { frequency: 0.0113, amplitude: 11, ridged: false },
    { frequency: 0.0291, amplitude: 4.2, ridged: false },
    { frequency: 0.0734, amplitude: 1.4, ridged: false },
    { frequency: 0.1908, amplitude: 0.42, ridged: false },
  ],
  islandRadiusM: 190,
  islandFalloffM: 95,
  seaLevelM: 0,
  seaFloorM: -30,
  beachFlatten: 0.62,
  beachBandM: 2.4,
  halfExtentM: 300,
}

/** Frostholm Ridge — a snow-bound alpine valley. Ridged multifractal peaks around a
 * flat, walkable valley floor; no water, no deformation (footprints in snow are a
 * later addition, not this one). */
export const FROSTHOLM_RIDGE: RidgeTerrainSpec = {
  kind: 'ridge',
  id: 'frostholm-ridge',
  seed: 20261120,
  heightScale: 78,
  // Four ridged octaves at doubling-ish frequency, not two — a real ridged multifractal
  // needs creases at several scales or it reads as two giant angular folds ("faceted")
  // instead of a wrinkled mountainside. The two smoothest octaves stay non-ridged so the
  // finest grain doesn't cusp as hard as the macro relief.
  octaves: [
    { frequency: 0.0031, amplitude: 32, ridged: true },
    { frequency: 0.0072, amplitude: 19, ridged: true },
    { frequency: 0.0168, amplitude: 10, ridged: true },
    { frequency: 0.0392, amplitude: 5, ridged: true },
    { frequency: 0.0914, amplitude: 2.4, ridged: false },
    { frequency: 0.2133, amplitude: 0.9, ridged: false },
  ],
  valleyRadiusM: 65,
  valleyFalloffM: 45,
  valleyFloorM: 5,
  snowLineM: 24,
  treeLineM: 19,
  halfExtentM: 300,
}

/** Aki Highlands — golden autumn plateau with warm rolling hills and scenic sunset. */
export const AKI_HIGHLANDS: RidgeTerrainSpec = {
  kind: 'ridge',
  id: 'aki-highlands',
  seed: 20260921,
  heightScale: 52,
  octaves: [
    { frequency: 0.0035, amplitude: 24, ridged: false },
    { frequency: 0.0084, amplitude: 14, ridged: true },
    { frequency: 0.0182, amplitude: 7, ridged: false },
    { frequency: 0.0421, amplitude: 3.2, ridged: true },
    { frequency: 0.0985, amplitude: 1.6, ridged: false },
  ],
  valleyRadiusM: 80,
  valleyFalloffM: 50,
  valleyFloorM: 6,
  snowLineM: 48,
  treeLineM: 38,
  halfExtentM: 300,
}

/** Sunset Sports Arena — flat central beach stadium with level volleyball & future sports courts. */
export const SPORTS_ARENA: CoastalTerrainSpec = {
  kind: 'coastal',
  id: 'sports-arena',
  seed: 20260714,
  heightScale: 24,
  octaves: [
    { frequency: 0.004, amplitude: 8, ridged: false },
    { frequency: 0.012, amplitude: 4, ridged: false },
    { frequency: 0.035, amplitude: 1.5, ridged: false },
  ],
  islandRadiusM: 140,
  islandFalloffM: 40,
  seaLevelM: 0,
  seaFloorM: -8,
  beachFlatten: 0.85,
  beachBandM: 8.0,
  halfExtentM: 300,
}

/** Observatory Peak — a bare rocky summit, kept deliberately gentle and compact: this
 * scenery exists to look up, not to explore, so the platform just needs to be a calm,
 * walkable place to stand. `snowLineM`/`treeLineM` are set far above `heightScale` so
 * the terrain material's elevation-gated snow blend and Engine.ts's tree/snowman
 * scatter never trigger — bare rock everywhere, no new material or scatter code
 * needed (see the terrain-material/scatter reuse notes in `Engine.ts`'s
 * `scenery.id === 'observatory'` blocks). */
export const OBSERVATORY_PEAK: RidgeTerrainSpec = {
  kind: 'ridge',
  id: 'observatory',
  seed: 20261218,
  heightScale: 58,
  octaves: [
    { frequency: 0.0034, amplitude: 24, ridged: true },
    { frequency: 0.0079, amplitude: 13, ridged: true },
    { frequency: 0.0184, amplitude: 6, ridged: false },
    { frequency: 0.0428, amplitude: 2.6, ridged: false },
  ],
  valleyRadiusM: 42,
  valleyFalloffM: 34,
  valleyFloorM: 8,
  snowLineM: 500,
  treeLineM: 500,
  halfExtentM: 300,
}

// S2 follow-up: fail at module load, not on the wire. Positions travel as int16
// centimetres, so a play area beyond ±327.67m would silently wrap an avatar to the far
// side of the world rather than throwing.
assertSceneryBounds(KAMAKURA_BAY.id, KAMAKURA_BAY.halfExtentM)
assertSceneryBounds(FROSTHOLM_RIDGE.id, FROSTHOLM_RIDGE.halfExtentM)
assertSceneryBounds(AKI_HIGHLANDS.id, AKI_HIGHLANDS.halfExtentM)
assertSceneryBounds(SPORTS_ARENA.id, SPORTS_ARENA.halfExtentM)
assertSceneryBounds(OBSERVATORY_PEAK.id, OBSERVATORY_PEAK.halfExtentM)
