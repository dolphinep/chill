/**
 * The bus graph (see plan §Audio):
 *
 *   music stems ──(stem gains)──┬─→ musicBus ──→ musicDuck ──┐
 *   ambience bed ───────────────┼─→ ambienceBus → ambDuck ───┼─→ waterFilter → master → limiter → dest
 *   world emitters ─(Panner)────┘                            │   (lowpass, bypassed on land)
 *   UI sounds ──────────────────→ uiBus ─────────────────────┘
 *
 * `waterFilter` stays bypassed (cutoff pinned high) — nothing in the current build puts
 * the camera underwater yet, so there's no signal to drive a "wading" mix with. The node
 * exists because the bus topology is part of this checklist item; wiring a real trigger
 * for it is not — that's stubbing a feature, not building infrastructure.
 *
 * The limiter (`DynamicsCompressorNode`, high ratio, low threshold) is non-negotiable for
 * an app people are expected to wear headphones with all day — one badly-gained stem
 * should never be able to clip the output.
 */

export type BusGraph = {
  musicBus: GainNode
  musicDuck: GainNode
  ambienceBus: GainNode
  ambDuck: GainNode
  uiBus: GainNode
  /** World-anchored `PositionalAudio` panners connect here directly — they have no bus
   * gain of their own, matching the diagram's unlabelled "world emitters" arrow. */
  worldBus: GainNode
  waterFilter: BiquadFilterNode
  master: GainNode
  limiter: DynamicsCompressorNode
}

const WATER_FILTER_BYPASS_HZ = 20000
const WATER_FILTER_ACTIVE_HZ = 500

export function buildBusGraph(ctx: AudioContext): BusGraph {
  const musicBus = ctx.createGain()
  const musicDuck = ctx.createGain()
  const ambienceBus = ctx.createGain()
  const ambDuck = ctx.createGain()
  const uiBus = ctx.createGain()
  const worldBus = ctx.createGain()

  const waterFilter = ctx.createBiquadFilter()
  waterFilter.type = 'lowpass'
  waterFilter.frequency.value = WATER_FILTER_BYPASS_HZ

  const master = ctx.createGain()
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -18
  limiter.ratio.value = 16
  limiter.attack.value = 0.003
  limiter.release.value = 0.25

  musicBus.connect(musicDuck)
  ambienceBus.connect(ambDuck)
  musicDuck.connect(waterFilter)
  ambDuck.connect(waterFilter)
  worldBus.connect(waterFilter)
  uiBus.connect(waterFilter)
  waterFilter.connect(master)
  master.connect(limiter)
  limiter.connect(ctx.destination)

  return { musicBus, musicDuck, ambienceBus, ambDuck, uiBus, worldBus, waterFilter, master, limiter }
}

export function setWaterFilterActive(graph: BusGraph, ctx: AudioContext, active: boolean): void {
  const target = active ? WATER_FILTER_ACTIVE_HZ : WATER_FILTER_BYPASS_HZ
  graph.waterFilter.frequency.setTargetAtTime(target, ctx.currentTime, 0.3)
}

/** A short gain dip on a bus — e.g. "nearby thought" ducking ambience 300ms. Restores to
 * `restoreTo` (perceptual, already-scaled) after `durationMs`. */
export function duck(
  gain: AudioParam,
  ctx: AudioContext,
  dipTo: number,
  restoreTo: number,
  durationMs: number,
): void {
  const now = ctx.currentTime
  gain.setTargetAtTime(dipTo, now, 0.05)
  gain.setTargetAtTime(restoreTo, now + durationMs / 1000, 0.15)
}
