'use client'

import type { ReactNode } from 'react'
import { SCENERY_REGISTRY } from '@/lib/scenery/registry'
import { setSceneryId, useSceneryId } from '@/lib/scenery/sceneryStore'
import type { SceneryId } from '@/types/models/scenery'

const SCENERY_DETAILS: Record<
  SceneryId,
  { title: string; subtitle: string; icon: ReactNode; desc: string }
> = {
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
    desc: 'Quiet mountain peaks, crisp snow footprints, and high-altitude starlight.',
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
}

export function SceneryModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const sceneryId = useSceneryId()

  if (!isOpen) return null

  return (
    <>
      {/* Click outside to close */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Modal Card floating above bottom dock */}
      <div
        className="animate-in fade-in zoom-in-95 fixed bottom-24 left-1/2 z-40 flex max-h-[calc(100vh-120px)] sm:max-h-145 w-110 max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col gap-3.5 overflow-hidden rounded-2xl border border-white/15 bg-slate-950/90 p-4 text-white shadow-2xl backdrop-blur-xl duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
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
            <h2 className="text-sm font-bold text-white tracking-wide">Scenery & Atmosphere</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4"
            >
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scenery Grid (Scrollable) */}
        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5 custom-scrollbar">
          {(Object.keys(SCENERY_REGISTRY) as SceneryId[]).map((id) => {
            const active = sceneryId === id
            const info = SCENERY_DETAILS[id]
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSceneryId(id)
                  onClose()
                }}
                className={`group relative flex items-center justify-between rounded-2xl border p-3 text-left transition-all ${
                  active
                    ? 'border-white/30 bg-white/20 shadow-md ring-1 ring-white/30 text-white'
                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 text-white/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border p-2 shadow transition group-hover:scale-105 ${
                      active ? 'border-white/30 bg-white/20 text-white' : 'border-white/10 bg-white/10 text-white/90'
                    }`}
                  >
                    {info.icon}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <h3 className="text-xs font-bold text-white">{info.title}</h3>
                    <p className="text-[10px] text-white/60 leading-tight mt-0.5">{info.subtitle}</p>
                    <p className="text-[10px] leading-relaxed text-white/40 mt-0.5">{info.desc}</p>
                  </div>
                </div>

                {active ? (
                  <span className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/40 bg-white/25 text-xs font-bold text-white shadow-sm">
                    ✓
                  </span>
                ) : (
                  <span className="ml-2 h-4 w-4 shrink-0 rounded-full border border-white/20 transition group-hover:border-white/40" />
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-white/10 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/15 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/25"
          >
            Close
          </button>
        </div>
      </div>
    </>
  )
}
