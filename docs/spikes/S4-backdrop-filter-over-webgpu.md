# S4 — backdrop-filter over a full-screen WebGPU canvas

**Status: correctness PASSED. Cost half deferred to a human (see below).**

Date: 2026-08-08 · Apple Silicon, Chromium-based pane. Runnable at `/spikes/s4`.

---

## The binary question

Compositors do not always blur across a GPU-canvas boundary. If `backdrop-filter`
cannot sample a WebGPU canvas, glassmorphism over the 3D scene is simply unavailable
and the HUD needs a different visual language. Everything in the glass design depends
on this.

## Method

A deliberately hostile backdrop rendered by the WebGPU canvas: a **90-column
checkerboard** split into a blown-out bright half (mean L ≈ 0.85) and a near-black half
(mean L ≈ 0.06). Three panels straddle the boundary:

| Panel | Treatment                                                          |
| ----- | ------------------------------------------------------------------ |
| A     | no `backdrop-filter` — control                                     |
| B     | `backdrop-blur-[26px]` only                                        |
| C     | the full `glass` utility (blur + saturate + brightness + contrast) |

## Result

- **A** — checks fully visible through the panel; body text nearly illegible on both
  halves. The control behaves as expected.
- **B** — checks **completely smoothed**. ✅ **`backdrop-filter` does sample the WebGPU
  canvas.** But text is barely legible over the bright half.
- **C** — checks smoothed **and** the backdrop normalised. Text is clearly legible over
  **both** the blown-out and the near-black half.

## Why this matters more than "it works"

B vs C is a direct empirical confirmation of the thesis the glass system was designed
around:

> `backdrop-filter: blur()` is a **low-pass filter**. It removes high-frequency detail
> but preserves the _mean luminance_. Blur fixes **busyness**; it does nothing for
> **brightness**.

Panel B is what almost every glassmorphism implementation ships — blur plus a
hardcoded `rgba(255,255,255,0.1)` — and it demonstrably fails exactly when the scenery
is brightest. Panel C adds `brightness()` and `contrast()` **inside the same
backdrop-filter chain**, which costs no extra pass and no readback, and it holds up on
both extremes.

So the design's Tier 0 ("never trust the backdrop; set fill alpha so the worst case
still passes") plus the filter-chain normalisation are both validated. Tier 1
(scenery-declared polarity) and Tier 2 (luminance probe) remain as planned refinements,
not prerequisites.

## What is NOT established here — and must not be assumed

**Compositor cost was not measured.** `backdrop-filter` cost scales with panel _area_
and forces the compositor to read back the region under each panel. Measuring that
requires real presented frames, and per S1 `requestAnimationFrame` is fully suspended
in this automated pane (`document.visibilityState === 'hidden'`), so no honest frame
timing is obtainable.

**Action: fold the cost check into S6**, which already needs a human at a visible
window. Specifically measure:

- frame time with 0 panels vs the real HUD panel set, at 1440p
- whether the compositor cost is proportional to total blurred area (it should be)
- the delta from animating a panel's opacity (ambient fade) while blur is active

The mitigation if it is expensive is already designed: fall back to Tier 0 with higher
fill alpha and a smaller blur radius, and keep panels small and few. That still looks
good — panel C would simply become slightly more opaque.

## Reminder of the trap that will bite during HUD work

An ancestor with `opacity < 1` **destroys** `backdrop-filter` — it creates a stacking
group, and the filter then samples the group rather than the page, turning glass into
flat colour. Ambient-mode fade must therefore animate opacity on **each panel
individually**, never on a wrapper around the HUD. This remains the single most likely
bug in the UI layer.
