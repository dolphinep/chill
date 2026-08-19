# S1 — WebGPURenderer + RenderPipeline + Bloom in Next.js

**Status: PASSED.** No design changes required. Proceed to S2/S3.

Date: 2026-08-08 · three 0.185.1 · next 16.3.0 · react 19.2.8
Machine: Apple Silicon (adapter reports `apple · metal-3`), macOS 25.5.0
Spike lives at `apps/web/src/app/spikes/s1/` and is still runnable: `/spikes/s1`.

---

## What the spike had to answer

| #   | Question                                      | Answer                 |
| --- | --------------------------------------------- | ---------------------- |
| 1   | `RenderPipeline` or `PostProcessing` at r185? | **`RenderPipeline`**   |
| 2   | Is `render()` sync, or must the loop await?   | **Sync**               |
| 3   | Does the Next App Router wiring work?         | **Yes**                |
| 4   | Does the WebGL2 fallback actually work?       | **Yes, transparently** |
| 5   | What does the engine chunk really cost?       | **272 KB gz, lazy**    |

---

## 1. `RenderPipeline` is the class; `PostProcessing` is a deprecation shim

Read directly from `three/build/three.webgpu.js`:

```js
class RenderPipeline { … }                       // line 86958
class PostProcessing extends RenderPipeline {    // line 87196
  constructor(renderer, outputNode) {
    warnOnce('PostProcessing: "PostProcessing" has been renamed to "RenderPipeline" …')
    super(renderer, outputNode)
  }
}
```

Both are exported. **Use `RenderPipeline`** — `PostProcessing` only exists to warn, and
the three.js docs say it will be removed.

## 2. `render()` is fully synchronous — never `await` it per frame

`RenderPipeline.render()` returns `undefined`, not a Promise. The spike asserts this at
runtime (`pipeline.render() === undefined` → reported as `render() sync: yes`).

`renderAsync()` also exists. **Do not use it in the animation loop.** Awaiting per frame
builds a microtask chain that adds latency and decouples rendering from rAF pacing.

```ts
renderer.setAnimationLoop(() => {
  update(dt)
  pipeline.render() // sync, no await
})
```

## 3. Next.js App Router wiring

Three files, and the split is mandatory rather than stylistic:

```
page.tsx      Server Component
S1Client.tsx  'use client' + dynamic(() => import('./S1Scene'), { ssr: false })
S1Scene.tsx   'use client' — owns the renderer
```

`next/dynamic` with `ssr: false` **cannot be called from a Server Component**. The
middle file exists solely to satisfy that rule.

`next.config.ts` needs `transpilePackages: ['three']`. Confirmed working with
Turbopack (Next 16's default).

**`lib` must be `ES2024`**, not ES2023 — `Promise.withResolvers()` (which the Balerion
guide recommends over the `let resolve` deferred pattern) is not in the ES2023 lib.

## 4. WebGL2 fallback is genuinely transparent

Toggling `forceWebGL: true` and inspecting the live canvas context:

|                               | WebGPU   | forceWebGL                    |
| ----------------------------- | -------- | ----------------------------- |
| `canvas.getContext('webgpu')` | non-null | **null**                      |
| `canvas.getContext('webgl2')` | null     | **non-null**                  |
| Panel reports                 | `WebGPU` | `WebGL2`                      |
| Draw calls                    | 15       | **15**                        |
| Bloom + MRT                   | works    | **works, visually identical** |

The same TSL node graph transpiles to WGSL and GLSL with no code branch. Teardown was
also verified clean — after switching backends the canvas count stayed at 1, so
`dispose()` + `removeChild` genuinely releases the old context.

**Consequence for the plan:** the WebGL2 fallback needs no separate code path, only a
quality tier. Compute-shader features (if any are added later) will need a guard.

## 5. Bundle

Production build, gzipped:

|                                                 | gz         |
| ----------------------------------------------- | ---------- |
| Engine chunk (`three/webgpu` + TSL + BloomNode) | **272 KB** |
| Initial shell for `/` (8 chunks)                | **173 KB** |

The engine chunk is **not referenced by either prerendered HTML** — the dynamic import
genuinely keeps it out of the initial load.

272 KB matches the predicted ~278 KB almost exactly, and sits well inside the plan's
420 KB engine budget with room for terrain/water/character TSL.

> ⚠️ **The 173 KB shell exceeds the plan's 120 KB budget, and shadcn/ui is not installed
> yet.** This is essentially the Next 16 + React 19 App Router baseline, so the budget
> was optimistic rather than the build being bloated. **Action: revise the initial-JS
> budget to ~200 KB gz** and re-measure once the HUD is real.

---

## Two surprises worth remembering

### A. A 0×0 canvas host is not a benign transient

Mounting the renderer before the host has a real size makes three allocate zero-sized
swapchain textures, and WebGPU rejects every one:

```
GPUValidationError: The texture size ([Extent3D width:0, height:0 …]) is empty.
  While validating [TextureDescriptor "depthBuffer"] …
GPUValidationError: Could not create a swapchain texture of size 0.
```

The fix is `waitForSize()` in `S1Scene.tsx` — resolve a ResizeObserver before
constructing the renderer, and ignore zero-sized resize events afterwards.
**`EngineCanvas` must carry this over verbatim.**

### B. `requestAnimationFrame` is fully suspended while the document is hidden

Measured in the automated browser pane: `document.visibilityState === 'hidden'`,
`innerWidth/innerHeight === 0`, `100dvh` resolves to `0px`, and **zero rAF callbacks
fire in 1.5 s**.

Two consequences:

1. **This validates the idle-power design.** The plan's "`document.hidden` → stop the
   loop, keep audio playing" is not merely an optimisation — the browser enforces it.
   Frame pacing must therefore never assume a frame will arrive, and resume must
   advance time-of-day from wall clock rather than accumulated `dt`.
2. **Frame timing cannot be measured in an automated pane.** The spike reports
   `frame: n/a — document hidden` rather than a fabricated number. Correctness findings
   come from one synchronous `pipeline.render()`, which does not need rAF.

**Consequence: S6 (idle power) must be run by a human on a real visible window.** The
same is true of any fps figure. Do not trust automated frame numbers from this harness.

---

## Also established (scaffold)

- `pnpm check` (format + typecheck + lint) is green across both workspace packages.
- **The engine boundary rule is verified, not just written.** A probe file importing
  `react` from `src/engine/` is rejected:
  `'react' import is restricted … engine/ must stay framework-free`.
- `eslint-config-next@16` ships **native flat config** — importing it through
  `FlatCompat` crashes the validator with a circular-reference error. Import
  `eslint-config-next/core-web-vitals` and `/typescript` directly.
- three requests a GPU adapter during `init()` and then **discards it**, keeping only
  `device` — so `renderer.backend.adapter` is always undefined. Query
  `navigator.gpu.requestAdapter()` directly for adapter info (this is how `QualityTier`
  will pick its starting tier).

## Follow-ups

- [ ] Revise the initial-JS budget from 120 KB to ~200 KB gz in the plan.
- [ ] Port `waitForSize()` into `EngineCanvas`.
- [ ] Run S6 manually in a visible window; automated fps is unavailable.
