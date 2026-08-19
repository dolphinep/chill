/**
 * Equal-power crossfade via `setValueCurveAtTime` with cos/sin curves. A linear crossfade
 * (A: 1→0, B: 0→1 straight lines) dips ~3 dB in the middle — at the halfway point the
 * summed power is only 0.5, not 1 — and on a bed that's playing continuously, everyone
 * hears the hole. Equal-power keeps `a² + b² == 1` throughout.
 */

const CURVE_STEPS = 32

export function equalPowerCrossfade(
  fromGain: AudioParam,
  toGain: AudioParam,
  ctx: AudioContext,
  durationMs: number,
): void {
  const fromCurve = new Float32Array(CURVE_STEPS)
  const toCurve = new Float32Array(CURVE_STEPS)
  for (let i = 0; i < CURVE_STEPS; i++) {
    const t = i / (CURVE_STEPS - 1)
    fromCurve[i] = Math.cos(t * (Math.PI / 2))
    toCurve[i] = Math.sin(t * (Math.PI / 2))
  }
  const now = ctx.currentTime
  const dur = durationMs / 1000
  fromGain.setValueCurveAtTime(fromCurve, now, dur)
  toGain.setValueCurveAtTime(toCurve, now, dur)
}
