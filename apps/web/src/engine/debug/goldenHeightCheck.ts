import type * as THREE from 'three/webgpu'
import { bakeAndCompare, type CompareResult } from './bakeAndCompare'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import { islandMask, sampleHeight, valleyMask } from '@/engine/terrain/HeightFieldCpu'
import { buildPermutation, gradientNoise2D } from '@/engine/terrain/noise'
import { createGradientNoise } from '@/engine/tsl/noise/gradientNoise'
import { buildHeightNode } from '@/engine/tsl/terrain/heightNode'

/**
 * THE guard that makes the dual-evaluator design safe.
 *
 * `sampleHeight` (CPU, authoritative for all gameplay) and `buildHeightNode` (TSL,
 * used for baking and in-shader detail) must agree. If someone edits one and not the
 * other, this catches it in seconds instead of as "the character floats 40cm above
 * the sand" three weeks later.
 *
 * Runs as a *ladder* rather than a single assertion: coordinate mapping, then the
 * noise primitive, then the island mask, then the full stack. A single pass/fail
 * tells you something broke; the ladder tells you where. That distinction was worth
 * real time during S2 — see docs/spikes/S2-cpu-gpu-height-parity.md.
 *
 * Readback happens here ONLY. It never appears in the collision path.
 *
 * Run locally and nightly. Do NOT gate PRs on it — WebGPU in CI is unreliable.
 */

export type GoldenHeightReport = {
  rungs: CompareResult[]
  passed: boolean
  /** First failing rung, which is the one worth reading. */
  firstFailure: CompareResult | null
}

export async function runGoldenHeightCheck(
  renderer: THREE.Renderer,
  spec: HeightSpec,
  resolution = 256,
): Promise<GoldenHeightReport> {
  const perm = buildPermutation(spec.seed)
  const { noise2D } = createGradientNoise(perm)
  const { height, mask } = buildHeightNode(spec)
  const half = spec.halfExtentM
  const f = spec.octaves[0]!.frequency
  const cpuMask = spec.kind === 'coastal' ? (x: number, z: number) => islandMask(spec, x, z) : (x: number, z: number) => valleyMask(spec, x, z)

  const common = { resolution, halfExtent: half }

  const rungs = [
    await bakeAndCompare(renderer, {
      ...common,
      label: 'coordinate mapping (x)',
      tolerance: 1e-2,
      gpu: (x) => x,
      cpu: (x) => x,
    }),
    await bakeAndCompare(renderer, {
      ...common,
      label: 'coordinate mapping (z)',
      tolerance: 1e-2,
      gpu: (_x, z) => z,
      cpu: (_x, z) => z,
    }),
    await bakeAndCompare(renderer, {
      ...common,
      label: 'gradientNoise2D',
      tolerance: 1e-4,
      gpu: (x, z) => noise2D(x.mul(f), z.mul(f)),
      cpu: (x, z) => gradientNoise2D(perm, x * f, z * f),
    }),
    await bakeAndCompare(renderer, {
      ...common,
      label: spec.kind === 'coastal' ? 'islandMask' : 'valleyMask',
      tolerance: 1e-5,
      gpu: (x, z) => mask(x, z),
      cpu: (x, z) => cpuMask(x, z),
    }),
    await bakeAndCompare(renderer, {
      ...common,
      label: 'sampleHeight',
      // The contract: agree to within 1/1000 of the terrain's height range.
      tolerance: 1e-3 * spec.heightScale,
      gpu: (x, z) => height(x, z),
      cpu: (x, z) => sampleHeight(spec, x, z),
    }),
  ]

  const firstFailure = rungs.find((r) => !r.passed) ?? null
  return { rungs, passed: firstFailure === null, firstFailure }
}
