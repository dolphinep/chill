'use client'

import { useEffect, useState } from 'react'

/**
 * "Do not build a loading screen. Build a photograph that starts moving."
 *
 * The plan's version of this is a pre-rendered poster AVIF shot from the exact spawn
 * camera pose, cross-dissolving into the live canvas. That needs an asset pipeline
 * (render a still from the app itself, encode it, keep it in sync with the scene) that
 * does not exist yet. This is the same *shape* of boot — no spinner, no percentage, a
 * hairline and a place-and-hour line, dissolving out once the engine is ready — with a
 * gradient standing in for the poster. The gradient reuses the sky's own zenith/horizon
 * colours (`atmosphere.ts`), so it is at least the right sky, not an arbitrary one.
 */

const DISSOLVE_MS = 1200
const ESCALATE_AFTER_MS = 8000

export function BootDissolve({
  ready,
  place = 'Observatory Peak — deep night, clear skies',
}: {
  ready: boolean
  place?: string
}) {
  // `fading` is not its own state — it IS `ready`, one render late would just mean an
  // extra frame of no transition. Only the *delayed unmount* genuinely needs an effect.
  const [mounted, setMounted] = useState(true)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setMounted(false), DISSOLVE_MS)
    return () => clearTimeout(t)
  }, [ready])

  useEffect(() => {
    if (ready) return
    const t = setTimeout(() => setSlow(true), ESCALATE_AFTER_MS)
    return () => clearTimeout(t)
  }, [ready])

  if (!mounted) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-50 flex items-end justify-center transition-opacity ease-out"
      style={{
        opacity: ready ? 0 : 1,
        transitionDuration: `${DISSOLVE_MS}ms`,
        background: 'linear-gradient(to bottom, #040611, #141c33)',
      }}
      aria-hidden={ready}
    >
      <div className="absolute inset-x-0 bottom-0 h-px bg-white/20" />
      <p className="mb-10 text-sm text-white/70">
        {place}
        {/* No fake percentage — there is no granular progress signal to report one
            honestly. Past 8s this just admits it is taking a while. */}
        {slow && <span className="ml-2 text-white/50">— still loading…</span>}
      </p>
    </div>
  )
}
