'use client'

import type { LiveThoughtSummary } from '@/engine/thoughts/ThoughtField'

/**
 * Still mode's thought feed — same `ThoughtField` state (decay, drift, calm limiter),
 * rendered without any 3D projection since there's no scene to project through. Each
 * lantern gets a horizontal position hashed from its id (stable across polls, so it
 * doesn't jump around) and rises slowly as it ages, mirroring the 3D version's rise
 * without needing a camera to do it.
 */

function hashToPercent(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return 12 + (h % 76) // 12%..88% — keeps lanterns off the screen edges
}

export function StillLanternLayer({ thoughts }: { thoughts: LiveThoughtSummary[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {thoughts.map((t) => (
        <div
          key={t.id}
          className="glass font-thought text-glass-foreground absolute max-w-64 -translate-x-1/2 px-3 py-1.5 text-sm transition-[bottom,opacity] duration-[3000ms] ease-out"
          style={{
            left: `${hashToPercent(t.id)}%`,
            bottom: `${20 + t.ageFraction * 55}%`,
            opacity: t.opacity,
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
