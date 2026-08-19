import { S4Client } from './S4Client'

/**
 * S4 — does `backdrop-filter` actually sample a full-screen WebGPU canvas?
 *
 * This is the binary question the whole glass design rests on. Compositors do not
 * always blur across a GPU-canvas boundary, and if this fails, glassmorphism over the
 * 3D scene is simply not available and the HUD needs a different visual language.
 *
 * The *cost* half of S4 (compositor overhead per panel) cannot be measured here —
 * see the writeup; it needs a visible window, like S6.
 */
export default function S4Page() {
  return <S4Client />
}
