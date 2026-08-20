'use client'

import { useEffect, useState } from 'react'
import type { MinimapSnapshot } from '@/engine/core/Engine'
import { useHudHidden } from '@/lib/hud/hudStore'

function getCardinalDirection(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360
  if (normalized >= 337.5 || normalized < 22.5) return 'N'
  if (normalized >= 22.5 && normalized < 67.5) return 'NE'
  if (normalized >= 67.5 && normalized < 112.5) return 'E'
  if (normalized >= 112.5 && normalized < 157.5) return 'SE'
  if (normalized >= 157.5 && normalized < 202.5) return 'S'
  if (normalized >= 202.5 && normalized < 247.5) return 'SW'
  if (normalized >= 247.5 && normalized < 292.5) return 'W'
  return 'NW'
}

export function Compass({
  getMinimapSnapshot,
}: {
  getMinimapSnapshot?: () => MinimapSnapshot | null
}) {
  const hidden = useHudHidden()
  const [snapshot, setSnapshot] = useState<MinimapSnapshot | null>(null)
  const [minimized, setMinimized] = useState(false)

  useEffect(() => {
    if (!getMinimapSnapshot) return
    let raf: number
    const tick = () => {
      const snap = getMinimapSnapshot()
      if (snap) setSnapshot(snap)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getMinimapSnapshot])

  if (hidden || !snapshot) return null

  // Camera yaw in degrees (0 = North, 90 = East, 180 = South, 270 = West)
  const rawYaw = snapshot.local.cameraYaw ?? snapshot.local.yaw
  const deg = Math.round(((((-rawYaw * 180) / Math.PI) % 360) + 360) % 360)
  const cardinal = getCardinalDirection(deg)

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="glass fixed top-4 left-4 z-40 flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 text-white/90 shadow-lg backdrop-blur-md transition hover:bg-white/15"
        title="Expand Compass"
      >
        <span className="text-xs font-bold text-rose-400">N</span>
      </button>
    )
  }

  return (
    <div className="animate-in fade-in fixed top-4 left-4 z-40 duration-200 select-none">
      {/* Square Glass Box */}
      <div className="glass relative flex h-22 w-22 flex-col items-center justify-between rounded-2xl border border-white/15 p-2 text-white shadow-xl backdrop-blur-xl">
        {/* Rotating Circular Compass Dial */}
        <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/20 shadow-inner">
          {/* Compass Rose Ring */}
          <div
            className="absolute inset-0 flex items-center justify-center transition-transform duration-75 ease-out"
            style={{ transform: `rotate(${-deg}deg)` }}
          >
            {/* North Indicator */}
            <span className="absolute -top-0.5 text-[9px] font-black tracking-tighter text-rose-400">
              N
            </span>
            {/* South Indicator */}
            <span className="absolute -bottom-0.5 text-[8px] font-bold tracking-tighter text-white/50">
              S
            </span>
            {/* East Indicator */}
            <span className="absolute -right-0.5 text-[8px] font-bold tracking-tighter text-white/50">
              E
            </span>
            {/* West Indicator */}
            <span className="absolute -left-0.5 text-[8px] font-bold tracking-tighter text-white/50">
              W
            </span>

            {/* Needle Pivot & Crosshair */}
            <div className="h-1.5 w-1.5 rounded-full bg-white shadow-sm" />
            <div className="absolute h-7 w-px bg-linear-to-b from-rose-500 via-transparent to-white/40" />
            <div className="absolute h-px w-7 bg-white/20" />
          </div>
        </div>

        {/* Heading & Degrees */}
        <div className="flex items-center gap-1 leading-none">
          <span className="text-xs font-bold tracking-wide text-white">{cardinal}</span>
          <span className="font-mono text-[11px] text-white/70">{deg}°</span>
        </div>

        {/* Subtle Coordinates Footer */}
        <div className="font-mono text-[9px] leading-none text-white/45">
          {snapshot.local.x.toFixed(0)}, {snapshot.local.z.toFixed(0)}
        </div>

        {/* Minimal Minimize Button */}
        <button
          type="button"
          onClick={() => setMinimized(true)}
          className="absolute top-1.5 right-1.5 rounded-md p-0.5 text-white/30 transition hover:text-white"
          title="Minimize Compass"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-2.5 w-2.5"
          >
            <path d="M18 12H6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
