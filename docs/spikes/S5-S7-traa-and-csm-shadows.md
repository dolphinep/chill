# S5 + S7 — TRAA over vertex-animated geometry, and CSM shadows

**S7 (CSM shadows): PASSED.**
**S5 (TRAA ghosting): INCONCLUSIVE in an automated pane — needs a human. Not a pass.**

Date: 2026-08-08 · three 0.185.1 · WebGPU on Apple Silicon. Runnable at `/spikes/s57`.

Tested in one scene on purpose: the risk was never "do shadows work" or "does TRAA
work" alone, it was whether TRAA ghosts on **vertex-animated** geometry (water, grass,
the VAT crowd) that is also receiving cascaded shadows. That is the real beach scene.

---

## S7 — CSM shadows: PASSED

three r185 ships **`examples/jsm/csm/CSMShadowNode.js`**, a node-based cascaded shadow
implementation built for the WebGPU renderer. (`CSMShader.js` in the same folder is the
old GLSL path and is WebGL-only — do not reach for it.)

Attachment is a single assignment:

```ts
const csm = new CSMShadowNode(sun, { cascades: 3, maxFar: 120, mode: 'practical' })
sun.shadow.shadowNode = csm
```

`light.shadow.shadowNode` is the documented hook (`three.webgpu.js` reads
`this.light.shadow.shadowNode` when setting up the light's shadow node).

**Verified working**: 3 cascades, `PCFSoftShadowMap`, soft shadow edges cast by static
boxes onto a **vertex-displaced** water surface — i.e. shadows correctly land on
geometry that only the GPU knows has moved. 29 draw calls for the whole scene including
3 cascade passes.

Options accepted by `CSMShadowNode`: `cascades` (default 3), `maxFar` (100000),
`mode` ('practical'), `lightMargin` (200), `customSplitsCallback`.

**Consequence for the plan:** the S7 fallback (a single tight cascade + baked AO) is not
needed. Shadows are as designed.

---

## S5 — TRAA: API wiring confirmed, ghosting unmeasurable here

### What was established

**`traa()` takes four arguments, not two:**

```ts
traa(beautyNode, depthNode, velocityNode, camera)
```

so it needs **both depth and velocity**, which is why the scene pass must declare
`mrt({ output, velocity })`. My first attempt passed two arguments and failed to compile
— worth recording, because the plan's sketch implied a simpler call.

Working construction:

```ts
const scenePass = pass(scene, camera)
scenePass.setMRT(mrt({ output, velocity }))
pipeline.outputNode = traa(
  scenePass.getTextureNode('output'),
  scenePass.getTextureNode('depth'),
  scenePass.getTextureNode('velocity'),
  camera,
)
```

TRAA also demonstrably does real spatial work: **max per-pixel delta 49/255 across
0.28% of pixels** versus the un-antialiased pipeline. Edge-shaped and nonzero, so it is
not a silent passthrough.

### Why the ghosting result is not trustworthy

The decisive probe: accumulate the **same frozen scene** for 2 frames vs 32 frames and
diff the results.

```
accum 2f vs 32f:  mean 0.00  ·  max 0.0
```

**Byte-identical.** TRAA's temporal history does not accumulate across manually-driven
`pipeline.render()` calls. Three different motion conditions (frozen, 60 Hz, 12× stress)
all produced the same residual of 0.06 — not because TRAA is robust, but because **the
harness never exercised temporal accumulation at all.**

Two earlier versions of this test were also wrong, and both are worth recording because
they produced _confident, plausible, meaningless_ numbers:

1. **The first "freeze" wasn't a freeze.** I nudged `water.position.y` by 0.001 while
   the wave was driven by the built-in `time` node, which advances on every render
   regardless. Both branches animated identically. Fixed by owning the clock as a
   `uniform` instead of using `time`.
2. **Sub-pixel motion cannot provoke smearing.** At 60 Hz the surface moved ~0.013
   world units per frame — far under a pixel. A "no ghosting" result from that would
   only have proven the test was too gentle. Hence the added 12× stress case.

Neither fix helped, because the underlying blocker is accumulation, not motion.

### What S5 still needs

Run `/spikes/s57` **in a real visible window with a live rAF loop** and look for
smearing on the water and on the VAT crowd. Fold this into the S6 session — it is the
same prerequisite (a presented, visible surface).

If ghosting does appear, the planned mitigations stand: give each vertex-animated
material an explicit `prevTime` uniform and compute previous-frame world position
through the same node function; or mask those materials out of TRAA and let them take
plain jitter; or drop TRAA for FXAA/SMAA on all tiers.

**Do not mark S5 passed on the strength of this harness.**

---

## Cross-cutting lesson

Three spikes have now produced numbers that were confidently wrong until a _control_
was added: S2's stride assumption, S3's `renderer.info` reset, and S5's absent
accumulation. In each case the fix was the same shape — **measure something whose answer
you already know, and check the harness reproduces it.** The S2 bisection ladder, the
S3 naive-baseline comparison, and the S5 `2f vs 32f` probe are all that pattern. Any
future spike here should include one by default.
