'use client'

import { useEffect, useState } from 'react'
import type { EngineCommand } from '@/engine/core/Engine'
import type { ConstellationSummary } from '@/engine/sky/ConstellationField'
import constellationLineData from '@/engine/sky/data/constellations.json'

const OPACITY_KEY = 'chill:constellationOpacity'
const ENABLED_KEY = 'chill:constellationsEnabled'

/** Persisted the same lightweight way `audioStore.ts`/`comfortStore.ts` persist a
 * preference — plain `localStorage`, no external-store ceremony, since this modal
 * is the only reader *and* writer (unlike audio volume, nothing else in the app
 * needs to react to this). */
function loadOpacity(): number {
  try {
    const raw = localStorage.getItem(OPACITY_KEY)
    return raw ? Number(raw) : 1
  } catch {
    return 1
  }
}

function loadEnabled(): boolean {
  try {
    const raw = localStorage.getItem(ENABLED_KEY)
    return raw === null ? false : raw === 'true'
  } catch {
    return false
  }
}

const FALLBACK_CONSTELLATIONS: ConstellationSummary[] = (
  constellationLineData as { id: string; name: string }[]
).map((c) => ({
  id: c.id,
  name: c.name.replace(/[\u2000-\u200F\u00A0]/g, ' '),
}))

function getTodayYmd(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
}

export function ConstellationModal({
  isOpen,
  onClose,
  command,
  names,
  isVisible,
  ready,
}: {
  isOpen: boolean
  onClose: () => void
  command?: (cmd: EngineCommand) => void
  names?: ConstellationSummary[]
  isVisible?: (id: string) => boolean
  /** Re-applies the persisted opacity/enabled preference once the engine is ready
   * to receive commands — same reasoning as `ComfortSettings.tsx`'s own `ready`
   * prop: a fresh `Engine` instance (e.g. after a scenery switch) always starts at
   * the field's own defaults (full opacity, enabled), so a previously-saved
   * preference needs to be re-sent, not just applied once on this component's own
   * mount. */
  ready?: boolean
}) {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayYmd)
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [opacity, setOpacity] = useState<number>(loadOpacity)
  const [enabled, setEnabled] = useState<boolean>(loadEnabled)
  const [, forceRerender] = useState(0)

  useEffect(() => {
    if (!ready || !command) return
    command({ type: 'setConstellationOpacity', value: opacity })
    command({ type: 'setConstellationsEnabled', enabled })
  }, [ready, command, opacity, enabled])

  if (!isOpen) return null

  const allNames = names && names.length > 0 ? names : FALLBACK_CONSTELLATIONS
  const q = query.trim().replace(/[\u2000-\u200F\u00A0]/g, ' ').toLowerCase()

  const filtered = q
    ? allNames.filter((n) => {
        const cleanName = n.name.replace(/[\u2000-\u200F\u00A0]/g, ' ').toLowerCase()
        const cleanId = n.id.toLowerCase()
        return cleanName.includes(q) || cleanId.includes(q)
      })
    : allNames

  const activeIsBelowHorizon = activeId !== null && isVisible?.(activeId) === false

  function handleSelect(id: string): void {
    const next = activeId === id ? null : id
    setActiveId(next)
    command?.({ type: 'highlightConstellation', id: next })
  }

  function handleDateChange(dateInput: string): void {
    if (!dateInput) return
    setSelectedDate(dateInput)
    command?.({ type: 'setSkyDate', dateInput })
    forceRerender((n) => n + 1)
  }

  function handleOpacityChange(value: number): void {
    setOpacity(value)
    try {
      localStorage.setItem(OPACITY_KEY, String(value))
    } catch {
      // Private browsing / storage disabled — the setting just won't survive a reload.
    }
  }

  function handleEnabledChange(value: boolean): void {
    setEnabled(value)
    try {
      localStorage.setItem(ENABLED_KEY, String(value))
    } catch {
      // See handleOpacityChange.
    }
  }

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
                <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="6" cy="7" r="1" fill="currentColor" stroke="none" />
                <circle cx="18" cy="6" r="1" fill="currentColor" stroke="none" />
                <circle cx="17" cy="16" r="1" fill="currentColor" stroke="none" />
                <path d="M12 12L6 7M12 12l6-6M12 12l5 4" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-white tracking-wide">Real Constellations</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-0.5 custom-scrollbar">
          {/* Date picker — Defaults to today in local time */}
          <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">
              Sky Date & Observation Time
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white outline-none scheme-dark transition focus:border-white/30"
            />
            <span className="text-[10px] text-white/40">
              Star positions calculated for 20:00 local time
            </span>
          </div>

          {/* Visibility controls */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-white/80">Show constellations</span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => handleEnabledChange(!enabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors ${
                  enabled ? 'bg-emerald-500/80' : 'bg-white/20'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>

            <label className={`flex flex-col gap-1.5 ${enabled ? '' : 'opacity-40'}`}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-white/70">Intensity</span>
                <span className="font-mono text-white/60 tabular-nums">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={opacity}
                disabled={!enabled}
                onChange={(e) => handleOpacityChange(Number(e.target.value))}
                className="w-full cursor-pointer accent-emerald-400 disabled:cursor-not-allowed"
              />
            </label>
          </div>

          {activeIsBelowHorizon && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90 leading-relaxed">
              ⭐ This constellation is currently below the horizon tonight. Try changing the date above to view other seasons.
            </div>
          )}

          {/* Search */}
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search constellations (e.g. Orion, Leo, Ursa Major)..."
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-white/40 transition focus:border-white/30"
            />

            <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-0.5 custom-scrollbar">
              {filtered.length === 0 ? (
                <p className="text-[11px] text-white/40 px-1 py-2 text-center">No constellations found matching &ldquo;{query}&rdquo;</p>
              ) : (
                filtered.map((c) => {
                  const active = activeId === c.id
                  const cleanName = c.name.replace(/[\u2000-\u200F\u00A0]/g, ' ')
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelect(c.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl transition text-left border ${
                        active
                          ? 'bg-emerald-500/20 border-emerald-400/60 text-white font-semibold shadow-md ring-1 ring-emerald-400/40'
                          : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/70 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-medium">{cleanName}</span>
                      <span className="font-mono text-[10px] text-white/40">{c.id}</span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
          <p className="text-[10px] leading-tight text-white/35">
            Stellarium Data · Free Art License
          </p>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 px-4 py-1.5 text-xs font-medium rounded-xl bg-white/15 hover:bg-white/25 text-white transition"
          >
            Done
          </button>
        </div>
      </div>
    </>
  )
}
