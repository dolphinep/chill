/**
 * The one `AudioContext` for the app. No react/next import here on purpose — `engine/`
 * needs to drive this module directly (listener position, footstep triggers, shoreline
 * emitters all live on the per-frame render loop), and `engine/` is ESLint-forbidden from
 * importing anything that pulls React into its module graph.
 *
 * `THREE.AudioContext.setContext(ctx)` must run before any `THREE.AudioListener` is
 * constructed — otherwise three quietly makes its own context and the listener ends up on
 * a different graph than everything built here.
 */

import * as THREE from 'three/webgpu'

let ctx: AudioContext | null = null
const listeners = new Set<() => void>()

export function getAudioContext(): AudioContext {
  if (ctx) return ctx
  ctx = new AudioContext()
  THREE.AudioContext.setContext(ctx)
  ctx.onstatechange = () => listeners.forEach((l) => l())
  return ctx
}

/** Never `play()` while suspended — call this and check the result instead of assuming. */
export async function resumeAudioContext(): Promise<boolean> {
  const c = getAudioContext()
  if (c.state !== 'running') {
    try {
      await c.resume()
    } catch {
      // Rejected outside a user gesture — expected, not an error worth surfacing.
    }
  }
  // TS narrows `c.state` from the check above and won't re-widen it across the `await`,
  // so read fresh through the getter rather than trusting the (stale, in TS's model) type.
  return getAudioContextState() === 'running'
}

export function getAudioContextState(): AudioContextState {
  return ctx?.state ?? 'suspended'
}

export function subscribeAudioContextState(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
