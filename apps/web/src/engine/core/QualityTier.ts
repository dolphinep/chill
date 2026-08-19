import type { QualityTierName } from './EngineEventBus'

/**
 * Frame-time driven quality ladder.
 *
 * **Deliberately asymmetric: demote fast, promote reluctantly.** A picture that
 * oscillates between quality levels is far more irritating than one that is simply a
 * notch lower, so stepping down needs 1.5 s of evidence while stepping up needs 10 s
 * *and* a 30 s cooldown.
 *
 * Also note the target: we design to 8–10 ms, not 16.6. A chill app that pegs the GPU
 * spins the fans and gets closed. Losing the app to thermals is worse than any visual
 * compromise.
 */

export const TIER_ORDER: QualityTierName[] = ['low', 'medium', 'high']

const DEMOTE_ABOVE_MS = 18.5
const DEMOTE_AFTER_FRAMES = 90
const PROMOTE_BELOW_MS = 11
const PROMOTE_AFTER_FRAMES = 600
const PROMOTE_COOLDOWN_MS = 30_000
/** Ignore this long after boot, resize, or a scene swap — one spike must not demote. */
const SETTLE_MS = 2000
const EMA_ALPHA = 2 / (120 + 1)

export type QualityTierOptions = {
  initial?: QualityTierName
  /** Set false to pin the tier (user override). */
  auto?: boolean
  onChange?: (to: QualityTierName, from: QualityTierName, reason: string) => void
}

export class QualityTier {
  #tier: QualityTierName
  #ema = 0
  #hot = 0
  #cool = 0
  #suppressUntil = 0
  #lastPromoteAt = 0
  #onChange?: QualityTierOptions['onChange']

  auto: boolean

  constructor(opts: QualityTierOptions = {}) {
    this.#tier = opts.initial ?? 'high'
    this.auto = opts.auto ?? true
    this.#onChange = opts.onChange
  }

  get tier(): QualityTierName {
    return this.#tier
  }

  get frameMs(): number {
    return this.#ema
  }

  /** Call after boot, resize, or a scene swap. */
  settle(now: number): void {
    this.#suppressUntil = now + SETTLE_MS
    this.#hot = 0
    this.#cool = 0
  }

  set(tier: QualityTierName, reason = 'manual'): void {
    if (tier === this.#tier) return
    const from = this.#tier
    this.#tier = tier
    this.#onChange?.(tier, from, reason)
  }

  sample(frameMs: number, now: number): void {
    this.#ema = this.#ema === 0 ? frameMs : this.#ema + EMA_ALPHA * (frameMs - this.#ema)

    if (!this.auto || now < this.#suppressUntil) return

    if (this.#ema > DEMOTE_ABOVE_MS) {
      this.#hot++
      this.#cool = 0
    } else if (this.#ema < PROMOTE_BELOW_MS) {
      this.#cool++
      this.#hot = 0
    } else {
      this.#hot = 0
      this.#cool = 0
    }

    const index = TIER_ORDER.indexOf(this.#tier)

    if (this.#hot >= DEMOTE_AFTER_FRAMES && index > 0) {
      this.#hot = 0
      this.set(
        TIER_ORDER[index - 1]!,
        `frame time ${this.#ema.toFixed(1)}ms > ${DEMOTE_ABOVE_MS}ms`,
      )
      return
    }

    if (
      this.#cool >= PROMOTE_AFTER_FRAMES &&
      index < TIER_ORDER.length - 1 &&
      now - this.#lastPromoteAt > PROMOTE_COOLDOWN_MS
    ) {
      this.#cool = 0
      this.#lastPromoteAt = now
      this.set(
        TIER_ORDER[index + 1]!,
        `frame time ${this.#ema.toFixed(1)}ms < ${PROMOTE_BELOW_MS}ms`,
      )
    }
  }
}

/**
 * Per-tier settings. The sacrifice order encodes what the eye misses least first —
 * expensive screen-space effects go before geometry, and render scale is last because
 * a soft image reads as "broken" in a way a missing reflection does not.
 */
export type TierSettings = {
  renderScale: number
  shadowMapSize: number
  shadows: boolean
  bloom: boolean
  fxaa: boolean
  /** Ring levels actually drawn. Fewer = shorter view distance, big triangle saving. */
  clipmapLevels: number
  /** Water ring levels. Water is the most expensive per-pixel material in the scene. */
  waterLevels: number
  /** Grass/rock/palm scatter. Thousands of small instances add up in vertex cost. */
  foliage: boolean
  /** LAN multiplayer: how many peers render as the full ~16-draw-call `ChibiAvatarMesh`
   * before the rest fall back to `RemoteAvatar`'s cheap one-draw-call placeholder — see
   * that file's own doc comment. Nearest-to-camera wins the full slots; this ladder
   * exists so a full 20-person party doesn't blow the draw-call budget on a laptop. */
  maxFullAvatars: number
}

/**
 * These must differ in ways a person can actually see and a profiler can actually
 * measure. An earlier version had `medium` and `high` identical apart from a shadow-map
 * size that was only read once at startup — so switching tiers did nothing at all, which
 * is worse than having no ladder: it hides the fact that the app cannot shed load.
 *
 * Sacrifice order: post chain -> shadows -> view distance -> render scale. Render scale
 * is last because a soft image reads as "broken" in a way a missing reflection does not.
 */
export const TIER_SETTINGS: Record<QualityTierName, TierSettings> = {
  low: {
    renderScale: 0.8,
    shadowMapSize: 1024,
    shadows: false,
    bloom: false,
    fxaa: true,
    clipmapLevels: 5,
    waterLevels: 4,
    foliage: false,
    maxFullAvatars: 2,
  },
  medium: {
    renderScale: 1,
    shadowMapSize: 1024,
    shadows: true,
    bloom: true,
    fxaa: true,
    clipmapLevels: 6,
    waterLevels: 5,
    foliage: true,
    maxFullAvatars: 3,
  },
  high: {
    renderScale: 1,
    shadowMapSize: 2048,
    shadows: true,
    bloom: true,
    fxaa: true,
    clipmapLevels: 7,
    waterLevels: 5,
    foliage: true,
    maxFullAvatars: 5,
  },
}
