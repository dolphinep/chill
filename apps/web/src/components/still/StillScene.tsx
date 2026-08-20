'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three/webgpu'
import { AudioEngine } from '@/lib/audio/engine'
import { getAudioContextState, subscribeAudioContextState } from '@/lib/audio/context'
import { effectiveVolume, useVolumeState } from '@/lib/audio/volumeStore'
import { prefersReducedMotion } from '@/lib/comfort/reducedMotion'
import { ThoughtField, type LiveThoughtSummary } from '@/engine/thoughts/ThoughtField'
import { SCENERY_REGISTRY } from '@/lib/scenery/registry'
import { AutoplayPill } from '@/components/audio/AutoplayPill'
import { ComfortSettings } from '@/components/hud/ComfortSettings'
import { ThoughtComposer } from '@/components/hud/ThoughtComposer'
import { StillLanternLayer } from '@/components/still/StillLanternLayer'

/**
 * "Build it, and don't frame it as a fallback." A full-bleed poster with CSS parallax,
 * the same audio engine, the same glass HUD, the same thought feed — for VDI/locked-down
 * laptops and old GPUs, and as a deliberate battery-saver choice for everyone else.
 *
 * No pre-rendered poster art exists yet (same gap `BootDissolve` has — that needs a
 * render-a-still-from-the-app pipeline that hasn't been built) — this stands in with a
 * layered CSS scene in Kamakura Bay's own sky colours, same reasoning as the boot
 * gradient. Swap in real cut poster layers later; the parallax/HUD/audio wiring around
 * them doesn't change.
 *
 * Deliberately still Kamakura-Bay-only: it doesn't yet follow the scenery switcher, the
 * same way the poster art itself is a placeholder rather than per-scenery. Making Still
 * mode scenery-aware is a real follow-up (a snow poster + Frostholm Ridge's audio
 * assets), not done here — this pass is the 3D snow terrain + the switcher for it.
 *
 * Reuses `AudioEngine` directly rather than a second implementation — it only needs a
 * `THREE.Scene`/`THREE.Camera` to hang a listener on, neither of which requires a
 * renderer or GPU device. Shoreline positional emitters are skipped (empty
 * `shorelinePoints`): recomputing the real coastline ray-march here just to spatialise
 * wave audio a static viewer never moves past is the kind of cost the plan's "~5% of the
 * effort" framing is explicitly warning against. The bed/generative music/gulls — the
 * parts that carry "audio is ~90% of the relaxation" — are all still fully present.
 */

const PARALLAX_PX = { sky: 8, sea: 16, sand: 28 }

export function StillScene() {
  const audioRef = useRef<AudioEngine | null>(null)
  const thoughtsRef = useRef<ThoughtField>(new ThoughtField())
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [thoughts, setThoughts] = useState<LiveThoughtSummary[]>([])
  const [cooldownS, setCooldownS] = useState(0)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })
  const volumeState = useVolumeState()

  useEffect(() => {
    const audio = new AudioEngine(
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      [],
      0,
      SCENERY_REGISTRY['kamakura-bay'].audio,
    )
    audioRef.current = audio
    const sync = () => setAudioUnlocked(getAudioContextState() === 'running')
    sync()
    const unsubscribe = subscribeAudioContextState(sync)
    return () => {
      unsubscribe()
      audio.dispose()
    }
  }, [])

  // Still mode has no `Engine`/`command()` channel — `ComfortSettings`' volume slider
  // writes to the shared store either way, so this is the "apply it" half for whichever
  // `AudioEngine` happens to be live here rather than in the 3D world.
  useEffect(() => {
    audioRef.current?.setMasterVolume(effectiveVolume(volumeState))
  }, [volumeState])

  useEffect(() => {
    // 1Hz, not rAF: decay/drift is a slow, non-critical animation, and this mode's whole
    // point is being light on the machine running it.
    const id = setInterval(() => {
      thoughtsRef.current.update(1)
      setThoughts(thoughtsRef.current.listLive())
      setCooldownS(thoughtsRef.current.authorCooldownS())
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (prefersReducedMotion()) return // "camera drift stops" — parallax is exactly that
    const onMove = (e: PointerEvent) => {
      setParallax({
        x: e.clientX / window.innerWidth - 0.5,
        y: e.clientY / window.innerHeight - 0.5,
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-[#1f4a8f]">
      <div
        className="absolute inset-0 transition-transform duration-300 ease-out"
        style={{
          background: 'linear-gradient(to bottom, #1f4a8f 0%, #6f80a8 55%, #d8c9ad 100%)',
          transform: `translate(${parallax.x * -PARALLAX_PX.sky}px, ${parallax.y * -PARALLAX_PX.sky}px) scale(1.05)`,
        }}
      />
      <div
        className="absolute inset-x-0 bottom-[28%] h-[14%] opacity-90 blur-[2px] transition-transform duration-300 ease-out"
        style={{
          background: 'linear-gradient(to bottom, rgba(216,201,173,0.25), rgba(140,170,190,0.55))',
          transform: `translate(${parallax.x * -PARALLAX_PX.sea}px, ${parallax.y * -PARALLAX_PX.sea}px) scale(1.08)`,
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[30%] transition-transform duration-300 ease-out"
        style={{
          background: 'linear-gradient(to bottom, #c9b898, #a89572)',
          transform: `translate(${parallax.x * -PARALLAX_PX.sand}px, ${parallax.y * -PARALLAX_PX.sand}px) scale(1.1)`,
        }}
      />

      <p className="text-glass-faint absolute bottom-10 left-1/2 -translate-x-1/2 text-sm">
        Kamakura Bay — 6:40 in the morning
      </p>

      <StillLanternLayer thoughts={thoughts} />
      <ThoughtComposer
        cooldownS={cooldownS}
        onSubmit={(text) => thoughtsRef.current.post(text, 0, 0)}
      />
      <AutoplayPill unlocked={audioUnlocked} onUnlock={() => void audioRef.current?.unlock()} />
      <ComfortSettings />
    </div>
  )
}
