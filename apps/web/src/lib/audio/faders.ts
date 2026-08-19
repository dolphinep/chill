/**
 * Perceptual gain: `gain = v ** 2.2`. Linear faders feel wrong — ears are logarithmic, so
 * a linear 0..1 fader does nothing for the top 30% of its travel and everything in the
 * bottom 10%. Always ramp via `setTargetAtTime`, never `.value =` — an instant jump on a
 * running graph is an audible click.
 */

const PERCEPTUAL_EXPONENT = 2.2
/** setTargetAtTime never truly reaches the target — 4 time-constants is close enough
 * that "when did fade X finish" answers stay sane without a completion callback. */
const TIME_CONSTANT_DIVISOR = 4

export function perceptualGain(v: number): number {
  return Math.pow(Math.max(0, Math.min(1, v)), PERCEPTUAL_EXPONENT)
}

export function setFader(gain: AudioParam, ctx: AudioContext, target: number, ms: number): void {
  const timeConstant = ms / 1000 / TIME_CONSTANT_DIVISOR
  gain.setTargetAtTime(perceptualGain(target), ctx.currentTime, Math.max(timeConstant, 1e-4))
}
