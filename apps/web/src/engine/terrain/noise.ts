/**
 * The shared noise primitive. The CPU evaluator calls these functions directly; the
 * TSL evaluator reimplements the *same arithmetic* against the *same permutation
 * table*. Any change here must be mirrored in `tsl/noise/gradientNoise.ts`, and
 * `goldenHeightCheck` will catch it if it is not.
 *
 * Two choices here exist specifically to survive the float64(CPU)/float32(GPU) split:
 *
 * 1. **A permutation table, not an arithmetic hash.** `fract(sin(dot(...)))` hashes
 *    are the usual shader idiom and they diverge badly between backends — the large
 *    multipliers overflow float32 precision. A 256-entry table indexed by exact small
 *    integers is bit-identical on both sides.
 * 2. **Gradients from an angle, not a lookup table of vectors.** `cos/sin` of a small
 *    angle agree to ~1e-7 across implementations, and it avoids branching on a
 *    gradient index in TSL.
 */

export const PERM_SIZE = 256
const TAU = Math.PI * 2

/**
 * Deterministic Fisher-Yates over an LCG. Seeded shuffles must be reproducible
 * across machines, so this never touches Math.random.
 */
export function buildPermutation(seed: number): Uint8Array {
  const p = new Uint8Array(PERM_SIZE)
  for (let i = 0; i < PERM_SIZE; i++) p[i] = i

  let s = seed >>> 0
  const next = () => {
    // Numerical Recipes LCG. Kept in uint32 so it behaves identically everywhere.
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s
  }

  for (let i = PERM_SIZE - 1; i > 0; i--) {
    const j = next() % (i + 1)
    const tmp = p[i]!
    p[i] = p[j]!
    p[j] = tmp
  }
  return p
}

/** Wrap any integer into [0, 255]. Must match the TSL version for negative inputs. */
export function wrap256(i: number): number {
  return i - Math.floor(i / PERM_SIZE) * PERM_SIZE
}

/** Quintic fade — C2 continuous, so normals derived from this stay smooth. */
export function quintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function gradDot(hash: number, x: number, y: number): number {
  const angle = (hash / PERM_SIZE) * TAU
  return Math.cos(angle) * x + Math.sin(angle) * y
}

/** Perlin-style 2D gradient noise. Output is roughly [-1, 1]. */
export function gradientNoise2D(perm: Uint8Array, x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi

  const x0 = wrap256(xi)
  const x1 = wrap256(xi + 1)
  const y0 = wrap256(yi)
  const y1 = wrap256(yi + 1)

  const px0 = perm[x0]!
  const px1 = perm[x1]!

  const h00 = perm[wrap256(px0 + y0)]!
  const h10 = perm[wrap256(px1 + y0)]!
  const h01 = perm[wrap256(px0 + y1)]!
  const h11 = perm[wrap256(px1 + y1)]!

  const n00 = gradDot(h00, xf, yf)
  const n10 = gradDot(h10, xf - 1, yf)
  const n01 = gradDot(h01, xf, yf - 1)
  const n11 = gradDot(h11, xf - 1, yf - 1)

  const u = quintic(xf)
  const v = quintic(yf)

  const a = n00 + (n10 - n00) * u
  const b = n01 + (n11 - n01) * u
  return a + (b - a) * v
}
