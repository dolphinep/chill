'use client'

import { useEffect, useRef, useState } from 'react'
import type { EngineEvents } from '@/engine/core/EngineEventBus'
import {
  dismissHint,
  markHintDone,
  toggleHidden,
  tryShowHint,
  useActiveHint,
  useHudHidden,
} from '@/lib/hud/hudStore'
import { useHudActivity } from '@/lib/hud/useHudActivity'

/**
 * The product HUD's first two pieces: the intent-triggered "you can stand up" nudge
 * (Locomotion layer 3 — "the first mouse move... fades in one hairline"), and the global
 * `H` hide-all toggle with its one-time explainer toast.
 *
 * Deliberately separate from `DevStatsPanel`: that panel is a dev tool that happens to
 * live on screen, not chrome the ambient/hide-all rules are about. It still respects `H`
 * (see its own hidden check) — hiding "all UI" should mean all UI — but it does not
 * ambient-fade, because losing the stats mid-verification would be actively unhelpful.
 */

const TOAST_MS = 1000

export function HintLayer({ stats }: { stats: EngineEvents['stats'] | null }) {
  const hidden = useHudHidden()
  const activeHint = useActiveHint()
  const { ambient } = useHudActivity()
  const [toastOpen, setToastOpen] = useState(false)
  const triedStandHint = useRef(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyH' || e.metaKey || e.ctrlKey || e.altKey) return
      toggleHidden()
      if (tryShowHint('hide-all-toast')) {
        setToastOpen(true)
        setTimeout(() => {
          setToastOpen(false)
          dismissHint('hide-all-toast')
        }, TOAST_MS)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The nudge is intent-triggered, not a timer: a mouse move means "I'm here, curious" —
  // a fixed delay would fire the same for someone who left the tab in the background.
  useEffect(() => {
    if (!stats || stats.characterState !== 'sit' || triedStandHint.current) return
    const onMove = () => {
      triedStandHint.current = true
      tryShowHint('stand-up')
      window.removeEventListener('pointermove', onMove)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [stats])

  // "Never again once performed" — standing up retires this hint for good, independent
  // of the show-count cap.
  useEffect(() => {
    if (stats?.characterState === 'stand') markHintDone('stand-up')
  }, [stats?.characterState])

  if (hidden) return <FadingLine show={toastOpen}>H brings it back</FadingLine>

  return (
    <>
      <FadingLine show={activeHint === 'stand-up' && !ambient}>WASD to explore</FadingLine>
      <FadingLine show={toastOpen}>H brings it back</FadingLine>
    </>
  )
}

/**
 * A hairline of text that dissolves rather than popping out — matches the boot dissolve
 * and the Locomotion table's "the hint dissolves" language for the same transition.
 *
 * Stays mounted at `opacity: 0` rather than unmounting after the fade — it is a single
 * `pointer-events-none` paragraph, so there is nothing an always-mounted copy costs, and
 * it sidesteps needing state (and an effect) just to re-run a mount/unmount dance every
 * time `show` flips. CSS does the whole transition on its own.
 */
function FadingLine({
  show,
  durationMs = 300,
  children,
}: {
  show: boolean
  durationMs?: number
  children: React.ReactNode
}) {
  return (
    <p
      className="text-glass-faint pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 text-[13px] transition-opacity ease-out"
      style={{ opacity: show ? 1 : 0, transitionDuration: `${durationMs}ms` }}
      aria-hidden={!show}
    >
      {children}
    </p>
  )
}
