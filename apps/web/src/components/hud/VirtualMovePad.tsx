'use client'

import React, { useState, useRef, useEffect } from 'react'
import type { EngineCommand } from '@/engine/core/Engine'

interface VirtualMovePadProps {
  command?: (cmd: EngineCommand) => void
}

const JOYSTICK_RADIUS = 52 // Max drag radius in pixels
const SPRINT_THRESHOLD = 0.72 // 72% drag distance triggers sprint

export function VirtualMovePad({ command }: VirtualMovePadProps) {
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isActive, setIsActive] = useState(false)
  const [isSprint, setIsSprint] = useState(false)
  const padRef = useRef<HTMLDivElement>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const updatePosition = (clientX: number, clientY: number) => {
    const dx = clientX - centerRef.current.x
    const dy = clientY - centerRef.current.y
    const dist = Math.hypot(dx, dy)
    const clampedDist = Math.min(dist, JOYSTICK_RADIUS)
    const angle = Math.atan2(dy, dx)

    const clampedX = Math.cos(angle) * clampedDist
    const clampedY = Math.sin(angle) * clampedDist

    setKnobPos({ x: clampedX, y: clampedY })

    // Normalize movement: X = right (+1) / left (-1), Z = backward (+1) / forward (-1)
    const normX = clampedX / JOYSTICK_RADIUS
    const normZ = clampedY / JOYSTICK_RADIUS
    const sprinting = dist / JOYSTICK_RADIUS >= SPRINT_THRESHOLD

    setIsSprint(sprinting)
    command?.({
      type: 'virtualMove',
      moveX: normX,
      moveZ: normZ,
      run: sprinting,
    })
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activePointerIdRef.current !== null) return
    activePointerIdRef.current = e.pointerId
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    if (padRef.current) {
      const rect = padRef.current.getBoundingClientRect()
      centerRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
    }

    setIsActive(true)
    updatePosition(e.clientX, e.clientY)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activePointerIdRef.current !== e.pointerId) return
    updatePosition(e.clientX, e.clientY)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activePointerIdRef.current !== e.pointerId) return
    activePointerIdRef.current = null
    setIsActive(false)
    setIsSprint(false)
    setKnobPos({ x: 0, y: 0 })
    command?.({
      type: 'virtualMove',
      moveX: 0,
      moveZ: 0,
      run: false,
    })
  }

  // Safety cleanup if pointer is lost
  useEffect(() => {
    const onWindowPointerUp = () => {
      if (activePointerIdRef.current !== null) {
        activePointerIdRef.current = null
        setIsActive(false)
        setIsSprint(false)
        setKnobPos({ x: 0, y: 0 })
        command?.({
          type: 'virtualMove',
          moveX: 0,
          moveZ: 0,
          run: false,
        })
      }
    }
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerUp)
    return () => {
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointercancel', onWindowPointerUp)
    }
  }, [command])

  const handleJump = () => {
    command?.({ type: 'virtualJump' })
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 sm:bottom-24 z-30 flex items-end justify-between px-4 sm:px-8 select-none xl:hidden">
      {/* 1. Left Virtual Joystick Move Pad */}
      <div className="pointer-events-auto flex flex-col items-center">
        <div
          ref={padRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`glass relative flex h-32 w-32 touch-none items-center justify-center rounded-full border transition-all duration-150 shadow-2xl backdrop-blur-xl ${
            isActive
              ? 'border-amber-400/60 bg-slate-950/60 shadow-[0_0_24px_rgba(251,191,36,0.25)]'
              : 'border-white/20 bg-slate-950/40 hover:border-white/35'
          }`}
        >
          {/* Subtle Directional Marks */}
          <span className="pointer-events-none absolute top-2 font-mono text-[10px] font-bold text-white/40">
            ▲
          </span>
          <span className="pointer-events-none absolute bottom-2 font-mono text-[10px] font-bold text-white/40">
            ▼
          </span>
          <span className="pointer-events-none absolute left-2 font-mono text-[10px] font-bold text-white/40">
            ◀
          </span>
          <span className="pointer-events-none absolute right-2 font-mono text-[10px] font-bold text-white/40">
            ▶
          </span>

          {/* Inner Motion Track Ring */}
          <div className="pointer-events-none absolute h-16 w-16 rounded-full border border-dashed border-white/15" />

          {/* Dynamic Thumb Knob */}
          <div
            className={`pointer-events-none relative flex h-14 w-14 items-center justify-center rounded-full border shadow-xl transition-transform ${
              isActive
                ? isSprint
                  ? 'border-amber-300 bg-linear-to-tr from-amber-600 via-amber-500 to-yellow-300 shadow-amber-500/40 scale-105'
                  : 'border-cyan-300 bg-linear-to-tr from-cyan-600 via-cyan-500 to-sky-300 shadow-cyan-500/30'
                : 'border-white/30 bg-white/20'
            }`}
            style={{
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
              transition: isActive ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
            }}
          >
            <div className="h-4 w-4 rounded-full bg-white/60 shadow-inner" />
          </div>
        </div>

        {/* Sprint / Walk Status Indicator */}
        <span
          className={`mt-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
            isSprint ? 'text-amber-300 drop-shadow' : isActive ? 'text-cyan-300' : 'text-white/40'
          }`}
        >
          {isSprint ? 'Sprint' : isActive ? 'Walk' : 'Move'}
        </span>
      </div>

      {/* 2. Right Jump & Action Button */}
      <div className="pointer-events-auto flex flex-col items-center">
        <button
          type="button"
          onPointerDown={handleJump}
          aria-label="Jump"
          className="glass flex h-16 w-16 touch-none items-center justify-center rounded-full border border-white/25 bg-slate-950/45 text-white shadow-2xl backdrop-blur-xl transition-all duration-100 hover:bg-white/20 active:scale-90 active:border-amber-400 active:bg-amber-500/25"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-6 w-6 text-white/90">
            <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white/40">
          Jump
        </span>
      </div>
    </div>
  )
}
