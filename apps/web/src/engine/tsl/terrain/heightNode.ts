import { abs, clamp, exp, float, mix, sqrt } from 'three/tsl'
import type { Node } from 'three/webgpu'
import type { CoastalTerrainSpec, HeightSpec, RidgeTerrainSpec } from '@/engine/terrain/HeightSpec'
import { buildPermutation } from '@/engine/terrain/noise'
import { createGradientNoise } from '@/engine/tsl/noise/gradientNoise'

/**
 * The GPU evaluator. Mirrors `HeightFieldCpu.ts` line for line, per kind.
 *
 * Used for baking the height texture the clipmap samples, and for sub-texel detail
 * evaluated live in the vertex shader. NEVER used for gameplay — the CPU evaluator is
 * authoritative there, which is what keeps readback off the hot path entirely.
 */

type F = Node<'float'>

function rawOctaveSum(
  noise2D: (x: F, z: F) => F,
  spec: HeightSpec,
  x: F,
  z: F,
): F {
  let h: F = float(0)
  for (const octave of spec.octaves) {
    const n = noise2D(x.mul(octave.frequency), z.mul(octave.frequency))
    const shaped: F = octave.ridged ? float(1).sub(abs(n)) : n
    h = h.add(shaped.mul(octave.amplitude))
  }
  return h
}

/** Mirrors `islandMask` (CPU). */
function islandMaskNode(spec: CoastalTerrainSpec, x: F, z: F): F {
  const d = sqrt(x.mul(x).add(z.mul(z)))
  const c = clamp(d.sub(spec.islandRadiusM).div(spec.islandFalloffM), 0, 1)
  return float(1).sub(c.mul(c).mul(float(3).sub(c.mul(2))))
}

/** Mirrors `valleyMask` (CPU). */
function valleyMaskNode(spec: RidgeTerrainSpec, x: F, z: F): F {
  const d = sqrt(x.mul(x).add(z.mul(z)))
  const c = clamp(d.sub(spec.valleyRadiusM).div(spec.valleyFalloffM), 0, 1)
  return c.mul(c).mul(float(3).sub(c.mul(2)))
}

export function buildHeightNode(spec: HeightSpec) {
  const { noise2D } = createGradientNoise(buildPermutation(spec.seed))

  const mask = (x: F, z: F): F =>
    spec.kind === 'coastal' ? islandMaskNode(spec, x, z) : valleyMaskNode(spec, x, z)

  /** Terrain height in metres at world (x, z). Mirrors `sampleHeight`. */
  const height = (x: F, z: F): F => {
    const raw = rawOctaveSum(noise2D, spec, x, z)

    if (spec.kind === 'coastal') {
      // Blend toward the sea floor, not toward zero — see `seaFloorM`.
      let h = mix(float(spec.seaFloorM), raw, islandMaskNode(spec, x, z)) as F
      if (spec.beachFlatten > 0) {
        const above = h.sub(spec.seaLevelM).div(spec.beachBandM)
        const nearness = exp(above.mul(above).negate())
        const w = nearness.mul(spec.beachFlatten)
        h = h.mul(float(1).sub(w)).add(w.mul(spec.seaLevelM))
      }
      return h
    }

    // Ridge: ease from the flat valley floor up to the full noise composite — same
    // shape as the coastal blend, protecting the walkable centre instead of an
    // island's interior.
    return mix(float(spec.valleyFloorM), raw, valleyMaskNode(spec, x, z)) as F
  }

  // Exported so `bakeAndCompare` can test the mask as its own rung — a divergence in
  // the mask looks identical to a divergence in the noise unless you can bisect them.
  return { height, mask }
}
