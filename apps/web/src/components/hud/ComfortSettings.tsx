'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { EngineCommand } from '@/engine/core/Engine'
import type { EngineEvents, QualityTierName } from '@/engine/core/EngineEventBus'
import {
  MAX_DAMPING,
  MAX_FOV,
  MIN_FOV,
  useComfortState,
  setDamping as setStoredDamping,
  setFov as setStoredFov,
} from '@/lib/comfort/comfortStore'
import {
  effectiveMasterVolume,
  setMasterVolume,
  toggleMute,
  useAudioState,
} from '@/lib/audio/audioStore'
import { SCENERY_REGISTRY } from '@/lib/scenery/registry'
import { setSceneryId, useSceneryId } from '@/lib/scenery/sceneryStore'
import type { SceneryId } from '@/types/models/scenery'

const QUALITY_TIERS: { id: QualityTierName; label: string; desc: string }[] = [
  { id: 'low', label: 'Low', desc: 'Energy efficient, maximum framerate (30-60 FPS)' },
  { id: 'medium', label: 'Medium', desc: 'Balanced visuals and performance' },
  { id: 'high', label: 'High', desc: 'Full fidelity with real-time dynamic lighting and shadows' },
]

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-glass-edge flex flex-col gap-2.5 border-t pt-4 first:border-t-0 first:pt-0">
      <span className="text-white/50 text-[10px] font-semibold tracking-widest uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
      {muted ? (
        <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" />
      ) : (
        <>
          <path d="M16.3 8.7a5 5 0 0 1 0 6.6" strokeLinecap="round" />
          <path d="M19 6.2a8.5 8.5 0 0 1 0 11.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

export function ComfortSettings({
  ready,
  command,
  stats,
  forceOpen = true,
  onClose,
}: {
  ready?: boolean
  command?: (cmd: EngineCommand) => void
  stats?: EngineEvents['stats'] | null
  forceOpen?: boolean
  onClose?: () => void
}) {
  const { fov, damping } = useComfortState()
  const audioState = useAudioState()
  const sceneryId = useSceneryId()
  const currentTier: QualityTierName = stats?.tier ?? 'high'
  const [selectedTier, setSelectedTier] = useState<QualityTierName>(currentTier)
  // Mirrors `stats.tier` (the engine's auto quality ladder can change it on its own)
  // while still letting `handleSetTier` below override it instantly on click — the
  // "adjust state during render" pattern, not an effect: setting state conditionally
  // in the render body re-renders immediately without the extra effect-triggered pass
  // `useEffect` would add. See https://react.dev/learn/you-might-not-need-an-effect
  const [prevStatsTier, setPrevStatsTier] = useState(stats?.tier)
  if (stats?.tier && stats.tier !== prevStatsTier) {
    setPrevStatsTier(stats.tier)
    setSelectedTier(stats.tier)
  }

  // Sync settings with engine
  useEffect(() => {
    if (!ready || !command) return
    command({ type: 'setFov', fov })
    command({ type: 'setDamping', damping })
    command({ type: 'setVolume', volume: effectiveMasterVolume(audioState) })
    command({ type: 'setMusicVolume', volume: audioState.musicVolume })
    command({ type: 'setMusicMood', mood: audioState.musicMood })
    command({ type: 'setAmbienceVolume', volume: audioState.ambienceVolume })
    command({ type: 'setAmbiencePreset', preset: audioState.ambiencePreset })
  }, [ready, fov, damping, audioState, command])

  // Handle ESC key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!forceOpen) return null

  const handleSetTier = (tier: QualityTierName) => {
    setSelectedTier(tier)
    command?.({ type: 'setTier', tier })
  }

  return (
    <>
      {/* Click outside to close */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Modal Card floating above bottom dock */}
      <div
        className="animate-in fade-in zoom-in-95 fixed bottom-24 left-1/2 z-40 flex max-h-[calc(100vh-120px)] sm:max-h-145 w-110 max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/90 shadow-2xl backdrop-blur-xl duration-150 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white shadow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-white tracking-wide">
              Display & Comfort
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar">
          {/* 1. Graphics Quality Setting */}
          {command && (
            <Section label="Graphics Quality">
              <div className="grid grid-cols-3 gap-2">
                {QUALITY_TIERS.map((tier) => {
                  const isSelected = selectedTier === tier.id
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => handleSetTier(tier.id)}
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/20 text-white shadow-lg ring-1 ring-amber-400/50 font-bold'
                          : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-semibold">{tier.label}</span>
                      <span className="mt-1 text-[9px] text-white/50 leading-tight">{tier.id === 'low' ? '30-60 FPS' : tier.id === 'medium' ? 'Balanced' : 'Ultra 3D'}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-glass-muted text-[11px] mt-1">
                {QUALITY_TIERS.find((t) => t.id === selectedTier)?.desc}
              </p>
            </Section>
          )}

          {/* 2. Camera Comfort & FOV */}
          {command && (
            <Section label="Camera & View">
              <label className="flex flex-col gap-1.5">
                <div className="text-glass-muted flex justify-between text-xs">
                  <span>Field of View</span>
                  <span className="font-mono text-white font-medium">{Math.round(fov)}°</span>
                </div>
                <input
                  type="range"
                  min={MIN_FOV}
                  max={MAX_FOV}
                  step={1}
                  value={fov}
                  onChange={(e) => setStoredFov(Number(e.target.value))}
                  className="accent-amber-400 cursor-pointer"
                />
              </label>

              <label className="flex flex-col gap-1.5 mt-2">
                <div className="text-glass-muted flex justify-between text-xs">
                  <span>Camera Smoothness</span>
                  <span className="font-mono text-white font-medium">
                    {damping <= 0.02 ? 'Snappy' : damping >= MAX_DAMPING - 0.02 ? 'Floaty' : 'Balanced'}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={MAX_DAMPING}
                  step={0.01}
                  value={damping}
                  onChange={(e) => setStoredDamping(Number(e.target.value))}
                  className="accent-amber-400 cursor-pointer"
                />
              </label>
            </Section>
          )}

          {/* 3. Audio & Sound */}
          <Section label="Master Volume">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleMute()}
                aria-pressed={audioState.muted}
                aria-label={audioState.muted ? 'Unmute' : 'Mute'}
                title="Mute (M)"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
              >
                <SpeakerIcon muted={audioState.muted} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={audioState.masterVolume}
                onChange={(e) => setMasterVolume(Number(e.target.value))}
                className="accent-amber-400 flex-1 cursor-pointer"
              />
              <span className="font-mono text-xs text-white/80 w-10 text-right">
                {Math.round(audioState.masterVolume * 100)}%
              </span>
            </div>
          </Section>

          {/* 4. Scenery Switcher */}
          {command && (
            <Section label="Scenery">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(SCENERY_REGISTRY) as SceneryId[]).map((id) => {
                  const isCurrent = sceneryId === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSceneryId(id)}
                      className={`flex items-center justify-between rounded-xl border p-2.5 text-left text-xs transition ${
                        isCurrent
                          ? 'border-amber-400 bg-amber-500/20 text-white font-semibold shadow ring-1 ring-amber-400/40'
                          : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span>{SCENERY_REGISTRY[id].place.split('—')[0]!.trim()}</span>
                      {isCurrent && <span className="text-[10px] text-amber-300">✓</span>}
                    </button>
                  )
                })}
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  )
}
