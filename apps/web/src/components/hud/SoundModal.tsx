'use client'

import { type ReactNode } from 'react'
import type { EngineCommand } from '@/engine/core/Engine'
import type { AmbienceType } from '@/lib/audio/engine'
import type { LofiMood } from '@/lib/audio/generative'
import {
  effectiveMasterVolume,
  setAmbiencePreset as setStoredAmbiencePreset,
  setAmbienceVolume as setStoredAmbienceVolume,
  setMasterVolume as setStoredMasterVolume,
  setMusicMood as setStoredMusicMood,
  setMusicVolume as setStoredMusicVolume,
  setSfxVolume as setStoredSfxVolume,
  toggleMute,
  useAudioState,
} from '@/lib/audio/audioStore'

type AmbienceOption = {
  id: AmbienceType
  name: string
  icon: ReactNode
  desc: string
}

const AMBIENCE_OPTIONS: AmbienceOption[] = [
  {
    id: 'wind',
    name: 'Breeze & Wind',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-5 w-5"
      >
        <path d="M17.7 7.7A2.5 2.5 0 1 1 15 5h-7.5" strokeLinecap="round" />
        <path d="M19.7 12.7A2.5 2.5 0 1 1 17 10h-13" strokeLinecap="round" />
        <path d="M16.7 17.7A2.5 2.5 0 1 1 14 15h-10" strokeLinecap="round" />
      </svg>
    ),
    desc: 'Soft alpine gust & coastal breeze',
  },
  {
    id: 'waves',
    name: 'Ocean Shore',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-5 w-5"
      >
        <path d="M2 6c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" strokeLinecap="round" />
        <path d="M2 12c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" strokeLinecap="round" />
        <path d="M2 18c1.5 1 3 1 4.5 0s3-1 4.5 0 3-1 4.5 0 3-1 4.5 0" strokeLinecap="round" />
      </svg>
    ),
    desc: 'Rhythmic ocean waves on sand',
  },
  {
    id: 'rain',
    name: 'Cozy Rain',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-5 w-5"
      >
        <path d="M4 14.8A7 7 0 0 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.2" strokeLinecap="round" />
        <path d="M8 15v4M12 17v4M16 15v4" strokeLinecap="round" />
      </svg>
    ),
    desc: 'Gentle falling raindrops',
  },
  {
    id: 'fire',
    name: 'Campfire',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-5 w-5"
      >
        <path
          d="M12 2c1 3 2.5 5 4.5 7 2 2 2.5 4.5 1.5 7a7 7 0 0 1-12 0c-1-2.5-.5-5 1.5-7 2-2 3.5-4 4.5-7z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 14a2.5 2.5 0 0 0-2.5 2.5c0 1.5 1.2 2.5 2.5 2.5s2.5-1 2.5-2.5A2.5 2.5 0 0 0 12 14z"
          strokeLinecap="round"
        />
      </svg>
    ),
    desc: 'Warm crackling fireplace embers',
  },
  {
    id: 'crickets',
    name: 'Night Crickets',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-5 w-5"
      >
        <path
          d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"
          strokeLinecap="round"
        />
        <path d="M19 3v4M21 5h-4" strokeLinecap="round" />
      </svg>
    ),
    desc: 'Peaceful summer night insect chorus',
  },
]

const LOFI_MOODS: { id: LofiMood; name: string; desc: string }[] = [
  { id: 'cozy-piano', name: 'Cozy Piano', desc: 'Mellow Rhodes electric keys' },
  { id: 'guitar-lofi', name: 'Jazz Guitar', desc: 'Acoustic 7th chord fingerpicks' },
  { id: 'chill-synthwave', name: 'Chill Synth', desc: '80s nostalgic dreamwave pads' },
  { id: 'japanese-zen', name: 'Zen Garden', desc: 'Peaceful Japanese Koto harp' },
  { id: 'midnight-ambient', name: 'Midnight Space', desc: 'Deep drone & glass chimes' },
  { id: 'deep-focus', name: 'Deep Focus', desc: 'Sparse drone — for reading & writing' },
]

export function SoundModal({
  isOpen,
  onClose,
  command,
}: {
  isOpen: boolean
  onClose: () => void
  command?: (cmd: EngineCommand) => void
}) {
  const audioState = useAudioState()

  if (!isOpen) return null

  const handleSelectAmbience = (id: AmbienceType) => {
    setStoredAmbiencePreset(id)
    command?.({ type: 'setAmbiencePreset', preset: id })
  }

  const handleSelectMood = (mood: LofiMood) => {
    setStoredMusicMood(mood)
    command?.({ type: 'setMusicMood', mood })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="glass custom-scrollbar flex max-h-[85vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-white/15 p-5 text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-5 w-5 text-white/90"
            >
              <path d="M9 18V5l12-2v13" strokeLinejoin="round" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <h2 className="text-sm font-medium text-white/95">Sound & Music</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
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

        {/* Sliders Container */}
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5">
          {/* Master Volume */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-white/90">Master Volume</span>
              <span className="font-mono text-white/60 tabular-nums">
                {audioState.muted ? 'Muted' : `${Math.round(audioState.masterVolume * 100)}%`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleMute()}
                className="flex shrink-0 items-center justify-center rounded-lg bg-white/10 p-1.5 text-white/90 transition hover:bg-white/20"
                title="Mute / Unmute"
              >
                {audioState.muted ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    className="h-4 w-4"
                  >
                    <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinejoin="round" />
                    <line x1="23" y1="9" x2="17" y2="15" strokeLinecap="round" />
                    <line x1="17" y1="9" x2="23" y2="15" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    className="h-4 w-4"
                  >
                    <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinejoin="round" />
                    <path
                      d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={audioState.masterVolume}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setStoredMasterVolume(v)
                  command?.({
                    type: 'setVolume',
                    volume: effectiveMasterVolume({ ...audioState, masterVolume: v }),
                  })
                }}
                className="w-full cursor-pointer accent-white"
              />
            </div>
          </div>

          <div className="h-px bg-white/10" />

          {/* Music Volume (Generative Lo-Fi) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-white/80">Lo-Fi Generative Music</span>
              <span className="font-mono text-white/60 tabular-nums">
                {Math.round(audioState.musicVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={audioState.musicVolume}
              onChange={(e) => {
                const v = Number(e.target.value)
                setStoredMusicVolume(v)
                command?.({ type: 'setMusicVolume', volume: v })
              }}
              className="w-full cursor-pointer accent-emerald-400"
            />
          </div>

          <div className="h-px bg-white/10" />

          {/* Nature Ambience Volume */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-white/80">Nature Ambience Sound</span>
              <span className="font-mono text-white/60 tabular-nums">
                {Math.round(audioState.ambienceVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={audioState.ambienceVolume}
              onChange={(e) => {
                const v = Number(e.target.value)
                setStoredAmbienceVolume(v)
                command?.({ type: 'setAmbienceVolume', volume: v })
              }}
              className="w-full cursor-pointer accent-sky-400"
            />
          </div>

          <div className="h-px bg-white/10" />

          {/* Sound Effects & World (SFX) Volume */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-white/80">Sound Effects & World (SFX)</span>
              <span className="font-mono text-white/60 tabular-nums">
                {Math.round((audioState.sfxVolume ?? 0.6) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={audioState.sfxVolume ?? 0.6}
              onChange={(e) => {
                const v = Number(e.target.value)
                setStoredSfxVolume(v)
                command?.({ type: 'setSfxVolume', volume: v })
              }}
              className="w-full cursor-pointer accent-amber-400"
            />
          </div>
        </div>

        {/* Lo-Fi Music Mood Selection */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wider text-white/70 uppercase">
            Lo-Fi Music Mood
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {LOFI_MOODS.map((m) => {
              const active = audioState.musicMood === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectMood(m.id)}
                  className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                    active
                      ? 'border-emerald-400/50 bg-emerald-500/20 text-white shadow-md'
                      : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <span className="text-xs font-medium text-white">{m.name}</span>
                  <span className="mt-0.5 text-[10px] leading-tight text-white/50">{m.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Ambience Soundscapes */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wider text-white/70 uppercase">
            Ambient Soundscape
          </span>
          <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto pr-1">
            {AMBIENCE_OPTIONS.map((opt) => {
              const active = audioState.ambiencePreset === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectAmbience(opt.id)}
                  className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                    active
                      ? 'border-white/40 bg-white/20 text-white shadow-lg'
                      : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
                  }`}
                >
                  <div className="shrink-0 rounded-lg bg-white/10 p-2 text-white">{opt.icon}</div>
                  <div className="flex flex-1 flex-col">
                    <span className="text-xs font-medium text-white">{opt.name}</span>
                    <span className="text-[11px] text-white/60">{opt.desc}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-white/10 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/15 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/25"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
