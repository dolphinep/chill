'use client'

import { useEffect, useState } from 'react'
import type { ConstellationLabelProjection } from '@/engine/sky/ConstellationField'

/**
 * Same rAF-polling pattern as `LanternLayer.tsx` — projected screen positions must
 * track the camera continuously as it moves/rotates, which `EngineEventBus`
 * (deliberately throttled to a few times a second) is too coarse for. One label per
 * currently-visible-and-on-screen constellation, not just the searched one — see
 * `ConstellationField.projectLabels`'s own doc comment on why. The connecting lines
 * themselves (both the always-dim ones for every constellation and the bright one
 * for whichever is searched) are real 3D `THREE.LineSegments` drawn straight into
 * the scene by `ConstellationField`, not something this layer needs to draw —
 * matching `LanternLayer`'s own "text as a real HTML overlay, not canvas/SDF"
 * reasoning for exactly the one piece that's actually text.
 */
export function ConstellationHighlightLayer({
  getConstellationLabels,
}: {
  getConstellationLabels: (
    viewportWidth: number,
    viewportHeight: number,
  ) => ConstellationLabelProjection[]
}) {
  const [labels, setLabels] = useState<ConstellationLabelProjection[]>([])

  useEffect(() => {
    let raf: number
    const tick = () => {
      setLabels(getConstellationLabels(window.innerWidth, window.innerHeight))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getConstellationLabels])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {labels.map((l) =>
        l.active ? (
          <div
            key={l.id}
            className="absolute flex flex-col items-center gap-1 transition-transform"
            style={{ left: l.x, top: l.y, transform: 'translate(-50%, -50%)' }}
          >
            <div className="glass flex items-center gap-2 rounded-full border border-cyan-400/60 bg-slate-950/70 px-4 py-1.5 text-xs font-bold text-cyan-200 uppercase tracking-wider shadow-[0_0_20px_rgba(34,211,238,0.35)] backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              <span>{l.name}</span>
            </div>
          </div>
        ) : (
          <div
            key={l.id}
            className="absolute font-constellation text-[10px] text-white/45 uppercase tracking-widest"
            style={{
              left: l.x,
              top: l.y,
              transform: 'translate(-50%, -50%)',
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            }}
          >
            {l.name}
          </div>
        ),
      )}
    </div>
  )
}
