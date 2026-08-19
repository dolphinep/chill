# Engine notes — §1

What exists after §1, and the non-obvious decisions behind it. Spike findings live in
`docs/spikes/`.

Run it: `pnpm dev` → `/`. Dev panel top-right.

---

## Shape

```
src/engine/            ← imports NO react/next/components (ESLint-enforced, probe-tested)
  core/    Engine · Clock · FrameScheduler · QualityTier · EngineEventBus
           Disposables
  render/  createRenderer · RenderPipelineBuilder
  tsl/     sky/atmosphere · terrain/heightNode · terrain/terrainMaterial
           noise/gradientNoise · crowd/vatSkinning
  terrain/ HeightSpec · noise · HeightFieldCpu · Clipmap
  camera/  FlyCamera        input/  InputMap
  debug/   bakeAndCompare · goldenHeightCheck
  avatars/ BoneTextureBaker

src/components/world/EngineCanvas.tsx   ← the ONE 'use client' boundary
src/components/hud/DevStatsPanel.tsx    ← first consumer of the event bus
```

React talks to the engine through `engine.events` and `engine.command()` — nothing else.
That is what keeps the R3F migration seam a one-file change.

## Measured (Apple Silicon, `apple · metal-3`, WebGPU, 1280×720)

|                          |                                                               |
| ------------------------ | ------------------------------------------------------------- |
| Scene draw calls         | **4** (sky dome, clipmap rings, centre patch, +1)             |
| Full pipeline draw calls | **21** (bloom mip chain + FXAA)                               |
| Triangles                | **156,622**                                                   |
| Clipmap                  | 6 levels, 0.5 m base cell, 128 quads/side → **1024 m radius** |

Well inside the ≤120 draw-call budget. Steady-state frame time needs the visible-window
session — see "What is not measured".

## Decisions worth knowing

**Two meshes, not one, for the clipmap.** Rings are an `InstancedMesh` (one instance per
level); the innermost hole is a separate centre patch. A single draw call would need
per-instance index sets, which no API offers. Two is the honest floor.

**Each ring snaps to twice its own cell size.** Snapping to one cell still lets grid
parity flip each step, which shows up as a shimmer along ring boundaries.

**The sky is a function, not a cubemap.** `skyRadiance(dir)` is a pure node function, so
water can reflect by evaluating it along the reflected ray — no cubemap, no PMREM, no
SSR, temporally stable, effectively free.

**Sky uses `MeshBasicNodeMaterial` + `colorNode`, never a raw `NodeMaterial.fragmentNode`.**
A raw `fragmentNode` emits one vec4, so rendering into a pass declaring
`mrt({ output, emissive })` fails validation outright:
`Color target has no corresponding fragment stage output ... targets[1]`.
**Every material in an MRT pass must write every declared target.** The sky uses
`material.mrtNode` to send only the sun disc/halo to the emissive target, so bloom picks
out the sun rather than smearing the whole gradient.

**The quality ladder is driven by frame-to-frame wall time, not the CPU work window.**
On WebGPU `render()` returns once commands are _submitted_ (S3), so the CPU window stays
~1 ms even when the GPU is drowning — a ladder fed by it would never demote.

**Frame gaps over 100 ms are ignored by the ladder.** A 170 ms gap is a stall (alt-tab,
paused loop), not load. Without this guard, quality silently dropped every time the user
switched windows — observed, not theorised.

**A frame is presented before the loop starts.** `renderOnce()` at the end of `init()`,
and again after any pipeline rebuild. Otherwise a tier change leaves the stale swapchain
image on screen, which reads as the app freezing, and opening in a background tab shows
black (the scheduler correctly refuses to run while hidden).

**`renderer.info.autoReset = false` + a manual `reset()` per frame.** `RenderPipeline`
issues several internal renders per frame; with autoReset on, `info` reflects only the
last one. This is three's own prescribed pattern and it is why the first draw-call
readings (64, 137) were fiction.

## What is NOT measured yet

`FrameScheduler` deliberately stops the loop while `document.hidden`, and S1 established
rAF is suspended there anyway — so **an automated pane cannot produce real frame timing**.
The dev panel's `step 90 frames` drives frames manually, but three's scene pass caches
when the frame counter does not advance under synthetic time, so **stepped frames
under-report draw calls**. Trust `diagnose draw calls` (a clean single-frame measurement)
over the stepped stats readout.

Real fps, GPU frame time, and idle power all come from the visible-window session
alongside S4's compositor cost and S5's ghosting verdict.

## Zero-allocation policy

`FlyCamera` originally did `new THREE.Euler()` inside `#applyRotation`, which runs every
fixed step — ~60 allocations/second of pure garbage, against a "no GC pause over 10
minutes" target. It now reuses an owned Euler. Found by `knip`, not by reading the code.

A shared `ScratchPool` was written and then **deleted**: owned per-object members are
simpler and avoid the pool's "valid only until the next borrow of the same slot" hazard.
Revisit a pool only when a system genuinely needs many short-lived temporaries.

## Verified end of §1

Run these at the end of every phase — `typecheck` passing is not evidence the thing works.

| Path                                       | Result                                               |
| ------------------------------------------ | ---------------------------------------------------- |
| `pnpm build` (production)                  | passes, 7 routes prerendered                         |
| `pnpm check` (format + typecheck + lint)   | clean                                                |
| `pnpm knip`                                | no unused files or dependencies                      |
| Initial shell for `/`                      | **180 KB gz** (budget 200)                           |
| **WebGL2 fallback** via `/?webgl=1`        | full scene renders identically, 18 draw calls        |
| Tier switch low/medium/high                | renders immediately at each tier; low = 5 draw calls |
| Dispose / remount (navigate away and back) | exactly 1 canvas, no leaked context, no errors       |
| Resize (desktop -> tablet -> desktop)      | correct aspect, no zero-size GPU errors              |

`?webgl=1` forces the WebGL2 backend. The fallback ships to real users on older GPUs, so
it needs a way to be exercised deliberately rather than only on hardware that lacks WebGPU.

## Known gaps (deferred, not forgotten)

- **No LOD morphing between clipmap rings** — expect popping at ring boundaries when
  moving fast. The fix is a documented ~6 lines of TSL (lerp height between cell size and
  2× cell size across the outer 40% of each ring); it lands with the §2 terrain material.
- **Terrain height is evaluated analytically per vertex**, not from a baked texture. Fine
  at 5 octaves; §2 swaps in the `RGBA16F` bake.
- **No shadows in the scene yet** — S7 proved `CSMShadowNode` works; wiring it is §2.
- **`clipmapLevels` in `TIER_SETTINGS` is not applied** — the clipmap is built once.
- **`low` tier currently disables the post chain**, which was a diagnostic lever. Revisit
  when the real sacrifice ladder lands.

---

# §2 status — beach vertical slice

**Rendering is correct; the art-direction gate is not yet met.** Water, shadows, LOD
morphing and the lighting pass all work, and the blocking artifact is fixed. What remains
is composition and detail — the scene is currently readable but flat, and needs the
grass/scatter pass plus a per-scenery LUT before it is worth sitting in.

## Landed

- **Gerstner water** on its own clipmap (5 levels). Analytic sky reflection along the
  reflected ray, Schlick Fresnel, Beer–Lambert depth colour, shore foam.
- **Depth without a depth texture.** Because the heightfield is a pure function, water
  depth is `seaLevel - terrainHeight(x, z)` evaluated directly in the shader. Exact, no
  extra pass, and it sidesteps the transparent-depth-sampling and render-order problem
  entirely — normally the fiddliest part of water. It also gives a perfectly stable
  shoreline for foam for free.
- **CSM shadows wired in** (2 cascades, 140 m). Long raking shadows across dunes are the
  single biggest gain in sense of relief.
- **LOD morphing** between clipmap rings.
- **Art pass**: hemisphere fill instead of flat ambient, sun moved off-axis, sun
  intensity 14 -> 6, bloom 0.7 -> 0.28. The first pass was badly blown out.

## Fixed along the way

- **Wave moiré.** Short (4 m) waves sampled on coarse outer clipmap rings produced a
  diamond lattice across the bay. Waves now attenuate by wavelength/distance.
- **Shadow cost.** Terrain casting across 3 cascades hit 754k triangles/frame. Rings no
  longer cast (only the centre patch does) and cascades dropped to 2 -> 304k.
- **A bad fix of my own.** I briefly sank water vertices below the bed over land to force
  occlusion. That is wrong on a clipmap: outer cells are tens of metres wide, so one
  corner of a quad dropped 50 m while its neighbour stayed at 0, producing giant slanted
  polygons slicing through the scene. Opaque terrain already occludes water via the depth
  test; no geometric trickery is needed.

## RESOLVED — the black wedge was a hole in the clipmap

**Root cause: the centre patch was a plain `Mesh` while the rings are an `InstancedMesh`.**

The terrain material derives its world XZ from `positionWorld` _inside_ `positionNode`.
An `InstancedMesh` and a plain `Mesh` resolve that differently — instance matrix versus
object matrix — so the centre patch was transformed onto a different scale and rendered
somewhere off-screen. That left a 32 m square hole directly under the camera, which at a
7 m eye height projects to exactly the trapezoid that looked like a black wedge.

**Fix:** the centre patch is now an `InstancedMesh` with a single instance, driven by the
same instance-matrix path as the rings. Not a compensation — it removes the divergence.

### What actually found it

Four screenshot-based hypotheses were all wrong (shadow acne, deep-water colour, LOD
morphing, and — misread — the centre patch itself: removing it left the wedge, which I
took as exoneration when it should have made the hole _bigger_).

What worked was a **debug paint flag**: `?debug=water` tints water opaque magenta,
`?debug=terrain` tints terrain cyan and the centre patch orange. Three frames answered it:

1. `?debug=water` — magenta _outlined_ the wedge → the wedge is terrain, not water.
2. `?debug=terrain` — everything cyan **except** the wedge, despite an emissive override
   → not a shading bug; the geometry is absent.
3. centre patch coloured separately — no orange anywhere → the centre patch renders
   nowhere at all.

The flags are kept. Bisecting a rendering artifact from screenshots is guesswork;
"which mesh is that?" should be answerable in one frame.

### Also fixed

**Hydration warning.** `suppressHydrationWarning` on `<html>`/`<body>`. This is
principled rather than a silencer: `data-ui-polarity` is Tier 1 of the glass legibility
system, and the client sets it as soon as the scenery resolves — a server-rendered
attribute the client legitimately changes is exactly what the prop is for. `<body>` gets
it because extensions inject attributes there, producing unactionable warnings that train
you to ignore real ones.

---

## §2 follow-up — three reported issues

### 1. Black square flickering around the camera while moving

A _second_, distinct bug from the earlier static wedge. Each clipmap level snaps to its
own 2x-cell grid, so level L and level L-1 can sit up to one of L's cells apart. With the
hole sized exactly to the finer level's extent, that offset opens a crack — which reads
as a black square flickering around the camera as you walk.

**Fix:** the hole is now one cell _smaller_ than the finer level's extent, so the levels
overlap instead of abutting. The overlap is free — both levels evaluate the same height
function at the same world position, so the surfaces coincide exactly.

### 2. Could not tell sand from water

The two were at nearly the same _luminance_, and the water alpha ramp left shallows almost
invisible — exactly where the waterline needs to be clearest. Distinguishing them is a
hue-and-saturation job, not a brightness one: both sit at similar luminance under one sun.

- water: saturated turquoise shallows, alpha rises fast so any real depth reads as water
- sand: warm and clearly non-blue; the wet band narrowed so the beach is not uniformly muddy
- foam brightened and widened — the foam line is the clearest cue for where land stops

### 3. low / medium / high barely differed

They _were_ nearly identical, and worse than useless: `medium` and `high` differed only by
a shadow-map size that was **read once at startup and never reapplied**, and
`clipmapLevels` was declared but never used at all. Switching tiers did essentially
nothing, which hides the fact that the app cannot shed load.

Now every setting is applied on tier change via `#applyTierSettings()`, including
disposing the shadow map so a new `mapSize` actually takes effect. Measured:

| tier | draw calls | triangles |
| ---- | ---------- | --------- |
| low  | 6          | 243k      |
| high | 21         | 310k      |

`DEFAULT_CLIPMAP.levels` is 7 — one more than the highest tier uses, so the ladder has
somewhere to go. With it equal to the high tier's count, `medium` and `high` would render
identical geometry again.

### Also

- **Spawn is computed, not hardcoded.** `findBeachSpawn()` walks rays outward and finds
  the flattest outermost shoreline crossing. Scenery is parametric, so any literal camera
  position goes stale the moment a noise parameter changes — which is how several earlier
  guesses put the camera in open water.
- **Hydration warning fixed** — see the `suppressHydrationWarning` note in layout.tsx.

### Still blocking the art gate

The scene is now _correct_ and readable, but the near ground is a large untextured plane.
That is a **detail** problem, not a colour one: it needs the grass/scatter pass and sand
ripple detail. No further colour tuning will fix it.

---

## §2 realism pass — sand, sea, sky

### Aerial perspective is the load-bearing change

`sky.aerialPerspective(color, viewDir, distance, height)` blends every surface toward the
sky colour **in that exact view direction**. Because the sky is a pure function this is
nearly free, and it is what stops the horizon reading as a cut-out: distant terrain now
sits _in_ the air rather than being pasted on a gradient. Density falls off with altitude,
so haze pools at sea level and hilltops stay crisper than the shoreline behind them.

Applied in both the terrain and water materials, always last — everything before it is
surface, this is the air in front of it.

### Sky

A linear gradient is the tell of a fake sky. Air column depth grows roughly as
1/cos(zenith), so brightness and warmth rise sharply in the last few degrees above the
horizon and are nearly flat overhead — approximated with `pow(1 - up, 5)`, plus:

- a narrow low-lying **haze band** (`pow(1 - up, 22)`) — the pale strip real horizons have
- **sunset spill**: the sky warms toward the sun's azimuth, strongest low down
- the sun is **three lobes**, not one `pow`: a saturated core, a tight aureole, and a broad
  Mie forward-scatter glow. One lobe reads as a sticker. The broad glow is faded out below
  the horizon or it lights the ground from underneath.

### Sand

The beach read as untextured no matter how the colour was tuned, because sand is **micro
relief, not macro shape** — at 1.7 m eye height that is all you actually see. Colour
tuning could never have fixed it.

- **Wind ripples**: strongly anisotropic, aligned across the prevailing wind. Their
  directionality is most of what identifies the material.
- **Patchiness**: a low-frequency mask so ripples appear in _fields_ separated by swept
  areas. Uniform ripples everywhere read as corduroy — this was visibly wrong on the first
  attempt and the mask fixed it.
- **Grain** at a finer scale to break up the ripples.
- **Sparkle**: quartz grains catching the sun at grazing angles, masked to dry sand.
- Slight albedo variance from the same field — real sand is never one flat colour.

All of it fades out past ~70 m, where it would be sub-pixel and alias into shimmer. The
detail noise is seeded differently from the terrain noise; reusing the terrain seed would
correlate ripples with dunes and read as a repeating pattern.

### Sea

- **Micro-chop**: two high-frequency noise octaves perturbing the wave normal. Gerstner
  alone is glassy; capillary ripples are what break one mirror highlight into glitter.
- **Sun glitter**: a tight specular lobe over the chopped normal — the most recognisable
  feature of real water under a low sun, and impossible from the Gerstner normal alone.
- **Subsurface**: wave backs glow green when backlit, which is the cue that water has
  volume rather than being a coloured mirror.
- **Crest foam**: whitecaps by wave steepness, not only at the shore.

### Cost

21 draw calls, 335k triangles at `high` — unchanged in draw calls, +25k triangles from the
extra clipmap level. All the new detail is per-pixel ALU, no new passes or textures.

---

## The beach moment — seated figure watching the sea

The scene now opens on the resting pose from the plan: seated on the sand, facing the
sea, third person.

### The bug that had been hiding all along: there was no sea floor

Terrain height measured **exactly 0.00 for 160 m seaward** of the spawn — a perfectly
flat plane at sea level.

`islandMask` scaled terrain height _toward zero_, and zero **is** sea level. So beyond
the island falloff the world was a plane sitting exactly at the waterline. Water depth is
`seaLevel - bed`, so depth was 0 everywhere, alpha was 0, and the water rendered fully
transparent. **No amount of water shading could ever have produced a visible sea.**

Fix: `HeightSpec.seaFloorM` (−16 m), and the mask now blends terrain _toward the sea
floor_ rather than toward zero — mirrored in both evaluators, per the S2 contract.

This also explains earlier confusion: turquoise water was visible _near_ the island,
where noise dips below zero, but the open ocean was always dry.

### Other fixes from the same session

- **`beachBandM` is now a spec parameter.** The beach flattening band was hardcoded to
  `heightScale * 0.25` ≈ 10.5 m of elevation, which produced a salt flat kilometres wide.
  2.4 m gives an actual beach. Both evaluators read the spec.
- **`FlyCamera.setOrientation()`.** Assigning `.yaw` / `.pitch` after construction did
  nothing until the next simulation step, because the quaternion is only rebuilt in
  `step()`. On the first frame no step has run, so the spawn orientation silently
  rendered with the constructor's values — the camera faced 180° away from its subject.
- **Spawn faces the sea properly.** `findBeachSpawn` locates the true waterline and sets
  back 3.5 m, then derives facing from the terrain gradient (the local shoreline normal)
  — but only when that broadly agrees with "away from the island". Downhill alone points
  into bays and aims the figure back at land across the water.

### The figure

`SeatedFigure` is procedural primitives merged into one geometry: one draw call, no
skinning, gentle whole-body breathing (8 mm over ~4.5 s) rather than a skeleton.

**It is a placeholder for the authored GLTF, deliberately.** What needed designing was
the _moment_ — camera height, how much frame the horizon gets, how the silhouette reads.
All of that is judgeable from a correct silhouette and none of it should wait on an
asset. Arms wrap forward around the shins because from behind — the only angle this shot
shows — arms held out to the sides read as a blob with sticks.

Cost: 24 draw calls, 341k triangles.

## §2 gate close-out: scatter + grade

The plan's §2 gate ("it looks beautiful standing still") was explicitly marked NOT MET
after the beach-moment work: materials were believable but the island was bare ground.
Two pieces closed it — a scatter pass, and a final grade.

### Scatter (`engine/terrain/Scatter.ts`)

One generic placement function, `scatterInBand`, parameterised by elevation band and
slope band. It scans a jittered candidate grid over a disk, rejects most of it on a
single cheap `sampleHeight` (open sea, mountainside), and only pays for per-instance
placement inside accepted cells. A gradient-noise "clump field" (same permutation-table
noise as terrain, different seed salt) makes density patchy rather than uniform — real
ground cover grows in clumps, not a grid.

Determinism matters here even though there is no CPU/GPU parity requirement (this is
decoration, not collision) — a page reload must not reshuffle the beach. Everything runs
off a small integer hash (`hash01`), never `Math.random`.

Three consumers, one function:

- **Grass** (`tsl/foliage/grassMaterial.ts`): ~40k instances of a 2-triangle crossed
  blade (no texture, no alpha test — at this instance count alpha-tested overdraw would
  cost more than just drawing more triangles). Wind bend is TSL: a travelling sine wave
  sampled at the blade's world XZ, weighted by `positionGeometry.y` (0 at root, 1 at tip)
  so roots stay planted. Root-to-tip color gradient echoes the terrain's own wet→dry sand
  read, so grass and ground agree about where "dry" starts.
- **Rocks** (`tsl/foliage/rockField.ts`): ~850 instances of one `IcosahedronGeometry`,
  non-uniformly scaled per axis for shape variety. Originally gated to steep slopes only
  ("cliffs are rock", matching `terrainMaterial`'s albedo split) — that produced **zero**
  instances, because Kamakura Bay's terrain is gentle dunes end to end and never gets
  that steep anywhere reachable. Dropped the slope gate; boulders sit on any grade now.
- **Palms** (`tsl/foliage/palmField.ts`): ~41 instances, sparse and clumped (`patchThreshold
0.55`) so they read as small groves, not a hedge. Same placeholder philosophy as
  `SeatedFigure`: primitives merged into one geometry, trunk and fronds told apart by a
  baked vertex-colour attribute rather than a second material. Frond sway reuses the same
  wind function as grass, driven by the same local-Y trick.

All three respect a new `TierSettings.foliage` flag — off on `low`, on elsewhere — since
thousands of small instances are exactly the kind of cost the tier ladder exists to shed.

**Two bugs caught before this rendered anything:**

- `mergeGeometries` (used by `palmField`'s trunk+frond merge) silently returns `null` —
  logged via `console.error`, not thrown — if the input geometries don't share an
  identical attribute set. The hand-built frond geometry had no `uv`, and `CapsuleGeometry`
  is indexed while the frond wasn't; both had to match before the merge would succeed.
- Every material that renders into the scene pass must write **both** MRT targets
  (`output` and `emissive`) once bloom is on, or WebGL/WebGPU rejects the draw with
  "missing fragment shader outputs". `terrainMaterial`, `waterMaterial`, and the seated
  figure already did this (`material.mrtNode = mrt({ output, emissive: vec4(0,0,0,1) })`)
  — grass/rock/palm materials didn't, and only failed at runtime, not typecheck.

### Grade (`render/colorGrade.ts`)

The plan calls this `Lut3DNode`. A 3D LUT needs an authored graded reference frame — a
still, pushed through a real grading tool — which does not exist yet. Shipped an
analytic grade instead: lift the black point (AgX's true-zero shadow cores read as a
hole, not shade), a small contrast curve, a shadows-cool/highlights-warm split tone, and
a saturation push (AgX desaturates more than the eye compensates for). Plus animated
screen-space film grain, strength tuned to be felt rather than seen. A few ALU ops on the
already-AA'd frame; swapping in a real `Lut3DNode` later replaces this function's body
and nothing else.

Verified via the WebGL2 fallback path (`?webgl=1`) — this sandbox's browser preview has
no WebGPU — build/typecheck/lint/knip clean, no console errors, and a temporary
yaw-flip on the spawn camera (reverted after) confirmed grass/rocks/palms actually render
along the dune ridge rather than just producing a non-zero instance count.

## Water depth read: why tuning `deep`/`absorb` alone did nothing

User feedback after the scatter pass: the sea should look deeper. First attempt — darken
`deep`, steepen the depth-absorption curve, push `seaFloorM` from -16 to -30 for more real
depth range further from shore — produced **no visible change at all**, screenshot after
screenshot, despite the served bundle visibly containing each edit (checked by fetching
the compiled chunk and grepping for the new literals).

Root-caused by isolating terms rather than guessing further: temporarily forcing
`material.colorNode = vec4(bodyColor, 1)` (skipping reflection entirely) immediately
showed exactly the intended rich shallow-to-navy gradient. So `bodyColor` was never the
problem — the reflection/Fresnel mix was overwriting it almost everywhere:

1. **`skyRadiance` is deliberately HDR.** Its mie forward-scatter term alone is
   `sunIntensity` (12) scaled, meant to bloom when the sky is seen directly. Water reused
   it unclamped for the general ambient reflection, so any camera looking roughly toward
   the sun's half of the sky picked up multiple-units-bright colour across a wide swath of
   the surface, not just at the sun-glint. Fix: clamp `skyRadiance(reflectDir)` to LDR
   before mixing — the dedicated sun-glitter term (a tight `pow(_, 340)` lobe, added
   separately) is where real brightness belongs.
2. **AgX's tonemap shoulder compresses a wide range of bright inputs toward similar
   output.** Even an HDR clamp that looked "reasonable" (1.05) was still bright enough to
   land in that compressed zone and wash out against `bodyColor`'s much lower range after
   tonemapping. Had to clamp much lower (0.55) than intuition suggested.
3. **At this camera's near-level, seated framing, Fresnel's `cosTheta` sits at ~0.02 from
   geometry alone** (camera forward is almost exactly horizontal — worked out directly
   from spawn/camera vectors, not assumed). Micro-chop swings it across roughly [0, 0.18]
   before the `clamp(0,1)` floor eats the rest, so **half the visible surface at any
   instant is pinned at the Fresnel cap**, not on its falloff curve. That makes the cap
   itself — not the exponent, not the curve shape — the dominant knob. Physically
   "honest" caps (0.8–0.98) mix in that much reflection over half the frame; needed 0.25
   to let `bodyColor` actually read.

All three had to move together — clamping brightness alone still lost to the tonemap
shoulder; lowering the Fresnel cap alone still blew out once cosTheta clamped to 0. Also
reordered Fresnel/reflection to use the **chopped** surface normal instead of the smooth
Gerstner one (they were computed in the wrong order in the first pass) — using the smooth
normal meant Fresnel had almost no per-pixel variance at all, since chop is precisely what
puts some facets at a steeper effective angle than the macro surface.

## §3: standing up, `CharacterController`, `CameraRig`

The character work the plan describes: `CharacterStateMachine`, a kinematic capsule, and
the one spring-arm camera (1P is `armLength -> 0`). Landed as a straightforward layer on
top of the existing sit-shot rather than a rewrite of it.

**`FlyCamera` is gone.** Its own doc comment from §1 named the exact condition for its own
retirement — "the real one is a single spring arm... which lands with the character in
§3" — so once `CameraRig` existed there was nothing left for it to do. Deleted rather than
kept as a debug/spectator mode: `pnpm knip` would have flagged it unused the moment nothing
called it, and the state machine's `stand` mode plus the 1st-person toggle already cover
every exploration need `FlyCamera` served during development.

**The sit shot bypasses `CameraRig`'s orbit math entirely.** It would be tempting to
express the sit framing as a `CameraRig` configuration (some pivot + armLength + yaw), but
that shot was hand-tuned against a specific position offset, and re-deriving it from the
orbit formula means keeping two unrelated things — the tuned offset and the orbit
parameters — in agreement instead of one. Simpler: store the sit camera's exact
position + quaternion once in `init()`, and while `state === 'sit'`, `#frame()` just
`copy()`s them onto `cameraRig.camera` every frame instead of calling `cameraRig.step()`.
Standing up switches to the real orbit.

**Look deltas must be drained every step regardless of state, not just while standing.**
`InputMap` accumulates `lookDX`/`lookDY` on every `pointermove` — it has no idea the
character is sitting — and only `sample()` clears them. Early version only called
`sample()` inside the `stand` branch; skipping it while sitting would have dumped an
entire sit-viewing session's worth of accumulated mouse movement onto the camera the
instant you stood up. Fixed by sampling unconditionally every fixed step and only _acting_
on the result conditionally.

**Edge-triggered input needed a new primitive.** `InputMap.sample()` returns continuous
key state — correct for movement, wrong for "stand up" or the 1P/3P toggle, which are
discrete one-shot transitions. A continuous check would refire every fixed step the key
stays held (and a frame can run several steps at once after a stall). Added
`consumeJustPressed(code)`: a `#justPressed` set populated on `keydown` (guarded by
`!e.repeat`, so OS key-repeat doesn't refire it) and drained on first read.

**Two static meshes, not a pose blend.** `SeatedFigure` and the new `StandingFigure` are
both non-skinned merged-primitive geometries, same placeholder philosophy. The state
machine swaps _visibility_, not a blended pose — there is no skeleton to blend between.
Swapping in a real animated rig later replaces both files and the visibility toggle with
one skinned mesh; nothing about the state machine or controller changes.

**First-person costs nothing extra to get right.** `CameraRig`'s position is always
`pivot - forward * armLength`, so 1st person isn't a separate code path, it's `armLength`
animating to 0 — the camera lands exactly at the eye pivot. The standing figure's own head
mesh doesn't occlude the view in 1P: the camera sits inside the head sphere, and standard
backface culling means its interior faces simply don't render. Verified visually, not
assumed — confirmed via the WebGL2 fallback with `V` toggling to first person.

Verified via `stepFrames` + `consumeJustPressed`-triggering key dispatches (this sandbox's
document is always `hidden`, so real-time input driven by mouse/keyboard on the live RAF
loop can't be exercised — everything here goes through the synthetic 60Hz timeline
instead): stand-up transition, ~3m of WASD movement confirmed via `diagnose`'s
`figurePos` delta matching `WALK_SPEED` × elapsed time, and the 1P/3P toggle, all screenshot-
confirmed on the WebGL2 fallback. `pnpm check`/`knip`/`build` all clean.

## §3 follow-up: three real user-reported bugs, and prop collision

First live playtest (real hardware, not this sandbox) surfaced three problems the
synthetic-frame-stepping verification above never would have caught — none of them were
exercised by `stepFrames`, because all three are about what happens _before_ standing up,
or about a sign convention that only bites when the input actually varies at runtime.

**W and S were backwards.** `CharacterController` computed movement-basis "forward" as
`(sin(cameraYaw), cos(cameraYaw))` — the `spawn.yaw` _facing_ convention. But `cameraYaw`
feeds a camera quaternion, where forward is -Z, the opposite sign. Pressing "forward"
walked the character toward the camera. Confirmed by hand: at the actual spawn/camera
values, the bug's forward vector worked out to almost exactly the _inland_ direction where
the real camera view direction was seaward — i.e. provably backwards, not just "feels
off". Fixed by negating; `right` was already correct (its derivation didn't reuse the
facing convention).

**Standing up required a `Space` press the player had to discover.** Fine for scripted
verification, bad UX blind. Changed to: any WASD key while seated both stands the figure up
and starts walking on that same input. The `state === 'sit'` guard on the check means it
can only fire once — after the first frame it flips, and the block stops matching.

**The sit camera was completely locked — no drag-to-look at all.** The first version
special-cased sitting as a fixed position+quaternion, replayed every frame, specifically so
the hand-tuned composition wouldn't need to be re-derived from `CameraRig`'s orbit formula.
Whatever the original design intent, it read as "the app is frozen" to an actual player.
Rewritten: sitting now just is a `CameraRig` orbit too, at a shorter `SIT_ARM_LENGTH`
(1.8m, matching the old fixed shot's ~1.82m offset magnitude) around the seated eye point
(`spawn.y + SEATED_EYE_HEIGHT` — first real use for that constant, previously dead per
`knip`). One consequence worth knowing: the immediate-apply-on-init hazard
(`FlyCamera.setOrientation`'s doc comment, restated in `CameraRig`) applies here too —
`cameraRig.step()` is called once by hand in `init()`, with a zeroed `InputFrame`, so the
very first render (before the fixed-step loop has run) still shows the right shot instead
of the constructor's default camera transform.

**Prop collision.** Rocks and palms now export their scatter instances as collision
circles (`Scatter.ts`'s `collidersFromInstances`, radius derived from each instance's own
scale so a stretched rock's collider roughly tracks its stretched mesh) and
`CharacterController` pushes the character out of any it's overlapping, brute-force over
all ~850 of them every step — cheap at this count, no spatial grid needed yet. Grass is
exempt on purpose: tens of thousands of blades, no gameplay reason to block movement
through ground cover.

**A verification-tooling note, not an app bug:** while chasing these, one long-lived
browser tab in this sandbox threw `Private field '#resolveCollisions' must be declared in
an enclosing class` — a private-field class-brand mismatch, which happens when a class
gets hot-reloaded while an instance built from the _previous_ version of that class is
still alive. A fresh tab never reproduced it. Real users reloading a page don't hot-reload
the same page dozens of times in a row while the source changes under them, so this is a
dev-loop artifact of this session, not a production concern — but if a future report says
"private field" or "enclosing class", check for a stale HMR session before assuming a real
regression.

## §4: footprints, and reinterpreting "swash" before it got expensive

`SandField.ts` (+ `sandBox.ts` for the shared world<->UV mapping). Two `RG16F` 2048²
targets, ping-ponged: R is footprint depth, G is wetness. Terrain samples the live one via
a `texture()` node whose `.value` gets reassigned each frame (`setSandTexture`) — same
"build the node once, mutate what it points at" pattern water's `time` uniform already
uses, just for a texture instead of a float.

**Both passes bypass the camera entirely.** The decay pass (a fullscreen quad) and the
stamp pass (footprints + shoreline wetness, as small instanced quads) compute clip-space
position by hand from `worldToSandUV`, not from a camera's view/projection matrix. An
ortho "shadow-map-style" camera would also work, but it would be a _second_ independent
place the world<->texture mapping has to agree with itself, and getting a render-target
Y-flip convention wrong between backends was a real, live risk here — one manual mapping,
reused by the writer and every reader, cannot drift from itself.

**"Swash writes wetness" does not literally sample terrain height per texel.** The plan's
phrasing reads as: for every one of this target's 4.19M texels, every frame, evaluate the
5-octave terrain height function to know if that texel is at the waterline. Concretely
priced out before writing it: multiple noise octaves × 4.19M × 60fps, for an app whose own
budget is 8-10ms total and whose quality ladder exists specifically to shed cost before it
reaches the GPU fan. Not viable. Substituted a static ring of ~48 wetness-only stamps,
traced once at construction along the actual shoreline (literally the same ray-marching
`findBeachSpawn` already does to find one point, just keeping every crossing instead of
the best one) and re-stamped every frame exactly like a footprint — same mechanism, same
64-quad budget the plan named for stamps generally, none of the per-texel cost. The
shoreline is static geometry; it only ever needed finding once.

**A real accumulation bug, caught by testing the "stand still" case specifically, not by
walking around and eyeballing it.** First version blended stamps with `AdditiveBlending`.
Every overlapping stamp _sums_ — stand in one place, or walk slowly enough that
consecutive frames' footprints overlap, and the depth climbs every single frame with no
ceiling, because the decay pass's `.min(MAX_DEPTH)` clamp only clips what was already
there _before_ that frame's new stamp lands, never the post-stamp total. Switched to
`THREE.CustomBlending` with `MaxEquation`: a real footprint has one depth regardless of
how many times roughly the same spot gets pressed, and MAX is the blend mode that actually
encodes "one depth," not "keep adding." Had to fix the color output at the same time —
`instanceColor` only ever carries 0..1-ish factors (pressure, wetness strength), so the
stamp shape itself needed pre-scaling into metres (`falloff * MAX_DEPTH`); left unitless,
a single full-pressure stamp would have peaked at depth 1 rather than the intended 0.08,
even after the blending fix.

**No separate "raised rim" term.** The plan calls for depression depth, a normal
perturbation, wet albedo, _and_ a raised rim as four things. Implemented as three: a
2-texel central difference on the depth channel feeds the terrain's normal directly
alongside the existing macro/detail normal blend, and the rim — the highlight/shadow at a
footprint's edge that actually sells it as a depression — is the lighting response that
gradient produces for free. A separately-computed rim term would have produced the same
pixels for more shader code.

**Confirmed structurally, not just by testing, that sand never feeds back into
collision**: `CharacterController.step()` only ever calls `sampleHeight` (the CPU
heightfield) to ground the character. It has no reference to `SandField` at all — there
is no code path by which a footprint could affect where the character's feet land, so
there is nothing to regress later by accident.

Verified: build/typecheck/lint/knip clean; the WebGL2 fallback renders without console
errors before and after; a `colorNode` override that displayed the raw sand texture
directly (`vec4(depth*15, wetness, 0, 1)`) showed a visibly lighter band exactly along the
waterline, confirming the shoreline-wetness path end to end. The footprint path shares
every line of that same code (same shader, same blend fix, same `MAX_DEPTH` scaling) but
wasn't independently isolated the same way — reasonable confidence from shared code, not
an independent visual confirmation.

## §5, first slice: boot dissolve + HUD chrome (no audio, no assets)

Scoped deliberately narrow. §5 bundles product layer, audio engine, and comfort settings
under one heading, but those are three different kinds of work — audio specifically needs
sourced/licensed assets before there's anything to wire up. This pass is the pure-code
slice: `BootDissolve.tsx`, `hudStore.ts`, `useHudActivity.ts`, `HintLayer.tsx`.

**No Zustand.** The plan names it for the hint ledger. `useSyncExternalStore` is the same
subscribe/snapshot shape a store like that boils down to internally — a real dependency
wasn't worth adding for state this small (a hide-all flag and a few show-counts).

**The boot dissolve has no real poster.** The plan's version is a pre-rendered AVIF shot
from the exact spawn camera pose. That needs an asset pipeline — render a still from the
app itself, encode it, keep it in sync whenever the scene changes — that does not exist
yet. Shipped the same _shape_ of boot (no spinner, no percentage, a hairline + a
place-and-hour line, cross-dissolving into the live canvas once `ready` fires) with a
gradient standing in for the photo. The gradient reuses the sky's own zenith/horizon
colours from `atmosphere.ts` rather than picking arbitrary ones, so it is at least
foreshadowing the right sky.

**Two `react-hooks/set-state-in-effect` lint errors, both from the same mistake.** First
drafts of `BootDissolve` and `HintLayer`'s `FadingLine` each had a piece of state
(`fading`, `mounted`) that was set _synchronously inside an effect_ the moment a prop
flipped true — exactly the "adjust state when a prop changes" pattern React's own docs
call out, but done inside `useEffect` rather than during render. Fixed two different ways:

- `BootDissolve`: `fading` was never independent state at all — it IS `ready`, one render
  late would only cost an extra frame with no transition playing. Deleted the state,
  used `ready` directly for the opacity. Only the _delayed unmount_ (via `setTimeout`,
  inside the effect but not synchronous) genuinely needed to stay in an effect.
- `HintLayer`'s `FadingLine`: tried the React-docs-sanctioned fix next — compare against a
  ref of the previous prop value during render, and write the ref + call `setState`
  synchronously if it changed, all _outside_ any effect. This project's lint config
  rejects that too (`react-hooks/refs`: no ref reads or writes during render, a stricter
  rule than vanilla React ships, presumably tuned for the React Compiler's assumptions
  about refs being effect-only). Ended up not needing local "mounted" state at all: the
  component never unmounts, it just sits at `opacity: 0` — a single `pointer-events-none`
  paragraph costs nothing left in the DOM permanently, and CSS handles the whole
  transition without any React state.

**A real bug in the hint ledger, only surfaced by adding temporary store-level logging.**
After standing up, the "WASD to explore" hint appeared to survive an `H` hide/show
round-trip instead of staying retired. Looked first at the ledger logic — correct on
reading. The actual cause: `stats` events (which is what tells `HintLayer` the character
stood up) only fire when 500ms of _real_ wall-clock time has elapsed inside `#frame()`
(`Engine.ts`), and `stepFrames`'s synthetic 90-frame batches run fast enough in real time
that a single click often doesn't cross that threshold — so `markHintDone('stand-up')`
hadn't actually fired yet by the time the hint looked hidden. What actually hid it was
`useHudActivity`'s ambient fade (8s idle), and pressing `H` counts as input, which reset
that timer and revealed the still-`active` (never-retired) hint again. Confirmed by
temporarily logging every store `set()` call: exactly one `activeHint: 'stand-up'`, then
nothing, until one more `stepFrames` click produced the `hintDone` write. Not a ledger
bug — a `stepFrames`-vs-real-time artifact of this specific verification method, but it
took instrumenting the store (not just reading it) to tell the two apart with confidence.

Verified: build/typecheck/lint/knip clean. In-browser, in order: boot gradient caught
mid-dissolve on a fast screenshot, then confirmed fully resolved a moment later; the
stand-up hint appearing on the first `pointermove` while seated (checked via computed
`opacity`, not just DOM text — `FadingLine` never unmounts, so text presence alone proves
nothing); the hint's `opacity` reaching exactly `0` once `characterState` reached `stand`;
`H` hiding the dev panel and showing its own one-time toast (`opacity` confirmed via
`getComputedStyle`, since the same always-mounted pattern applies); `H` again restoring
the panel with the stand-up hint correctly still retired.

## §5, second slice: the audio engine

Native Web Audio, per the plan — not Howler, for the same reason the plan gives: bus
routing and a ducking chain need real graph control. `lib/audio/`, not `engine/`: it's
framework-free either way, but the plan's own tree puts it there, and `Engine.ts` (in
`engine/core/`) is allowed to import it — the ESLint rule blocks react/next/zustand and
`@/components/*`/`@/services/*` imports _from inside_ `engine/`, not "anything outside
engine/ that engine/ imports." `lib/audio/context.ts` still stays react-free on principle,
so that guarantee holds by construction and not just by lint passing.

**Bus graph** (`buses.ts`) matches the plan's diagram exactly: music/ambience/ui/world
buses, duck gains, a `waterFilter` lowpass, master, limiter (`DynamicsCompressorNode`,
threshold −18dB, ratio 16). `waterFilter` and the `duck()` helper have no live caller —
nothing in v0.1 puts the camera underwater or triggers a ducking event (that's the
thoughts feature, §6/7, not built yet). Built anyway because the checklist line is "buses,
limiter, faders, crossfade" as infrastructure, not "wire up every consumer" — same
category as `ARM_LENGTH_3P` or `RIG_HEIGHT` being exported before anything used them.

**Generative music** (`generative.ts`): Tone.js, `Tone.setContext(ctx)` onto _our_
context before creating any Tone node — skipping that gives Tone its own `AudioContext`,
silently invisible to the limiter. D lydian pentatonic, 6–14s randomised gaps, long
attack/release/reverb. Owned output, zero licensing, doesn't loop.

**CC0 assets** (`licenses/AUDIO.md`): waves, wind, footsteps, gulls, all from
OpenGameArt.org, all confirmed CC0 on-page before pulling. Re-encoded FLAC/WAV → MP3
(`ffmpeg`/`libmp3lame`) for one consistent, universally-decodable format instead of a
mix of containers. Deviated from the plan's example list on purpose: swapped "cicadas"
for gulls — Kamakura Bay is a dawn coastline with no treeline, and cicadas are a summer-
forest sound. The wave recordings turned out to be individual crash one-shots, not a
loop, so they became the shoreline's positional emitters instead of a bed; the wind loop
took the bed role instead.

**Shoreline emitters reuse `SandField`'s ray-marched shoreline points** — it already
traces the waterline once at construction for the wetness ring (§4); tracing it again for
audio would be the same computation run twice for two different consumers. Capped to 8
concurrent `THREE.PositionalAudio` (HRTF is per-source convolution — expensive), picked by
evenly-spaced index into the ring rather than nearest-to-camera, since the ring already
spans the coastline at even angular spacing.

**Autoplay pill, and a bug the plan's own model didn't cover.** The plan says: build the
context eagerly, never `play()` while suspended, show a pill, one click fades the bed in.
The implicit assumption is that a context is _always_ born `suspended` and _only_ becomes
`running` via our own `resume()` call. That's false on a high-media-engagement origin
(this dev box, after enough manual testing on `localhost` in one sitting) — Chrome handed
back a context that was already `running` at construction, with no `statechange` event to
observe, because there was no transition (it was never suspended to begin with). The first
version of `AudioEngine` only started playback inside `unlock()`, so on that path the
context was audibly "on" while nothing was actually playing — the pill would eventually
report unlocked (wrongly, since nothing had called `unlock()`) or never report it at all,
and either way, silence. Fixed by making `#tryStart()` the single source of truth,
called from three places: the explicit `unlock()` gesture, the `statechange` subscription
(for a real suspend→resume), and once unconditionally right after construction (for
"born already running"). Idempotent, so no ordering between the three matters.

**Two real, pre-existing bugs in `SandField.ts`, found only because this was the first
time anything drove a full cold `init()` through the WebGPU backend in this environment**
(prior verification in this repo's history ran through the `?webgl=1` fallback — a
leftover tab from that made it obvious in hindsight). Neither is audio's fault, both
blocked rendering entirely, so both got fixed to be able to verify anything at all:

1. `SandField`'s decay/stamp passes rendered with `new THREE.Camera()` — the _base_
   class, which has no `updateProjectionMatrix()`. `WebGPURenderer._updateCamera` calls it
   unconditionally the first time it sees a camera whose `coordinateSystem` bookkeeping is
   stale, which is every fresh camera. WebGL2's renderer has no such check, so this was
   silent there — every previous verification pass that used `?webgl=1` would never have
   hit it. Fixed by using `THREE.OrthographicCamera` instead — still fully bypassed by
   `positionNode`, just a class that satisfies the renderer's bookkeeping.
2. The blur's two neighbour-tap `texture()` nodes were built once at construction against
   `targets[1]` and never updated again — only `#prevTextureNode`'s `.value` got swapped
   each frame. On the very first `update()` call (`writeIndex = 1`), that meant sampling
   `targets[1]` as a read _while the same call renders into `targets[1]` as the write
   target_ — WebGPU validates that hard (`GPUValidationError`: texture used as
   `TextureBinding` and `RenderAttachment` in the same pass) where WebGL2 just produces
   undefined-but-not-fatal output. Fixed by giving the two neighbour taps their own
   tracked nodes, swapped alongside `#prevTextureNode` every frame.

**Found but not fixed, flagged separately**: this browser build (`Chrome/148`, clearly a
dev/canary-track Chromium) fails WGSL compilation for every `MeshStandardNodeMaterial`/
`MeshBasicNodeMaterial` using `mrt()` output — `"structures must have at least one
member"` in the generated `OutputType` struct — which blacks out the entire scene under
WebGPU specifically. Also a `WebGL: INVALID_ENUM: blendEquationSeparate` warning (non-
fatal) on the WebGL2 path, likely from `SandField`'s `CustomBlending`/`MaxEquation` stamp
material. Both look environment/three-version-specific rather than caused by anything in
this change, both are outside audio's scope, and the MRT one is a real three.js WebGPU
backend investigation, not a quick fix — logged for its own pass rather than absorbed
into this one.

Verified: build/typecheck/lint/knip clean (same pre-existing unused-export set as always,
plus the new bus/crossfade infra functions with no caller yet, expected per above). In
browser (via `?webgl=1`, since the WebGPU MRT bug above blocks the default path in this
environment): fresh-tab cold load reaches a rendered beach with no console errors from
anything under `lib/audio/`; `AudioContext` reaches `running` and the ambience/music bus
gains ramp to `1` within the fade window; the pill's `opacity`/`aria-hidden`/`tabIndex`
all flip correctly once unlocked, via both the explicit click and the "already running at
construction" path; dispatching a synthetic `KeyW` and stepping 180 frames moves the
character ~3.8m with no errors from `FootstepPlayer`, `ShorelineEmitters`, or
`GullEmitter` during real per-frame `update()` calls.

## §5, third slice: comfort settings

**Camera damping is new, not a rename.** Before this, `CameraRig.step()` applied mouse
look 1:1 — `yaw`/`pitch` were both "the raw accumulated input" and "what the camera
renders" in one field, updated instantly. Adding a "snappy ↔ floaty" slider needs those
to be two different things: a raw target that mouse motion accumulates into
(`#targetYaw`/`#targetPitch`), and the public `yaw`/`pitch` that damps toward it and is
what actually gets rendered _and_ what movement is computed relative to (so the character
never walks toward a direction the camera hasn't visually caught up to yet). `damping=0`
collapses the two back to the exact pre-existing instant-response behaviour — this is a
strict superset, not a behaviour change at the default-off end. Reused the same
shortest-angular-distance trick `CharacterController`'s turn-to-face already uses
(`atan2(sin(delta), cos(delta))`) for the yaw wraparound — a plain lerp across the
±π seam spins the long way round.

**Reduced motion touches the shader graphs directly, not a wrapper.** Wave amplitude and
foliage sway were both _baked-in JS number literals_ inside the TSL graphs
(`w.amplitude` multiplied directly into the Gerstner sum; `strength` multiplied directly
into `windOffset`'s bend), with no live uniform to turn down later. Added exactly one
`uniform(1)` "amplitude scale" to each — multiplied into water's `c`/`s` (every
position/normal term downstream is linear in those, so one multiply scales displacement
_and_ slope together) and into `windOffset`'s `bend` (shared across grass and palms, so
one call turns down both instead of needing per-field wiring). `Engine.ts` reads
`prefers-reduced-motion` once at init and stays subscribed for the life of the engine —
the contract holds if the OS setting changes mid-session, not just at load.

**Comfort's shared constants live in a leaf module, not next to the code that uses
them, on purpose.** `CameraRig.ts` needs `MIN_FOV`/`MAX_FOV`/`DEFAULT_DAMPING`/
`MAX_DAMPING` to clamp; `comfortStore.ts` (imported directly by a HUD component,
_outside_ the dynamic-import boundary `EngineCanvas.tsx` draws around `engine/core/Engine`
specifically to keep the three.js chunk out of the initial bundle — S1) needs the same
numbers for slider ranges. The first version had `comfortStore.ts` import them straight
from `CameraRig.ts` — which passed typecheck and lint, but transitively pulls
`three/webgpu` into a component that renders unconditionally in the HUD tree, silently
undoing the exact bundle split `EngineCanvas.tsx`'s own comment calls out. Moved the
five numbers into `lib/comfort/limits.ts` — no three.js, no React — and had both sides
import from there instead. Same fix shape as `lib/audio/context.ts` being react-free so
`engine/` can import it: the _file_, not just the lint rule, has to stay off the
three.js/React graph for the boundary to mean anything.

**Comfort commands can arrive before `#cameraRig` exists.** `EngineCanvas` hands React a
live `command()` as soon as `new Engine()` returns, not once `init()` finishes — that's
deliberate (`setTier`/`setTargetHz` already relied on it, touching fields assigned in the
constructor). `setFov`/`setDamping` touch `#cameraRig`, which is only assigned inside
`init()`. Guarded with `this.#cameraRig?.setFov(...)` rather than making the settings UI
wait for `ready` before it's allowed to render — `ComfortSettings` re-syncs its stored
values in a `useEffect` keyed on `ready` anyway, so an early dropped command isn't lost,
just applied a beat later once the engine catches up.

**Head bob has no code anywhere** — not implemented, not stubbed, not a disabled toggle.
The plan's own framing ("the #1 nausea trigger, adds almost nothing") reads as a decision
not to build the feature at all, not a request for an OFF switch on top of it.

Verified: build/typecheck/lint/knip clean. In-browser: the comfort gear opens a panel with
two range inputs; dragging FOV to 90° updates the label immediately and visibly widens the
rendered view (checked via before/after screenshot, not just the label — a slider that
updates its own text but never reaches the engine would look identical from the DOM);
persists across the `useSyncExternalStore` + `localStorage` round-trip. Damping verified
by code inspection and the shared-formula reasoning above (Kamakura Bay's spawn look is
static enough that a _visual_ snappy-vs-floaty difference needs active mouse drag to see,
which is harder to script reliably than the FOV check) — worth a manual pass before this
ships past prototype.

## §6, local thoughts: composer, lanterns, calm limiter

Local-only, per the plan's own scoping for v0.1 — one author (`'local'`), no server, no
daily quota ("solo rooms have no quota, there is nobody to spam"). `engine/thoughts/
ThoughtField.ts` owns drift/rise/decay/the calm limiter as a plain framework-free class;
`Engine.ts` drives it every frame the same way it drives `SandField`, and exposes a pull
method (`getLanternProjections`) rather than pushing through `EngineEventBus` — that
channel is "a few times a second, never per frame" by design (see `stats`'s own doc
comment), too coarse for a lantern that's meant to visibly drift.

**A real bug, caught only by testing the _second_ post, not the first.** The composer's
`submit()` originally refused to send while `authorCooldownS() > 0`. That reads as
reasonable — "don't let the user post while cooling down" — but it's wrong: the cooldown
is about when `ThoughtField` _blooms_ a pending post, not whether one can be queued at
all. Blocking the send meant a second thought typed while the first was still live never
even reached `ThoughtField.post()`, so it never joined the pending queue and just
vanished when the user gave up and closed the composer. Posting must always succeed;
only blooming is rate-limited. Fixed by dropping the cooldown check from `submit()`
entirely — `ThoughtField.post()` was already correct, unconditional, and had been since
it was written; the bug was purely in the UI second-guessing it.

**Verifying this needed the engine's own deterministic step tool, not wall-clock waits —
and figuring that out took a wrong turn first.** Posting two thoughts back to back and
checking a live-updating debug snapshot showed the _first_ stuck in the pending queue
immediately after sending, with `live: []` — looked exactly like a promotion bug. It
wasn't: this browser pane throttles `requestAnimationFrame` between tool calls when
nothing is actively driving the page, so real `wait()` calls do not correspond to real
engine-clock time — a whole `ThoughtField` instance can sit at `clock ≈ 0.1s` after
several seconds of wall-clock waiting. The engine already ships a purpose-built escape
hatch for exactly this class of problem — `stepFrames`, a synthetic 60Hz timeline
documented as existing because "rAF is fully suspended while `document.hidden` (S1), so
an automated harness has no other way to exercise motion." Switching the whole test to
drive `stepFrames` (temporarily shortening `DECAY_S`/`RISE_S`/`FADE_OUT_S` to make a
90-second cycle observable in a few clicks, then restoring them) reproduced the entire
lifecycle cleanly: post two, only the first blooms, `stepFrames` past its decay window,
the first is filtered out of `#live` and the second is promoted in the very same tick —
exactly the queueing behaviour the calm limiter is supposed to produce. The lesson: in
this environment, _any_ time-dependent verification should reach for `stepFrames` first,
not `wait()` — wall-clock waits only reliably advance the engine while something else in
the same window (a screenshot, a click) is actively happening.

**Two concurrent sessions were editing this codebase during this slice** — a background
task the user started to fix an unrelated WebGPU shader bug, running independently. Typecheck/
lint/build were re-run after its edits landed to confirm nothing about local thoughts
regressed from that; nothing did. Worth calling out only because it's the kind of thing
that can make a "did I break this" question genuinely ambiguous if you don't re-check
after noticing someone else's changes appear.

Verified: build/typecheck/lint/knip clean (new: unused-export infra pattern gains
`graphemes`'s helper functions in the same already-established shape, nothing else new).
In-browser via `stepFrames`-driven testing: grapheme counter matches typed length exactly;
Enter submits and collapses the composer back to its hairline; a second post while the
first is live correctly queues instead of vanishing (post-fix); the queued post blooms
the instant the first decays, in the same engine tick; the rendered lantern picks up
`font-thought` (confirmed via `getComputedStyle`, not just visual inspection) and its
opacity ramps up from near-zero rather than popping in at full strength.

## §7, Still mode

**Reused `AudioEngine` instead of writing a second implementation.** It only ever needed
a `THREE.Scene`/`THREE.Camera` to hang a `THREE.AudioListener` on — neither requires a
renderer or a GPU device, so a throwaway scene/camera Still mode never renders is enough
to get the exact same bus graph, generative music, and ambience bed with zero duplicated
logic. Shoreline positional emitters are the one piece skipped (empty `shorelinePoints`)
— recomputing the real coastline ray-march to spatialise wave audio for a viewer who
never moves relative to it is exactly the kind of cost the plan's own "~5% of the effort"
framing is warning against; the bed/music/gulls that actually carry "audio is ~90% of the
relaxation" are all still there.

**No poster art, same gap as the boot dissolve, same fix shape.** The plan wants "3–4
pre-cut layers" shot from the app; that needs a render-to-image pipeline that doesn't
exist. Stands in with three CSS gradient bands (sky/sea/sand) in Kamakura Bay's own
colours, parallaxing on `pointermove` at three different rates — same "right sky, not an
arbitrary one" reasoning as `BootDissolve`'s gradient. Parallax is skipped entirely under
`prefers-reduced-motion` — it's exactly the "camera drift" the plan's accessibility
contract says should stop.

**Getting "the same HUD" to actually mean the same components, not three near-clones.**
`ThoughtComposer` originally took `stats`/`command` (`EngineEventBus`/`EngineCommand`) —
types that only exist because there's a 3D `Engine` instance. Still mode has no such
instance. Rather than write a second composer, loosened the props to plain
`cooldownS: number` / `onSubmit: (text) => void` — the 3D world now computes those from
`api.stats`/`api.command` at the call site instead of the component reaching for them
itself. `ComfortSettings` got the same treatment more conservatively: `ready`/`command`
became optional, and the FOV/damping sliders (meaningless without a 3D camera) simply
don't render when `command` is absent — the Still-mode toggle itself, which needs
neither, always does. `AutoplayPill` needed no changes at all; it was already
engine-agnostic (`unlocked`/`onUnlock`), which is exactly the shape the other two needed
to reach.

**Lanterns can't be screen-projected without a screen to project onto in the 3D sense**,
so `ThoughtField` grew a second read method — `listLive()`, camera-free, returning
opacity/age but no screen position — alongside the existing `project()`. `StillLanternLayer`
derives a horizontal position by hashing each thought's id (stable across polls, so a
lantern doesn't jump between renders the way a fresh random number would) and rises it
via `ageFraction`, driven by the same decay/calm-limiter state as the 3D version.

**A real bug this surfaced, unrelated to Still mode's own logic**: switching into Still
mode (or a fresh dev-mode double-mount) could log an uncaught `AbortError: play() request
was interrupted by pause()` — `AmbienceBed.dispose()` calls `pause()`, and if that lands
while a `play()` promise from construction is still in flight (React's dev-mode
double-effect makes this a near-certainty whenever the context is already `running` at
construction), the rejection went unhandled. Harmless outcome, un-caught rejection — fixed
by attaching `.catch(() => {})` to `play()`. Pre-existing since the audio-engine slice;
Still mode's own mount/unmount cycling is just what made it easy to actually see.

**A workflow note, not a bug**: this session ran concurrently with another one (working
on unrelated terrain/UI enhancements — a day/night preset system, a landing info card).
Both landed in `Engine.ts`/`WorldClient.tsx` without conflict; typecheck/lint/build were
re-run after noticing the other session's changes to confirm nothing here regressed.

Verified: build/typecheck/lint/knip clean. In-browser: Still mode renders with no 3D
canvas and no `EngineCanvas` mount at all (confirmed by the complete absence of
`DevStatsPanel`/`LandingHeroCard`, which only exist inside it); the composer, autoplay
pill, and comfort gear all render and function identically to the 3D world's copies;
`ComfortSettings` correctly shows only the Still-mode toggle (no FOV/damping) when
`command` is absent; toggling off switches back to the full 3D world cleanly, with no
console errors and no leftover audio from the previous mode.

## v0.1 verification pass

Working through the plan's verification checklist after §7. Three genuinely couldn't be
done from here, and saying so plainly seemed more useful than a half-measurement dressed
up as a real one — this project already has one memory entry about exactly that mistake
(five GPU measurements filed with confidence and no control). **Idle GPU/power** and the
**8-hour soak** need OS-level instrumentation and real unattended wall-clock time on real
hardware — neither exists in this session. The **30-min heap soak** technically _could_
be approximated with `stepFrames`, but at the scale it needs (~10⁵ frames) that risks
freezing the one browser tab available to check anything else — flagged as needing a
dedicated pass or a Playwright harness, not attempted at a token scale that wouldn't
actually prove anything.

**Golden height check**: ran the existing `runGoldenHeightCheck` live via `/spikes/s2` —
all five rungs pass. The checklist item is "green (nightly, not PR-gated)" though, and
this repo has no CI config at all yet (no `.github/workflows`). Confirming the check
itself is currently green is not the same claim as having it run unattended every night
— that needs a runner + a headless WebGPU/WebGL harness, infra decisions nobody's made
yet, so a workflow file wasn't invented against guesses about them.

**Draw-call/triangle budget**: added a real dev-only assertion (`Engine.ts#assertBudget()`)
rather than just eyeballing `diagnose` output once — warns once per budget-exceeded
stretch (not every 500ms stats tick, which would train everyone to ignore it) if draw
calls exceed 150 or triangles exceed 2M. Currently silent — the scene runs at roughly
15–33 draw calls and 0.6–1M triangles — but the point of a budget assertion is catching
the day it _isn't_ silent, not confirming today's number.

**APCA contrast — the one that turned up something real.** Implemented the actual APCA-W3
formula (OKLCH→linear-sRGB→APCA, not a stand-in metric) against the glass system's real
token values, and composited against this app's _actual_ brightest and darkest rendered
colours (the other session's new `noon`/`moonlight` time-of-day presets — zenith, horizon,
and the noon sun disc) rather than guessing at representative colours. Correctly-matched
polarity (light UI over the noon scene, dark UI over moonlight — the only pairing the app
ever actually produces, since `data-ui-polarity` is _set from_ scene brightness) clears
the Lc ≥ 75 target comfortably, 87.9–102.8. A deliberately mismatched synthetic case (dark
UI forced over a white backdrop, light UI over black) drops to 39–68 — below target, but
an inherent consequence of a 54%-alpha glass panel, not a bug, and precisely what
`prefers-contrast: more`'s existing `--glass-alpha: 1` override removes by making the
panel opaque. Worth having actually computed rather than assumed: the real-world numbers
are the reassuring half of the story, and knowing exactly _when_ the system's contrast
margin gets thin (polarity mismatch) is the useful half that a spot-check would've missed
either direction — a pass/fail on real colours wouldn't have surfaced the boundary, and
skipping straight to "add more contrast margin everywhere" would have meant giving up
glass's translucency for a failure mode that only happens if polarity-matching itself
breaks.

## Beyond v0.1: Frostholm Ridge, a second scenery

Not on the original v0.1 checklist — added once that checklist was otherwise clear, to
finally give the long-deferred scenery registry something real to register. The plan's
own "Scenery as data" section sketches `TerrainSpec` as a discriminated union
(`kind: "coastal" | "ridge"`) and is explicit about why: _"'new scenery = data change' is
true for variants of a known archetype... a genuinely new kind of place needs a new
generator."_ A snow-bound mountain valley is exactly that second case, so this is a real
second height-shaping function, not `KAMAKURA_BAY` with different numbers.

**`HeightSpec` became a real union**, not a bag of optional fields. `CoastalTerrainSpec`
keeps every field Kamakura Bay already had; `RidgeTerrainSpec` gets its own
(`valleyRadiusM`/`valleyFalloffM`/`valleyFloorM`/`snowLineM`/`treeLineM`). Both
evaluators (`HeightFieldCpu.ts`, `heightNode.ts`) dispatch on `spec.kind`, and
`goldenHeightCheck` now tests whichever mask function applies (`islandMask` or the new
`valleyMask`) instead of hardcoding the coastal one. The ridge height shape mirrors the
coastal one on purpose — raw ridged-multifractal noise, blended from a flat floor
(`valleyFloorM`) out to the full composite via a radial mask — because it's the same
underlying trick ("protect a walkable region from noise nobody authored") just inverted
(protecting the _inside_ vs. the _outside_ of the mask radius).

**Every coastal-specific consumer got narrowed, not genericised.** `SandField`,
`terrainMaterial.ts`, `createGrassField`, `createPalmField` all now take
`CoastalTerrainSpec` specifically — they have no ridge equivalent and shouldn't pretend
to. `scatterInBand` (the shared placement utility) needed exactly one real change: its
"height above sea level" band check read `spec.seaLevelM` directly, which doesn't exist
on a ridge spec. Replaced with a caller-supplied `referenceHeightM` — coastal callers
pass `seaLevelM`, ridge callers pass `valleyFloorM` — which turned an accidentally
coastal-coupled utility back into the height/slope-banding tool its own doc comment
already claimed it was. `createRockField` went the other way: generalised (not
narrowed) into the one scatter field both archetypes actually share, since boulders read
as natural on a beach and a mountainside alike, unlike grass or palms.

**`Engine.ts`'s `#terrain`/`#water`/`#sandField`/`#grass`/`#palms` all became optional
fields**, populated by an `if (scenery.terrain.kind === 'coastal')` branch at
construction. The trap here: destructuring `this.#terrain.material` for the
`?debug=terrain` paint override _after_ assigning the branch's specific return value to
the loosely-typed `#terrain` field loses the specific type — TS types the destructure by
the field's _declared_ type, not the value just assigned to it. Fixed by keeping a local
(`coastalTerrain`/`snowTerrain`) with its full inferred type for the whole branch, and
only handing the common `{material, setSandTexture?}` shape to `this.#terrain` at the
very end of each branch.

**Reused `createRockField`-style generalisation did _not_ extend to the terrain
material or scatter flora** — `createSnowTerrainMaterial` and `pineField.ts` are
deliberately separate files from `terrainMaterial.ts`/`grassMaterial.ts`/`palmField.ts`,
duplicating the LOD-morph/analytic-normal boilerplate (~40 lines) rather than sharing it.
That boilerplate has nothing to do with either material's actual subject (sand ripples
and wet caustics vs. sastrugi and snow/rock splatting) — factoring it out is a reasonable
future cleanup, not a correctness requirement now.

**Audio assets moved from module constants to scenery data.** `AudioEngine` used to
import `WAVE_URLS`/`FOOTSTEP_URLS`/`GULL_URLS` as hardcoded paths; it now takes a
`SceneryAudioAssets` object per the plan's own "audio: stems + bed + emitters + footstep
sets" being part of `Scenery`'s shape. Frostholm Ridge passes empty arrays for
`waveUrls`/`incidentalUrls` — no shoreline, no invented wildlife sound — and both
`ShorelineEmitters` and `GullEmitter` already no-op cleanly against an empty buffer list
(confirmed by reading their existing guard clauses, not new code).

**A real bug, caught only because the new height evaluators are pure functions that run
fine outside a browser.** `findRidgeSpawn`'s first draft searched candidate radii at
0.3–0.7× `valleyRadiusM` — entirely inside the flattened valley, where `valleyMask` is
_exactly_ 0 and the height is therefore _exactly_ constant. Every candidate tied on
"flatness" (`normal.y === 1` everywhere), and the facing-direction gradient was exactly
zero too, falling back to a meaningless default yaw via the `|| 1` divide-by-zero guard.
A second attempt (0.9–1.15×) swapped one bug for another: that band turns out to be the
_steepest_ part of the whole terrain — surface normal drops from 0.997 to 0.52 over
about 25 metres, steeper than the ridged relief beyond it ever gets. Widening the search
to 1.0–2.5× `valleyRadiusM` with more rays (48 → 96) finds a genuinely flat shelf
(normal.y ≈ 0.9999) with an actual view. Caught by writing a throwaway `tsx` script that
calls `sampleHeight`/`valleyMask`/`findRidgeSpawn` directly at a grid of points — no
renderer, no browser, just the pure CPU functions — and printing the numbers. Worth
remembering: whenever new terrain-shaping math ships, running it standalone at a few
points is cheap insurance code review alone won't catch, because "does this tie on
flatness" and "how steep is the transition band" are both empirical questions about the
actual noise output, not something you can eyeball from the formula.

**Verification gap, stated plainly**: the Claude Browser MCP tool disconnected partway
through this feature (an environment issue, unrelated to anything here) and never came
back before the feature was finished. Everything above was verified via
typecheck/lint/build/knip (all clean, including after the concurrently-running terrain-UI
session's unrelated edits landed) and the CPU-only sanity script. What that _cannot_
verify: whether the snow material actually reads as snow, whether the pines read as
pines, the scenery switcher's actual click behaviour, or CPU/GPU height parity for the
ridge kind specifically (`runGoldenHeightCheck` needs a real WebGPU/WebGL context). This
is built and internally consistent, not yet confirmed to look or feel right — that pass
still needs to happen before treating Frostholm Ridge as done the way Kamakura Bay is.

**Two follow-ups from the user's first real look at it in-browser** (the gap above got
partially closed this way — a human eye instead of the disconnected browser tool):

1. _"The gear icon overlaps the Next.js dev indicator."_ Both default to bottom-left —
   `ComfortSettings` and Next's own dev-mode badge. Moved Next's indicator to
   bottom-right via `devIndicators.position` in `next.config.ts` rather than relocating
   our own control, since every other corner is already claimed by real HUD (top-left:
   `LandingHeroCard`; top-right: `DevStatsPanel`; bottom-right: `AutoplayPill`, which
   fades once playback starts).

2. _"Looks faceted even at high quality."_ Not an LOD/quality bug — quality tiers only
   change view distance and post effects, never the finest clipmap ring, which is always
   drawn. The actual cause: `FROSTHOLM_RIDGE`'s original octaves had only _two_ ridged
   bands, both at very low frequency (wavelength 322m and 126m) — across a 600m map that
   is one or two giant sharp creases, not a wrinkled mountainside, and reads as angular
   facets no matter how finely it's tessellated. Real ridged-multifractal terrain needs
   creases at several scales. Rewrote the octave list to four ridged octaves at
   doubling-ish frequency (broad massif → secondary ridgelines → tertiary creases → fine
   creases) with two non-ridged octaves left for the finest grain. Verified via the same
   `tsx` sanity script as the `findRidgeSpawn` fix — no NaNs, sane height range, spawn
   search and Kamakura Bay both unaffected — then confirmed by the user as "สวยงาม"
   (looks good) after refreshing. This is the first piece of Frostholm Ridge actually
   confirmed by a human eye rather than typecheck/build alone.

**Footprints in snow.** The original `FROSTHOLM_RIDGE` doc comment said footprints were
"a later addition, not this one" — the user asked for exactly that follow-up ("add some
detail when stepping in snow or sand"). `SnowField` (`engine/terrain/SnowField.ts`) is
`SandField`'s depth-only counterpart: identical ping-pong RG16F decay/stamp mechanism,
minus wetness and the shoreline ring (no water, no shoreline to trace on a ridge
scenery) — duplicated rather than parameterized onto `SandField`, same reasoning as the
height/material split: the two fields share the mechanism but not the domain (one traces
a shoreline at construction, one has no shoreline to trace at all). Tuned differently
from sand on purpose: slower refill (`0.0007` vs sand's `0.004` m/s — packed snow doesn't
re-level itself the way loose sand does) and deeper max depth (`0.14m` vs `0.08m` — a
boot sinks further than a bare foot). `createSnowTerrainMaterial` gained the same
depression-displaces-the-surface + rim-normal-from-depth-gradient treatment
`terrainMaterial.ts` already had for sand, plus one thing sand's wetness blend doesn't
need: a packed-snow albedo/roughness/sparkle response (compacted snow reads bluer,
smoother, and loses its powdery glitter) so a footprint doesn't just look like a dyed
patch of the same powder. Verified via typecheck/lint/build only — the visual confirmation
loop above (quality-tier claim was wrong until the octave rewrite showed otherwise) is
the reminder to actually check this one in-browser too, not assume the mechanism reading
correctly on paper means it reads correctly on screen.
