# S3 — VAT bone-texture skinning on InstancedMesh

**Status: PASSED.** The mechanism works. **But it also corrects a premise in the plan —
read "The 6 ms cliff was overstated" below.**

Date: 2026-08-08 · three 0.185.1 · Apple Silicon (`apple · metal-3`)
Runnable at `/spikes/s3`. Engine code: `engine/avatars/BoneTextureBaker.ts`,
`engine/tsl/crowd/vatSkinning.ts`.

---

## The question

Can 100+ animated avatars render as **one** `InstancedMesh` driven by a custom TSL
vertex node that samples baked bone matrices from a texture — replacing three's
built-in skinning entirely? This was flagged as the highest-risk item in the project
because the r185 vertex-node hook was unverified.

## Result — 200 characters

| Metric                     | Measured                          |
| -------------------------- | --------------------------------- |
| Instances × bones          | 200 × 40                          |
| **Draw calls**             | **2** (crowd + clear)             |
| Triangles                  | 196,001                           |
| Bone texture               | **240 KB** (4 clips × 32 frames)  |
| Frame, GPU flush included  | **0.67 ms**                       |
| **Crowd JS per frame**     | **0.0000 ms** (one uniform write) |
| Naive skeleton JS, 200 chr | 0.81 ms                           |
| — per character            | 4.1 µs                            |

**200 animated characters cost 0.67 ms and one draw call, with literally zero
per-avatar JavaScript.** The GPU advances playback from a single uniform clock; each
instance carries only two static floats (`aAnim` = clip index, phase offset).

Visual verification: every instance bends differently and smoothly, confirming
per-instance clip selection, phase offset, two-frame blending, and 4-influence
skinning all work.

## How it works

`BoneTextureBaker` writes each bone as **3 consecutive texels** — the rows of a 3×4
affine matrix. The bottom row of a rigid transform is always `(0,0,0,1)`, so storing it
would waste 25% of the texture.

```
width  = frames
height = clips * bones * 3
row(clip, bone, r) = clip * bones * 3 + bone * 3 + r
```

A plain 2D RGBA-float `DataTexture`, not a `DataArrayTexture` — array sampling adds
complexity for no benefit at this size. `NearestFilter` + `textureLoad` gives exact
texel fetch; frame blending is done explicitly in the shader, because any hardware
filtering here would silently smear between _unrelated bones_.

The mesh is a plain `InstancedMesh`, **not** a `SkinnedMesh`, so three applies no
skinning of its own and `material.positionNode` owns the whole transform. Geometry
keeps its normal `skinIndex`/`skinWeight` attributes, so LODs and attachments still
work — only the _source_ of bone matrices changes.

**The r185 hook is simply `material.positionNode`.** No internal API, no patching. The
fallback plan (BatchedMesh + Web Worker pose baking) is not needed.

---

## ⚠️ The 6 ms cliff was overstated

The plan justified the VAT path with: _"~60 µs × 100 characters = ~6 ms/frame of pure
JavaScript, which blows the entire budget."_

**Measured: 4.1 µs per character, not 30–80 µs.** So the naive path at 100 characters
is roughly **0.41 ms of JS, not 6 ms** — an order of magnitude less alarming.

Caveats, stated honestly:

- This measures `updateMatrixWorld` + `Skeleton.update()` on a 40-bone chain. A real
  `AnimationMixer` adds keyframe-track interpolation (quaternion slerp per bone per
  track) that was **not** measured. **4.1 µs is a floor, not the full naive cost.**
- The synthetic skeleton is a simple chain; a real humanoid rig has a bushier hierarchy.

**What actually changes:**

1. **The real argument for VAT is draw calls, not JS.** 200 `SkinnedMesh` would be 200
   draw calls against a ≤120 budget. VAT gives 1. That alone justifies it.
2. **The LOD band-0 budget can be more generous than planned.** The plan caps "real
   skinned avatars" at 8 because of the feared 6 ms. At ~4 µs each (plus mixer cost),
   **16–24 is defensible**, which materially improves how good nearby avatars look.
   Re-measure with a real GLTF + `AnimationMixer` before committing to a number.
3. **The 100-avatar hard gate is very likely to pass.** Risk on the crowd path is now
   low; the remaining unknown is a real rig, not the technique.

---

## Two measurement traps (both would silently produce fiction)

### A. `renderer.info` resets at the start of every render

Reading `renderer.info.render.drawCalls` after a timing loop reported **0 draw calls
and 0 triangles**. Capture stats immediately after a single render, before any flush
or subsequent frame.

### B. Timing `render()` alone measures command submission, not work

WebGPU `render()` returns once commands are _submitted_. To time actual GPU work, wait
on the exact primitive:

```ts
await renderer.backend.device.queue.onSubmittedWorkDone()
```

Without it the numbers look implausibly good. (And per S1, rAF is suspended while the
document is hidden, so frames must be driven manually in an automated pane anyway.)

## Follow-ups

- [ ] Re-measure the naive baseline with a real GLTF rig + `AnimationMixer` before
      fixing the band-0 avatar count. Then update the LOD table in the plan.
- [ ] Bake from real `AnimationClip`s (the baker already takes a `PoseSampler`
      callback, so this is a supply change, not a rewrite).
- [ ] Add normal skinning — currently only `positionNode` is skinned, so lighting on
      moving avatars will be subtly wrong until `normalNode` gets the same treatment.
- [ ] Confirm the second draw call is the background clear and not a stray pass.
