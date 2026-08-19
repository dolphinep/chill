'use client'

import { useEffect, useState } from 'react'
import type { LanternProjection } from '@/engine/thoughts/ThoughtField'

/**
 * "Text renders as an HTML overlay, not canvas/SDF" — crisp at any DPI, real font
 * shaping, selectable, accessible. Positions come from `Engine.getLanternProjections()`,
 * pulled every `requestAnimationFrame` tick rather than pushed through `EngineEventBus`
 * (that channel is deliberately throttled to a few times a second — fine for stats,
 * too coarse for a lantern that's supposed to visibly drift).
 *
 * Not gated by `H`/ambient: those are chrome rules. A lantern is world content, the same
 * category as the character mesh or the terrain — it doesn't vanish because the HUD did.
 */

const MOTE_SIZE_PX = 8

export function LanternLayer({
  getLanternProjections,
}: {
  getLanternProjections: (viewportWidth: number, viewportHeight: number) => LanternProjection[]
}) {
  const [projections, setProjections] = useState<LanternProjection[]>([])

  useEffect(() => {
    let raf: number
    const tick = () => {
      setProjections(getLanternProjections(window.innerWidth, window.innerHeight))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getLanternProjections])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {projections.map((p) =>
        p.tier === 'mote' ? (
          <div
            key={p.id}
            className="absolute rounded-full bg-amber-100/80"
            style={{
              left: p.screenX,
              top: p.screenY,
              width: MOTE_SIZE_PX,
              height: MOTE_SIZE_PX,
              opacity: p.opacity,
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 10px 3px rgba(255, 230, 180, 0.55)',
            }}
          />
        ) : (
          <div
            key={p.id}
            className="glass font-thought text-glass-foreground absolute max-w-64 px-3 py-1.5"
            style={{
              left: p.screenX,
              top: p.screenY,
              opacity: p.opacity,
              transform: 'translate(-50%, -100%)',
              fontSize: p.tier === 'truncated' ? '12px' : '14px',
            }}
          >
            {p.text}
          </div>
        ),
      )}
    </div>
  )
}
