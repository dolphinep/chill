/**
 * Converts continuous character movement into discrete, alternating left/right foot
 * placements — the same "accumulate distance, fire at a stride threshold" idea as
 * `FootstepPlayer` (`lib/audio/emitters.ts`), applied to visual footprints instead of
 * one-shot audio.
 *
 * Stamping at the character's centre every single frame (the original approach) draws
 * one continuously-refreshed depression that just smears into a single rut following
 * the path — nothing a person recognises as "footprints." `SandField`/`SnowField`'s own
 * decay/ping-pong already keeps a one-time stamp visible long after it's stamped, so
 * nothing needs to re-stamp the same spot every frame; it only needs a NEW stamp each
 * time a foot actually lands, alternating sides so the trail reads as a walk and not a
 * single line down the middle.
 */

const STEP_LENGTH_M = 0.65 // distance between consecutive (alternating) footfalls
const MIN_SPEED_FOR_STEPS = 0.3
const FOOT_OFFSET_M = 0.16 // half the stance width — roughly shoulder-width apart

export type Footfall = { x: number; z: number; pressure: number }

export class FootfallTracker {
  #traveled = 0
  #left = false
  #idleAccumS = 0

  /** Call once per frame with the character's current ground position/facing/speed and
   * how far it moved since the last call. Returns a new footfall the instant one lands,
   * `null` every other frame. */
  step(x: number, z: number, yaw: number, speed: number, distanceM: number): Footfall | null {
    if (speed < MIN_SPEED_FOR_STEPS || distanceM <= 0) {
      this.#idleAccumS += 0.016
      if (this.#idleAccumS > 0.28) {
        this.#traveled = 0
      }
      return null
    }
    this.#idleAccumS = 0
    this.#traveled += distanceM
    if (this.#traveled < STEP_LENGTH_M) return null
    this.#traveled = 0
    this.#left = !this.#left
    const side = this.#left ? -1 : 1
    // Perpendicular to facing (`yaw`'s own convention: forward is (sin, cos)), rotated
    // -90° so it points to the character's right.
    const rightX = Math.cos(yaw)
    const rightZ = -Math.sin(yaw)
    return {
      x: x + rightX * FOOT_OFFSET_M * side,
      z: z + rightZ * FOOT_OFFSET_M * side,
      pressure: Math.min(speed / 3, 1),
    }
  }

  reset(): void {
    this.#traveled = 0
    this.#idleAccumS = 0
  }
}

