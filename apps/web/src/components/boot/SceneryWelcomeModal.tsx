'use client'

import { useState, type ReactNode } from 'react'
import { setSceneryId } from '@/lib/scenery/sceneryStore'
import type { SceneryId } from '@/types/models/scenery'

const WELCOMED_KEY = 'chill.scenery.welcomed'

/** Same icon/copy data the HUD dock's `SceneryModal` uses — duplicated rather than
 * shared because the two modals serve different purposes (welcome gate vs quick-switch)
 * and their copy/layout may diverge over time. Keeping them independent avoids coupling
 * a first-impression flow to an in-session utility panel. */
const SCENERY_DETAILS: Record<
  SceneryId,
  { title: string; subtitle: string; icon: ReactNode; desc: string }
> = {
  observatory: {
    title: 'Observatory Peak',
    subtitle: 'Always Night · Real Constellations',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-6 w-6"
      >
        <path
          d="M12 2.5l2.47 5.77 6.28.55-4.76 4.14 1.43 6.15L12 15.9l-5.42 3.21 1.43-6.15L3.25 8.82l6.28-.55z"
          strokeLinejoin="round"
        />
      </svg>
    ),
    desc: 'A quiet mountaintop under a permanent night sky — real constellations you can search and trace.',
  },
  'frostholm-ridge': {
    title: 'Frostholm Ridge',
    subtitle: 'Alpine Snow Valley',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-6 w-6"
      >
        <path d="M8 18l4-8 4 8" />
        <path d="M3 20l6-12 5 10" />
        <path d="M14 18l3-5 4 7" />
      </svg>
    ),
    desc: 'Quiet mountain peaks, crisp snow footprints, and a downhill skiing coin speedrun.',
  },
  'kamakura-bay': {
    title: 'Kamakura Bay',
    subtitle: 'Coastal Sandy Beach',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-6 w-6"
      >
        <circle cx="12" cy="7" r="3" />
        <path d="M2 18c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" strokeLinecap="round" />
        <path d="M2 14c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" strokeLinecap="round" />
      </svg>
    ),
    desc: 'Gentle ocean waves, warm sand impressions, and soft coastal sea breeze.',
  },
  'aki-highlands': {
    title: 'Aki Highlands',
    subtitle: 'Autumn Sunset Plateau',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-6 w-6"
      >
        <path d="M12 3v18M12 3l-4 6h8l-4-6zM12 9l-6 8h12l-6-8z" />
        <path d="M8 21h8" />
      </svg>
    ),
    desc: 'Rolling golden meadows, scenic mountain plateau, and glowing autumn sunset sky.',
  },
  'sports-arena': {
    title: 'Sunset Sports Arena',
    subtitle: 'Beach Stadium & Mini-Games',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-6 w-6"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 0 9 9M12 21a9 9 0 0 0-9-9M3.6 9h16.8M3.6 15h16.8" />
      </svg>
    ),
    desc: 'Beach sports stadium with built-in volleyball court, scoreboard, and upcoming sports.',
  },
}

/** Observatory listed first since it's the default landing scenery. */
const WELCOME_ORDER: SceneryId[] = [
  'observatory',
  'frostholm-ridge',
  'kamakura-bay',
  'aki-highlands',
  'sports-arena',
]

function hasBeenWelcomed(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(WELCOMED_KEY) === '1'
  } catch {
    return true // can't read storage → don't block
  }
}

function markWelcomed(): void {
  try {
    window.localStorage.setItem(WELCOMED_KEY, '1')
  } catch {
    // Private browsing — fine, they'll just see it again next time.
  }
}

/**
 * A first-visit-only scenery picker that appears over the Observatory default.
 * Uses the same card design as the HUD dock's `SceneryModal` so the visual
 * language is consistent — the only structural difference is a centered overlay
 * with a backdrop dim instead of a dock-anchored popover.
 */
export function SceneryWelcomeModal({ ready }: { ready: boolean }) {
  const [show, setShow] = useState(() => !hasBeenWelcomed())

  if (!show || !ready) return null

  const handlePick = (id: SceneryId) => {
    markWelcomed()
    setSceneryId(id)
    setShow(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop dim */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal card — same shell as SceneryModal */}
      <div
        className="animate-in fade-in zoom-in-95 relative z-10 mx-4 flex w-110 max-w-[calc(100vw-32px)] flex-col gap-3.5 overflow-hidden rounded-2xl border border-white/15 bg-slate-950/90 p-4 text-white shadow-2xl backdrop-blur-xl duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white shadow">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-4 w-4 text-white/90"
            >
              <path d="M8 18l4-8 4 8" />
              <path d="M3 20l6-12 5 10" />
              <path d="M14 18l3-5 4 7" />
            </svg>
          </div>
          <div className="flex flex-col">
            <h2 className="text-sm font-bold tracking-wide text-white">Choose Your Scenery</h2>
            <p className="text-[10px] text-white/40">
              Each world has its own atmosphere — you can switch anytime
            </p>
          </div>
        </div>

        {/* Scenery list — same card style as SceneryModal */}
        <div className="custom-scrollbar flex max-h-[calc(100vh-200px)] flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
          {WELCOME_ORDER.map((id) => {
            const info = SCENERY_DETAILS[id]
            return (
              <button
                key={id}
                type="button"
                onClick={() => handlePick(id)}
                className="group relative flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition-all hover:border-white/20 hover:bg-white/10"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 p-2 text-white/90 shadow transition group-hover:scale-105">
                    {info.icon}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <h3 className="text-xs font-bold text-white">{info.title}</h3>
                    <p className="mt-0.5 text-[10px] leading-tight text-white/60">
                      {info.subtitle}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-white/40">{info.desc}</p>
                  </div>
                </div>

                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="ml-2 h-4 w-4 shrink-0 text-white/20 transition-all group-hover:translate-x-0.5 group-hover:text-white/50"
                >
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
