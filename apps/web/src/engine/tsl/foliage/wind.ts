import { float, positionWorld, sin, time, uniform, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'

/**
 * Shared wind bend for grass blades and palm fronds: a travelling wave sampled at the
 * blade's world XZ, weighted by how far up the mesh a vertex sits so roots stay planted
 * and tips sway. `heightWeight` is expected pre-normalised to ~0..1 (root..tip).
 */

type F = Node<'float'>
type V3 = Node<'vec3'>

/** Matches the sand ripple cross-wind axis. Exported so anything else that drifts with
 * "the scene's wind" (lanterns — see `engine/thoughts/ThoughtField.ts`) shares the exact
 * same vector instead of picking its own, unrelated direction. */
export const WIND_DIR = { x: 0.8, z: 0.55 }

/** Reduced-motion halves this, never to zero (a stock-still island reads as broken, not
 * calm). Shared across every `windOffset` caller — grass and palms move together, one
 * knob, rather than each field needing its own reduced-motion wiring. */
const motionScale = uniform(1)

export function setFoliageMotionScale(scale: number): void {
  motionScale.value = scale
}

export function windOffset(heightWeight: F, opts: { strength?: number; speed?: number } = {}): V3 {
  const strength = opts.strength ?? 0.16
  const speed = opts.speed ?? 1.6

  const phase = positionWorld.x
    .mul(WIND_DIR.x * 0.35)
    .add(positionWorld.z.mul(WIND_DIR.z * 0.35))
    .add(time.mul(speed)) as F
  const flutterPhase = positionWorld.x
    .mul(2.3)
    .add(positionWorld.z.mul(1.7))
    .add(time.mul(speed * 2.4)) as F

  const sway = sin(phase).mul(0.8).add(sin(flutterPhase).mul(0.2)) as F
  const bend = heightWeight.pow(1.6).mul(sway).mul(strength).mul(motionScale) as F

  return vec3(bend.mul(WIND_DIR.x), float(0), bend.mul(WIND_DIR.z)) as V3
}
