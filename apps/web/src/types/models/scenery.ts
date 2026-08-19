import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import type { SkyOptions } from '@/engine/tsl/sky/atmosphere'
import type { SceneryAudioAssets } from '@/lib/audio/engine'

/**
 * "Scenery as data" (plan). Trimmed to what actually has a consumer right now —
 * `posterUrl`/`activities`/`postures`/`hudSafeZones` are all real fields in the plan's
 * sketch, but nothing reads them yet (no poster pipeline, no animation clips, no HUD
 * zone system). Adding them empty now would be exactly the kind of scaffolding-without-
 * substance this project has been deliberately avoiding elsewhere (the scenery
 * registry itself was deferred for months for the same reason). They slot in later
 * without touching this shape's existing fields.
 */
export type SceneryId =
  | 'frostholm-ridge'
  | 'kamakura-bay'
  | 'aki-highlands'
  | 'sports-arena'
  | 'observatory'

export type Scenery = {
  id: SceneryId
  /** Boot dissolve / Still-mode caption — "place, not progress." */
  place: string
  terrain: HeightSpec
  sky: SkyOptions
  /** The `DirectionalLight`'s own colour/intensity — distinct from `sky.sunColor`
   * (the sky dome's sun-disc colour). They happened to already differ for Kamakura
   * Bay before this type existed; kept as two fields rather than unified, since
   * unifying them would be a visual change to the existing scenery, not a refactor. */
  sun: { color: number; intensity: number }
  hemi: { sky: number; ground: number; intensity: number }
  uiPolarity: 'dark' | 'light'
  audio: SceneryAudioAssets
}
