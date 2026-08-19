'use client'

import { useEffect, useRef, useState } from 'react'
import type { EngineCommand } from '@/engine/core/Engine'

interface SkyClockProps {
  command?: (cmd: EngineCommand) => void
  /** The observatory scenery locks time-of-day to permanent night (`Engine.ts`'s
   * `#applyNormalizedTime` centralizes the actual enforcement) — dragging this dial
   * there would silently do nothing, which reads as broken rather than intentional.
   * Simplest fix: don't show a control that can't do anything. */
  locked?: boolean
}

/**
 * The day-cycle dial — redesigned to belong to this app's glass language.
 * Angle convention: left = dawn (0.25), top = midday (0.50), right = dusk (0.75), bottom = midnight (0/1).
 */
function getRealWorldTimeNormalized(): number {
  const now = new Date()
  return (now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60) / 1440
}

export function SkyClock({ command, locked }: SkyClockProps) {
  const [progress, setProgress] = useState(getRealWorldTimeNormalized)
  const [isDragging, setIsDragging] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const isNight = progress < 0.23 || progress > 0.77

  function updateFromPointer(clientX: number, clientY: number): void {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dx = clientX - centerX
    const dy = clientY - centerY

    let angleRad = Math.atan2(-dy, dx)
    if (angleRad < 0) angleRad += Math.PI * 2

    let p = 0.75 - angleRad / (Math.PI * 2)
    p = ((p % 1) + 1) % 1

    setProgress(p)
    command?.({ type: 'setTimeNormalized', progress: p })
  }

  function nudge(deltaMinutes: number): void {
    const p = (((progress + deltaMinutes / (24 * 60)) % 1) + 1) % 1
    setProgress(p)
    command?.({ type: 'setTimeNormalized', progress: p })
  }

  // Always-latest ref instead of a dependency — `updateFromPointer` is a fresh
  // function every render, and this effect should only resubscribe when dragging
  // actually starts/stops, not churn its global listeners on every unrelated render.
  // Written in its own effect, not during render — refs may only be read/written
  // outside render (event handlers, effects), never assigned inline in the render body.
  const updateFromPointerRef = useRef(updateFromPointer)
  useEffect(() => {
    updateFromPointerRef.current = updateFromPointer
  })

  useEffect(() => {
    if (!isDragging) return
    const handlePointerMove = (e: PointerEvent) =>
      updateFromPointerRef.current(e.clientX, e.clientY)
    const handlePointerUp = () => setIsDragging(false)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isDragging])

  if (locked) return null

  const totalMinutes = Math.floor(progress * 24 * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const timeFormatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

  const periodLabel =
    progress < 0.2 || progress >= 0.92
      ? 'Deep Night'
      : progress < 0.3
        ? 'Dawn'
        : progress < 0.47
          ? 'Morning'
          : progress < 0.53
            ? 'Midday'
            : progress < 0.7
              ? 'Afternoon'
              : progress < 0.8
                ? 'Dusk'
                : 'Evening'

  // Orb travels a 74-unit radius in the 180x180 viewBox — pushed out from the
  // original 62 so it (and the gradient ring under it) sit closer to the panel's
  // actual outer edge instead of leaving a wide empty band of glass between them.
  const orbAngleRad = (0.75 - progress) * Math.PI * 2
  const cx = 90 + 74 * Math.cos(orbAngleRad)
  const cy = 90 - 74 * Math.sin(orbAngleRad)

  return (
    <div className="group fixed top-3 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center select-none">
      <div className="relative rounded-full p-2">
        {/* The day-cycle ring: a warm-to-cool conic gradient standing in for the SVG's
            8-icon zodiac before it — one continuous sweep reads as "the arc of a day"
            at a glance, which a scatter of discrete sun/moon glyphs never quite did.
            A plain div, not SVG, because CSS conic-gradient does an angular color
            sweep for free; masked into a ring so only a thin band shows. Angles here
            follow CSS's own convention (0deg = top, clockwise) and are hand-placed to
            land on this dial's own left/top/right/bottom = dawn/midday/dusk/midnight
            layout — see this file's doc comment. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full opacity-80"
          style={{
            background:
              'conic-gradient(from 0deg, #fef3c7 0deg, #fdba9d 45deg, #fb923c 90deg, #7c6bb0 135deg, #2e2a5e 180deg, #1e1b4b 225deg, #7c6bb0 270deg, #fdba9d 315deg, #fef3c7 360deg)',
            // `inset-0` (not `inset-2`) so this div spans the panel's own true edge,
            // not just the inner SVG's box — `farthest-side` below is then 100% of the
            // PANEL's own radius, letting the band sit close to the panel's real outer
            // edge instead of leaving a wide gap of bare glass beyond it. Still centered
            // on the orb's 74-viewBox-unit travel radius, so the orb rides right on the
            // gradient rather than floating inside or outside it.
            WebkitMaskImage:
              'radial-gradient(farthest-side, transparent 63%, black 67%, black 78%, transparent 82%)',
            maskImage:
              'radial-gradient(farthest-side, transparent 63%, black 67%, black 78%, transparent 82%)',
          }}
        />

        {/* A small dark vignette behind just the digital readout — not the full glass
            panel this dial used to have (removed: it read as a heavy circle sitting on
            top of the scene). The clock now floats directly over the 3D world, so
            without SOME contrast boost the time/date text becomes unreadable against a
            bright sky. This only covers the text's own footprint, not the whole ring,
            so it stays a soft shadow rather than a panel. */}
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            left: '50%',
            top: '50%',
            width: 78,
            height: 78,
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(closest-side, rgba(0,0,0,0.55), rgba(0,0,0,0) 100%)',
          }}
        />

        <svg
          ref={svgRef}
          viewBox="0 0 180 180"
          className="relative h-40 w-40 touch-none cursor-pointer outline-none"
          role="slider"
          aria-label="Time of day"
          aria-valuemin={0}
          aria-valuemax={1439}
          aria-valuenow={totalMinutes}
          aria-valuetext={`${timeFormatted}, ${periodLabel}`}
          tabIndex={0}
          onPointerDown={(e) => {
            setIsDragging(true)
            updateFromPointer(e.clientX, e.clientY)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault()
              nudge(15)
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault()
              nudge(-15)
            }
          }}
        >
          <defs>
            <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fef9c3" stopOpacity="1" />
              <stop offset="55%" stopColor="#fbbf24" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#eef2ff" stopOpacity="1" />
              <stop offset="55%" stopColor="#a5b4fc" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#312e81" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Center digital readout */}
          <foreignObject x="40" y="70" width="100" height="42">
            <div className="flex h-full flex-col items-center justify-center gap-0.5">
              <span
                className="font-mono text-base font-bold tracking-wide text-white tabular-nums"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.6)' }}
              >
                {timeFormatted}
              </span>
              <span
                className="text-[9px] font-medium tracking-[0.08em] text-white/85 uppercase"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.6)' }}
              >
                {periodLabel}
              </span>
            </div>
          </foreignObject>

          {/* Draggable sun/moon handle */}
          <g
            transform={`translate(${cx}, ${cy})`}
            className={`transition-transform duration-150 ${isDragging ? 'scale-125' : 'group-hover:scale-110'}`}
          >
            <circle
              r="13"
              fill={isNight ? 'url(#moonGlow)' : 'url(#sunGlow)'}
              className="motion-safe:animate-[sky-orb-breathe_4s_ease-in-out_infinite] opacity-90"
            />
            <circle
              r="7"
              fill={isNight ? '#1e1b4b' : '#fbbf24'}
              stroke={isNight ? '#a5b4fc' : '#d97706'}
              strokeWidth="1.25"
            />
            {isNight ? (
              <path d="M 2.2 -4.4 A 4.4 4.4 0 1 1 -3.8 3.3 A 3.5 3.5 0 0 0 2.2 -4.4 Z" fill="#eef2ff" />
            ) : (
              <circle r="2.6" fill="#78350f" />
            )}
          </g>
        </svg>
      </div>
    </div>
  )
}
