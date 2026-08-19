import { cos, floor, mix, sin, uniformArray } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { PERM_SIZE } from '@/engine/terrain/noise'

/**
 * The GPU mirror of `engine/terrain/noise.ts`. Every line here has a counterpart
 * there, and `goldenHeightCheck` proves they agree.
 *
 * The permutation table rides as a `uniformArray` rather than a texture: no filtering
 * mode to get wrong, no colour-space conversion to accidentally apply, and no
 * texel-centre arithmetic. Indexing is exact.
 *
 * These are plain TS functions rather than TSL `Fn()` wrappers, so the node graph is
 * inlined at each call site. That is deliberate: `Fn`'s ProxiedTuple generics do not
 * compose across nested calls in @types/three 0.185, and inlining is correctness-
 * identical. If shader size or compile time ever becomes a problem, wrapping
 * `noise2D` in `Fn` is the one change worth making — see docs/spikes/S2.
 */

type F = Node<'float'>

const TAU = Math.PI * 2

export function createGradientNoise(perm: Uint8Array) {
  if (perm.length !== PERM_SIZE) {
    throw new Error(`Permutation table must be ${PERM_SIZE} entries, got ${perm.length}`)
  }

  // elementType is inferred from values[0], so these must be plain numbers.
  // The generic is pinned because otherwise `'float'` widens to `string`.
  const permArray = uniformArray<'float'>(Array.from(perm), 'float')

  /** Wrap any integer into [0, 255]. Mirrors `wrap256`, negatives included. */
  const wrap256 = (i: F): F => i.sub(i.div(PERM_SIZE).floor().mul(PERM_SIZE))

  const permAt = (i: F): F => permArray.element(wrap256(i).toInt()) as F

  /** Quintic fade, C2 continuous. Mirrors `quintic`. */
  const quintic = (t: F): F =>
    t
      .mul(t)
      .mul(t)
      .mul(t.mul(t.mul(6).sub(15)).add(10))

  /** Gradient from an angle — see noise.ts for why this is not a vector table. */
  const gradDot = (hash: F, x: F, y: F): F => {
    const angle = hash.div(PERM_SIZE).mul(TAU)
    return cos(angle).mul(x).add(sin(angle).mul(y))
  }

  /** Perlin-style 2D gradient noise, roughly [-1, 1]. Mirrors `gradientNoise2D`. */
  const noise2D = (x: F, y: F): F => {
    const xi = floor(x)
    const yi = floor(y)
    const xf = x.sub(xi)
    const yf = y.sub(yi)

    const px0 = permAt(xi)
    const px1 = permAt(xi.add(1))
    const y0 = wrap256(yi)
    const y1 = wrap256(yi.add(1))

    const n00 = gradDot(permAt(px0.add(y0)), xf, yf)
    const n10 = gradDot(permAt(px1.add(y0)), xf.sub(1), yf)
    const n01 = gradDot(permAt(px0.add(y1)), xf, yf.sub(1))
    const n11 = gradDot(permAt(px1.add(y1)), xf.sub(1), yf.sub(1))

    const u = quintic(xf)
    const v = quintic(yf)

    return mix(mix(n00, n10, u), mix(n01, n11, u), v)
  }

  return { noise2D }
}
