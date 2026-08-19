/**
 * Two continuous, parallel ski grooves instead of `FootfallTracker`'s alternating
 * single-foot placements — skis move together, they don't alternate sides. Spaced
 * closer than a walking stride so consecutive circular stamps
 * (`SnowField.FOOTPRINT_RADIUS = 0.36`, diameter 0.72) overlap enough to read as a
 * continuous track rather than a chain of separate dots.
 */

const TRACK_SPACING_M = 0.3
const MIN_SPEED_FOR_TRACK = 0.3
/** Half the ski stance width. */
const SKI_OFFSET_M = 0.11

export type SkiTrackStamp = { x: number; z: number; pressure: number }

export class SkiTrackTracker {
  #traveled = 0
  #idleAccumS = 0

  /** Call once per frame while skiing with the character's current ground
   * position/facing/speed and how far it moved since the last call. Returns both
   * ski stamps the instant the spacing threshold is crossed, an empty array every
   * other frame. */
  step(x: number, z: number, yaw: number, speed: number, distanceM: number): SkiTrackStamp[] {
    if (speed < MIN_SPEED_FOR_TRACK || distanceM <= 0) {
      this.#idleAccumS += 0.016
      if (this.#idleAccumS > 0.28) {
        this.#traveled = 0
      }
      return []
    }
    this.#idleAccumS = 0
    this.#traveled += distanceM
    if (this.#traveled < TRACK_SPACING_M) return []
    this.#traveled = 0

    // Perpendicular to facing (`yaw`'s own convention: forward is (sin, cos)), rotated
    // -90° so it points to the character's right — same convention as `FootfallTracker`.
    const rightX = Math.cos(yaw)
    const rightZ = -Math.sin(yaw)
    // A thinner mark than a boot print (`FootfallTracker` uses the un-scaled value) —
    // a ski carves a shallow groove, it doesn't sink in like a boot.
    const pressure = Math.min(speed / 3, 1) * 0.6

    return [
      { x: x + rightX * SKI_OFFSET_M, z: z + rightZ * SKI_OFFSET_M, pressure },
      { x: x - rightX * SKI_OFFSET_M, z: z - rightZ * SKI_OFFSET_M, pressure },
    ]
  }

  reset(): void {
    this.#traveled = 0
    this.#idleAccumS = 0
  }
}
