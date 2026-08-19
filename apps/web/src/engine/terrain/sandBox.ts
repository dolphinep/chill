import { float, vec2 } from 'three/tsl'
import type { Node } from 'three/webgpu'

/**
 * The static world-space box the sand deformation field covers, and the shared
 * world<->UV mapping every consumer (the decay/stamp passes that write it, the terrain
 * material that reads it) must agree on.
 *
 * Static and non-scrolling, per the plan: Kamakura Bay's beach sits within a bounded
 * area, so there is no scroll-copy pass to get right, and footprints persist truly
 * anywhere on the beach rather than fading as soon as they leave a moving window.
 */

// Must cover wherever the player actually stands, not just the world origin. Both
// scenery specs place their spawn well off-centre — `findBeachSpawn`/`findRidgeSpawn`
// walk outward from the origin looking for a flat shelf, and for Kamakura Bay that
// lands ~191m out (the island's shoreline, not its middle). 256 (half-extent 128) was
// short of that on every axis, so every footprint stamp/sample landed outside the box
// and silently read back as zero — no depression, no rim, nothing, for BOTH sceneries.
// Caught because a real footprint stayed invisible after `SnowField` was wired up, not
// from the numbers alone; the sand field had the same bug from the day it shipped, just
// never watched closely enough in-browser to notice. 440 covers Kamakura's ~191m
// worst-case with real margin for wandering the shoreline; resolution is bumped
// proportionally so texel density (footprint crispness) doesn't regress.
export const SAND_BOX_SIZE = 440
export const SAND_BOX_CENTER = { x: 0, z: 0 }
export const SAND_RESOLUTION = 2048

type F = Node<'float'>
type V2 = Node<'vec2'>

/** World (x, z) -> sand texture UV, 0..1 over the box. */
export function worldToSandUV(worldX: F, worldZ: F): V2 {
  const u = worldX.sub(float(SAND_BOX_CENTER.x)).div(SAND_BOX_SIZE).add(0.5) as F
  const v = worldZ.sub(float(SAND_BOX_CENTER.z)).div(SAND_BOX_SIZE).add(0.5) as F
  return vec2(u, v)
}

/** Plain-number counterpart of `worldToSandUV`, for CPU-side reads (diagnostics only —
 * gameplay never samples this texture, see `HeightSpec.ts`'s "never read back" note).
 * `null` outside the box, same as the GPU path silently clamping to the edge would. */
export function worldToSandPixel(worldX: number, worldZ: number): { x: number; y: number } | null {
  const u = (worldX - SAND_BOX_CENTER.x) / SAND_BOX_SIZE + 0.5
  const v = (worldZ - SAND_BOX_CENTER.z) / SAND_BOX_SIZE + 0.5
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null
  return {
    x: Math.floor(u * SAND_RESOLUTION),
    y: Math.floor(v * SAND_RESOLUTION),
  }
}

/** Inverse of `worldToSandPixel` — pixel (x, y) -> world (x, z) at the texel centre. */
export function sandPixelToWorld(x: number, y: number): { worldX: number; worldZ: number } {
  const u = (x + 0.5) / SAND_RESOLUTION
  const v = (y + 0.5) / SAND_RESOLUTION
  return {
    worldX: (u - 0.5) * SAND_BOX_SIZE + SAND_BOX_CENTER.x,
    worldZ: (v - 0.5) * SAND_BOX_SIZE + SAND_BOX_CENTER.z,
  }
}

/** IEEE 754 half-float bit pattern -> JS number. `readRenderTargetPixelsAsync` returns
 * raw `Uint16Array` bits for RG16F targets — three.js does not decode these for you. */
export function halfToFloat(h: number): number {
  const sign = (h & 0x8000) >> 15
  const exponent = (h & 0x7c00) >> 10
  const fraction = h & 0x03ff
  if (exponent === 0) return (sign ? -1 : 1) * 2 ** -14 * (fraction / 1024)
  if (exponent === 0x1f) return fraction ? NaN : (sign ? -Infinity : Infinity)
  return (sign ? -1 : 1) * 2 ** (exponent - 15) * (1 + fraction / 1024)
}
