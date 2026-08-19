# S2 — CPU/GPU height parity

**Status: PASSED, decisively.** The dual-evaluator design is safe. No plan changes.

Date: 2026-08-08 · three 0.185.1 · Apple Silicon (`apple · metal-3`)
Runnable at `/spikes/s2`. Canonical checker: `src/engine/debug/goldenHeightCheck.ts`.

---

## The question

The terrain is generated on the GPU (a baked height texture the clipmap samples), but
the character has to stand on it. Reading the GPU buffer back every frame would cost
1–3 frames of latency plus a pipeline stall, so the design instead keeps **two
evaluators from one `HeightSpec`**:

- `sampleHeight(spec, x, z)` — plain TS, authoritative for all gameplay
- `buildHeightNode(spec)` — TSL, used for baking and in-shader detail

That only works if they agree. **If they cannot, the whole collision design changes.**

## Result

| Rung                   | Max abs error | Tolerance | GPU range      |
| ---------------------- | ------------- | --------- | -------------- |
| coordinate mapping (x) | **0.00e+0**   | 1e-2      | −298.83…298.83 |
| coordinate mapping (z) | **1.53e-5**   | 1e-2      | −298.83…298.83 |
| gradientNoise2D        | **8.70e-7**   | 1e-4      | −0.48…0.49     |
| islandMask             | **4.59e-7**   | 1e-5      | 0.00…1.00      |
| **sampleHeight**       | **1.96e-5 m** | 4.2e-2 m  | −15.31…14.60   |

The contract is "agree to within 1/1000 of the terrain's height range" — for a 42 m
`heightScale` that is 4.2 cm. **Measured worst case is 19.6 micrometres: ~2000× inside
budget.** float32-vs-float64 is nowhere near the limiting factor.

**CPU cost: ~370 ns per `sampleHeight` call** (200k-sample benchmark), matching the
predicted 300–600 ns. The local player needs ~5 samples/frame ≈ 1.9 µs. Readback is
not merely avoidable, it would be strictly worse.

## Why it agrees this well — two deliberate choices

1. **A permutation table, not an arithmetic hash.** `fract(sin(dot(...)))` is the usual
   shader idiom and it diverges badly across backends because the large multipliers
   exceed float32 precision. A 256-entry table indexed by exact small integers is
   bit-identical on both sides. It rides to the GPU as a `uniformArray` — no texture,
   so no filtering mode, colour space, or texel-centre arithmetic to get wrong.
2. **Gradients from an angle, not a vector lookup table.** `cos/sin` of a small angle
   agree to ~1e-7 everywhere, and it avoids branching on a gradient index in TSL.

## The bisection ladder is the real deliverable

The check is **five rungs, not one assertion**, and that mattered. The first run failed
with a 21 m error. A single pass/fail would only have said "the terrain is wrong". The
ladder said "rung 1 — coordinate mapping — is wrong", which immediately meant every
downstream number was meaningless and the noise implementation was not the suspect.

Keep this shape. Cost is ~40 lines; it converted a potentially day-long hunt into two
targeted fixes.

## Two traps found (both would recur in any TSL bake)

### A. `readRenderTargetPixelsAsync` on a `RedFormat` target returns stride 1, not 4

This was the actual root cause. Assuming an RGBA stride reads every fourth texel and
walks off the end of the buffer — which presents as _plausible-looking coordinate
garbage_, not as an obvious error. The tell was an asymmetry: `x` maxed at 291.80 while
`z` reached the full 298.83.

`bakeAndCompare` now derives the stride instead of assuming it:

```ts
const stride = Math.max(1, Math.round(buf.length / samples))
```

and reports it, so a future format change surfaces as data rather than as a mystery.

### B. `screenCoordinate` is relative to the renderer viewport, not the render target

An offscreen renderer that never had `setSize()` called carries the 300×150 canvas
default, so `screenCoordinate` silently disagrees with a 256×256 target. **Use `uv()`**
across a fullscreen quad: interpolated at a fragment centre it is exactly
`(px + 0.5) / resolution`, which the CPU side reproduces without guessing.

### Bonus: row order needed no flip

The harness scores both orientations and reports which matched. On this platform
readback rows align with `uv().y` directly (`flip: ·` on every rung). It is still
scored both ways rather than assumed — a flip produces a large but _plausible_ error,
which is exactly the kind of bug that survives review.

## Follow-ups

- [ ] The TSL helpers are plain TS functions, so the noise graph is **inlined per
      octave** (5× for Kamakura Bay). Correctness-identical, but if shader compile time
      or size becomes a problem, wrapping `noise2D` in TSL `Fn()` is the one change
      worth making. `Fn`'s `ProxiedTuple` generics do not compose across nested calls in
      @types/three 0.185, which is why it is not done already.
- [ ] Wire `runGoldenHeightCheck` into Vitest browser mode for the nightly run. Do
      **not** gate PRs on it — WebGPU in CI is unreliable.
- [ ] `assertSceneryBounds` is written but not yet called; hook it into scenery
      registration so a >327.67 m play area fails at boot rather than on the wire.
