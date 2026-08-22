import { z } from 'zod'
import {
  AKI_HIGHLANDS,
  FROSTHOLM_RIDGE,
  KAMAKURA_BAY,
  OBSERVATORY_PEAK,
  SPORTS_ARENA,
} from '@/engine/terrain/HeightSpec'
import type { Scenery, SceneryId } from '@/types/models/scenery'

const octaveSchema = z.object({
  frequency: z.number(),
  amplitude: z.number(),
  ridged: z.boolean(),
})

const terrainBase = {
  id: z.string(),
  seed: z.number(),
  heightScale: z.number(),
  octaves: z.array(octaveSchema),
  halfExtentM: z.number(),
}

const coastalTerrainSchema = z.object({
  ...terrainBase,
  kind: z.literal('coastal'),
  islandRadiusM: z.number(),
  islandFalloffM: z.number(),
  seaLevelM: z.number(),
  seaFloorM: z.number(),
  beachFlatten: z.number(),
  beachBandM: z.number(),
})

const ridgeTerrainSchema = z.object({
  ...terrainBase,
  kind: z.literal('ridge'),
  valleyRadiusM: z.number(),
  valleyFalloffM: z.number(),
  valleyFloorM: z.number(),
  snowLineM: z.number(),
  treeLineM: z.number(),
})

const terrainSchema = z.discriminatedUnion('kind', [coastalTerrainSchema, ridgeTerrainSchema])

const audioAssetsSchema = z.object({
  bedUrl: z.string(),
  waveUrls: z.array(z.string()),
  footstepUrls: z.array(z.string()),
  incidentalUrls: z.array(z.string()),
})

const skySchema = z.object({
  sunDirection: z.tuple([z.number(), z.number(), z.number()]).optional(),
  zenith: z.number().optional(),
  horizon: z.number().optional(),
  ground: z.number().optional(),
  sunColor: z.number().optional(),
  sunIntensity: z.number().optional(),
  domeRadius: z.number().optional(),
})

const scenerySchema = z.object({
  id: z.enum(['kamakura-bay', 'frostholm-ridge', 'aki-highlands', 'sports-arena', 'observatory']),
  place: z.string(),
  terrain: terrainSchema,
  sky: skySchema,
  sun: z.object({ color: z.number(), intensity: z.number() }),
  hemi: z.object({ sky: z.number(), ground: z.number(), intensity: z.number() }),
  uiPolarity: z.enum(['dark', 'light']),
  audio: audioAssetsSchema,
})

const WAVE_URLS = [1, 2, 3, 4].map((n) => `/audio/ambience/wave-0${n}.mp3`)
const GULL_URLS = [1, 2, 3, 4].map((n) => `/audio/birds/gull-0${n}.mp3`)
const SAND_FOOTSTEP_URLS = [1, 2, 3, 4, 5, 6].map((n) => `/audio/footsteps/sand-0${n}.mp3`)
const SNOW_FOOTSTEP_URLS = [1, 2, 3, 4].map((n) => `/audio/footsteps/snow-0${n}.mp3`)

const kamakuraBay: Scenery = {
  id: 'kamakura-bay',
  place: 'Kamakura Bay — 6:40 in the morning',
  terrain: KAMAKURA_BAY,
  sky: {
    sunDirection: [-0.62, 0.16, -0.77],
    sunIntensity: 6,
    zenith: 0x1f4a8f,
    horizon: 0xd8c9ad,
    sunColor: 0xffd0a0,
  },
  sun: { color: 0xffe0b8, intensity: 2.6 },
  hemi: { sky: 0x9dbbe8, ground: 0xbfa27a, intensity: 1.15 },
  uiPolarity: 'dark',
  audio: {
    bedUrl: '/audio/ambience/wind-loop.mp3',
    waveUrls: WAVE_URLS,
    footstepUrls: SAND_FOOTSTEP_URLS,
    incidentalUrls: GULL_URLS,
  },
}

const frostholmRidge: Scenery = {
  id: 'frostholm-ridge',
  place: 'Frostholm Ridge — a clear alpine morning',
  terrain: FROSTHOLM_RIDGE,
  sky: {
    sunDirection: [-0.5, 0.42, -0.76],
    sunIntensity: 8,
    zenith: 0x3f7fc9,
    horizon: 0xdce8f2,
    sunColor: 0xfff6e0,
  },
  sun: { color: 0xfff2e0, intensity: 3.0 },
  hemi: { sky: 0xbcd4ea, ground: 0xe8ecf0, intensity: 1.3 },
  uiPolarity: 'light',
  audio: {
    bedUrl: '/audio/ambience/wind-loop.mp3',
    waveUrls: [],
    footstepUrls: SNOW_FOOTSTEP_URLS,
    incidentalUrls: [],
  },
}

const akiHighlands: Scenery = {
  id: 'aki-highlands',
  place: 'Aki Highlands — a warm autumn sunset',
  terrain: AKI_HIGHLANDS,
  sky: {
    sunDirection: [-0.75, 0.22, -0.62],
    sunIntensity: 9.2,
    zenith: 0x4a2e5d,
    horizon: 0xff7b54,
    sunColor: 0xffa040,
  },
  sun: { color: 0xff9944, intensity: 3.2 },
  hemi: { sky: 0xffaa66, ground: 0x5a3311, intensity: 1.2 },
  uiPolarity: 'dark',
  audio: {
    bedUrl: '/audio/ambience/wind-loop.mp3',
    waveUrls: [],
    footstepUrls: SAND_FOOTSTEP_URLS,
    incidentalUrls: [],
  },
}

const sportsArena: Scenery = {
  id: 'sports-arena',
  place: 'Sunset Sports Arena — 17:30 Golden Hour',
  terrain: SPORTS_ARENA,
  sky: {
    sunDirection: [-0.85, 0.18, -0.5],
    sunIntensity: 10.0,
    zenith: 0x312e81,
    horizon: 0xf97316,
    sunColor: 0xfde047,
  },
  sun: { color: 0xfb923c, intensity: 3.5 },
  hemi: { sky: 0xfbcfe8, ground: 0x431407, intensity: 1.4 },
  uiPolarity: 'dark',
  audio: {
    bedUrl: '/audio/ambience/coastal-loop.mp3',
    waveUrls: WAVE_URLS,
    footstepUrls: SAND_FOOTSTEP_URLS,
    incidentalUrls: GULL_URLS,
  },
}

const observatory: Scenery = {
  id: 'observatory',
  place: 'Observatory Peak — deep night, clear skies',
  terrain: OBSERVATORY_PEAK,
  sky: {
    // Well below the -0.25 threshold `starRadiance`'s `nightFactor` gates on
    // (`atmosphere.ts`) — guarantees full star visibility regardless of anything
    // else, independent of the separate hard lock in `#applyNormalizedTime`.
    sunDirection: [0.15, -0.55, -0.35],
    sunIntensity: 0.4,
    zenith: 0x040611,
    horizon: 0x141c33,
    ground: 0x05060a,
    sunColor: 0x445577,
    // Smaller than the default 4000 — "bring the sky closer" per the user's request.
    // Coordinated with the moon's orbit distance in `Engine.ts` (kept at the same
    // ~0.875 ratio the default 4000/3500 pair uses) so nothing pokes through.
    domeRadius: 1400,
  },
  sun: { color: 0x8aa0ff, intensity: 0.12 },
  hemi: { sky: 0x1a2440, ground: 0x0a0a0e, intensity: 0.35 },
  uiPolarity: 'dark',
  audio: {
    bedUrl: '/audio/ambience/wind-loop.mp3',
    waveUrls: [],
    // No gravel/rock footstep set exists yet — sand is the closest available match
    // for a dry, dusty summit (snow would be actively wrong here).
    footstepUrls: SAND_FOOTSTEP_URLS,
    incidentalUrls: [],
  },
}

export const SCENERY_REGISTRY = {
  'frostholm-ridge': frostholmRidge,
  'kamakura-bay': kamakuraBay,
  'aki-highlands': akiHighlands,
  'sports-arena': sportsArena,
  observatory,
} satisfies Record<SceneryId, Scenery>

for (const scenery of Object.values(SCENERY_REGISTRY)) {
  scenerySchema.parse(scenery)
}

export const DEFAULT_SCENERY_ID: SceneryId = 'observatory'

export function resolveScenery(id: string | null | undefined): Scenery {
  if (id && id in SCENERY_REGISTRY) return SCENERY_REGISTRY[id as SceneryId]
  return SCENERY_REGISTRY[DEFAULT_SCENERY_ID]
}
