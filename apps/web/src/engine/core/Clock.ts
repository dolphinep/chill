/**
 * Fixed-timestep simulation clock with a render interpolation factor.
 *
 * Non-negotiable for this app: it will run on 144 Hz monitors, on 60 Hz laptops, and
 * in a throttled background tab. A variable-dt controller behaves differently on each,
 * which means the character's jump height would depend on the user's monitor.
 *
 * Two hazards it exists to absorb:
 *  - **A huge dt after a stall.** rAF is suspended while `document.hidden` (S1), so the
 *    first frame back can carry many seconds. Unclamped, the character teleports.
 *  - **Laptop sleep.** After a long gap the sim clock is hard-reset rather than being
 *    fast-forwarded through thousands of steps, and callers are told to re-snap.
 */

export const FIXED_STEP = 1 / 60
/** Never integrate more than this in one frame — below 20 Hz we accept slow-motion. */
const MAX_FRAME_DT = 1 / 20
/** Beyond this, assume sleep/tab-restore and resync instead of catching up. */
const RESYNC_THRESHOLD = 5

export type ClockTick = {
  /** Number of fixed steps to run this frame. */
  steps: number
  /** 0..1 position between the last and next fixed step, for render interpolation. */
  alpha: number
  /** Raw wall-clock delta, for stats and time-of-day. */
  rawDt: number
  /** True when a long gap forced a resync — re-snap the clipmap, do not integrate. */
  resynced: boolean
}

export class Clock {
  #last = 0
  #accumulator = 0
  #started = false

  /** Simulated seconds — advances only in fixed steps. */
  simTime = 0
  /** Real elapsed seconds since start, including time spent hidden. */
  wallTime = 0

  reset(now: number): void {
    this.#last = now
    this.#accumulator = 0
    this.#started = true
  }

  tick(now: number): ClockTick {
    if (!this.#started) {
      this.reset(now)
      return { steps: 0, alpha: 0, rawDt: 0, resynced: true }
    }

    const rawDt = (now - this.#last) / 1000
    this.#last = now

    if (rawDt > RESYNC_THRESHOLD) {
      // Do not integrate thousands of steps to "catch up" — nobody wants to watch the
      // world fast-forward. Advance wall time so time-of-day stays honest, then resync.
      this.wallTime += rawDt
      this.#accumulator = 0
      return { steps: 0, alpha: 0, rawDt, resynced: true }
    }

    this.wallTime += rawDt
    this.#accumulator += Math.min(rawDt, MAX_FRAME_DT)

    let steps = 0
    while (this.#accumulator >= FIXED_STEP) {
      this.#accumulator -= FIXED_STEP
      this.simTime += FIXED_STEP
      steps++
    }

    return { steps, alpha: this.#accumulator / FIXED_STEP, rawDt, resynced: false }
  }
}
