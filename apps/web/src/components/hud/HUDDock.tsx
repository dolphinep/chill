'use client'

import React, { useEffect, useState } from 'react'
import type { EngineCommand } from '@/engine/core/Engine'
import type { EngineEvents } from '@/engine/core/EngineEventBus'
import { useSceneryId } from '@/lib/scenery/sceneryStore'
import {
  getTerrainProjectileType,
  type ProjectileMaterialType,
} from '@/engine/character/ProjectileField'
import { SoundModal } from './SoundModal'
import { SceneryModal } from './SceneryModal'
import { ComfortSettings } from './ComfortSettings'
import { ChibiCustomizerModal } from './ChibiCustomizerModal'
import { LanDockIcon, LanShareModal } from './LanShareModal'
import { PropPaletteModal } from './PropPaletteModal'
import { CompanionModal } from './CompanionModal'
import { ConstellationModal } from './ConstellationModal'
import { useCompanionStore } from '@/lib/companion/companionStore'
import type { ConstellationSummary } from '@/engine/sky/ConstellationField'

function SitIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
    >
      {/* Head */}
      <circle cx="9" cy="5" r="2.5" />
      {/* Seated torso & legs */}
      <path d="M9 7.5v6.5h6v5.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Arms resting */}
      <path d="M9 11h4.5v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StandIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
    >
      {/* Head */}
      <circle cx="12" cy="5" r="2.5" />
      {/* Standing body & legs */}
      <path d="M12 7.5v7m-3 5.5l3-5.5 3 5.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Arms */}
      <path d="M8 11.5l4-1.5 4 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ThrowIcon({ type }: { type: ProjectileMaterialType }) {
  if (type === 'snow') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-5 w-5"
      >
        <circle cx="12" cy="12" r="5" fill="currentColor" fillOpacity={0.2} />
        <path
          d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6l2.1-2.1"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (type === 'sand') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-5 w-5"
      >
        <circle cx="9" cy="13" r="4.5" fill="currentColor" fillOpacity={0.2} />
        <circle cx="17" cy="8" r="1.5" fill="currentColor" />
        <circle cx="18" cy="15" r="1.2" fill="currentColor" />
        <circle cx="15" cy="18" r="1.5" fill="currentColor" />
        <path d="M4 14c2-4 5-6 9-6" strokeLinecap="round" strokeDasharray="1.5 2" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
    >
      <path
        d="M7 14c0-3.5 2.5-6 6-6s6 2.5 6 6-2.5 5-6 5-6-1.5-6-5z"
        fill="currentColor"
        fillOpacity={0.25}
      />
      <circle cx="10" cy="12" r="1.2" fill="currentColor" />
      <circle cx="14" cy="11" r="1.5" fill="currentColor" />
      <circle cx="12" cy="15" r="1" fill="currentColor" />
      <path d="M4 11c2-3 5-4.5 8-4.5" strokeLinecap="round" strokeDasharray="1.5 2" />
    </svg>
  )
}

function PetIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
    >
      <circle cx="12" cy="14" r="4" fill="currentColor" fillOpacity={0.25} />
      <ellipse cx="7" cy="9.5" rx="1.8" ry="2.2" fill="currentColor" />
      <ellipse cx="17" cy="9.5" rx="1.8" ry="2.2" fill="currentColor" />
      <ellipse cx="10.2" cy="7" rx="1.6" ry="2" fill="currentColor" />
      <ellipse cx="13.8" cy="7" rx="1.6" ry="2" fill="currentColor" />
    </svg>
  )
}

export function DockTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute -top-10 left-1/2 z-50 -translate-x-1/2 translate-y-1 rounded-lg border border-white/20 bg-slate-950/90 px-3 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-2xl backdrop-blur-md transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-slate-950/90 after:content-['']">
      {children}
    </div>
  )
}

export function HUDDock({
  ready,
  command,
  stats,
  getConstellationNames,
  isConstellationVisible,
}: {
  ready?: boolean
  command?: (cmd: EngineCommand) => void
  stats?: EngineEvents['stats'] | null
  getConstellationNames?: () => ConstellationSummary[]
  isConstellationVisible?: (id: string) => boolean
}) {
  const [activeModal, setActiveModal] = useState<
    'sound' | 'character' | 'display' | 'scenery' | 'lan' | 'props' | 'constellation' | null
  >(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { isOpen: isCompanionOpen, setIsOpen: setCompanionOpen } = useCompanionStore()
  const sceneryId = useSceneryId()

  const isSitting = stats?.characterState === 'sit'
  const sitLabel = isSitting ? 'Stand Up (X)' : 'Sit Down (X)'
  const throwType = getTerrainProjectileType(sceneryId)
  const throwLabel =
    throwType === 'snow'
      ? 'Throw Snowball (F)'
      : throwType === 'sand'
        ? 'Throw Sand (F)'
        : 'Throw Soil (F)'

  // Keyboard shortcut listener to toggle modal panels
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const active =
        typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
      if (
        (target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)) ||
        (active &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable))
      ) {
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.code === 'KeyE') {
        setIsCollapsed(false)
        setActiveModal((cur) => (cur === 'props' ? null : 'props'))
      } else if (e.code === 'KeyM') {
        setIsCollapsed(false)
        setActiveModal((cur) => (cur === 'sound' ? null : 'sound'))
      } else if (e.code === 'KeyC') {
        setIsCollapsed(false)
        setActiveModal((cur) => (cur === 'character' ? null : 'character'))
      } else if (e.code === 'KeyO') {
        setIsCollapsed(false)
        setActiveModal((cur) => (cur === 'display' ? null : 'display'))
      } else if (e.code === 'KeyK') {
        setIsCollapsed(false)
        setActiveModal((cur) => (cur === 'scenery' ? null : 'scenery'))
      } else if (e.code === 'KeyP') {
        setIsCollapsed(false)
        setCompanionOpen(!isCompanionOpen)
      } else if (e.code === 'KeyL') {
        setIsCollapsed(false)
        setActiveModal((cur) => (cur === 'lan' ? null : 'lan'))
      } else if (e.code === 'KeyN' && sceneryId === 'observatory') {
        setIsCollapsed(false)
        setActiveModal((cur) => (cur === 'constellation' ? null : 'constellation'))
      } else if (e.code === 'Escape') {
        setActiveModal(null)
        setCompanionOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isCompanionOpen, setCompanionOpen, sceneryId])

  return (
    <>
      {/* Collapsed state: Minimal Expand Handle docked at the very bottom edge of screen */}
      <div
        className={`fixed bottom-1.5 sm:bottom-2 left-1/2 z-40 -translate-x-1/2 select-none transition-all duration-300 ${
          isCollapsed
            ? 'translate-y-0 opacity-100 scale-100 pointer-events-auto'
            : 'translate-y-6 opacity-0 scale-90 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          aria-label="Expand Toolbar"
          title="Expand Toolbar"
          className="glass flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-white/80 shadow-2xl backdrop-blur-md transition hover:bg-white/15 hover:text-white hover:scale-105 active:scale-95"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            className="h-3.5 w-3.5 text-white/70"
          >
            <path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="tracking-wide">Toolbar</span>
        </button>
      </div>

      {/* Main Floating Bottom Dock */}
      <div
        className={`fixed bottom-4 sm:bottom-6 left-1/2 z-40 -translate-x-1/2 flex items-center gap-1.5 overflow-visible rounded-2xl border border-white/15 p-1.5 shadow-2xl backdrop-blur-md transition-all duration-300 ease-out select-none glass contain-none ${
          isCollapsed
            ? 'translate-y-[calc(100%+36px)] opacity-0 pointer-events-none scale-95'
            : 'translate-y-0 opacity-100 scale-100 pointer-events-auto'
        }`}
      >
        {/* Collapse Handle Tab attached right above the center of dock - matching toolbar color & glass */}
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          aria-label="Hide toolbar"
          title="Hide toolbar"
          className="glass group absolute -top-3.5 left-1/2 -translate-x-1/2 flex h-4.5 w-10 items-center justify-center rounded-full border border-white/15 text-white/60 shadow-md backdrop-blur-md transition hover:bg-white/15 hover:text-white active:scale-95"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            className="h-3 w-3 transition-transform group-hover:translate-y-0.5"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

          {/* 1. Sit / Stand Toggle Button */}
          <div className="group relative flex flex-col items-center">
            <DockTooltip>{sitLabel}</DockTooltip>
            <button
              type="button"
              title={sitLabel}
              onClick={() => command?.({ type: 'togglePosture' })}
              className={`flex min-w-10.5 flex-col items-center justify-center rounded-xl px-2.5 pt-2 pb-1.5 transition active:scale-95 ${
                isSitting
                  ? 'bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                  : 'text-white/80 hover:bg-white/15 hover:text-white'
              }`}
              aria-label={sitLabel}
            >
              {isSitting ? <StandIcon /> : <SitIcon />}
              <span className="mt-1 font-mono text-[9px] leading-none font-medium tracking-tight text-white/50 transition-colors group-hover:text-white/90">
                X
              </span>
            </button>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-white/15" />

          {/* 2. Throw Action Button (Snow / Sand / Soil) */}
          <div className="group relative flex flex-col items-center">
            <DockTooltip>{throwLabel}</DockTooltip>
            <button
              type="button"
              title={throwLabel}
              onClick={() => command?.({ type: 'throwProjectile' })}
              className="flex min-w-10.5 flex-col items-center justify-center rounded-xl px-2.5 pt-2 pb-1.5 text-white/80 transition hover:bg-white/15 hover:text-white active:scale-90"
              aria-label={throwLabel}
            >
              <ThrowIcon type={throwType} />
              <span className="mt-1 font-mono text-[9px] leading-none font-medium tracking-tight text-white/50 transition-colors group-hover:text-white/90">
                F
              </span>
            </button>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-white/15" />

          {/* 3. Place Props Button */}
          <div className="group relative flex flex-col items-center">
            <DockTooltip>Place Props & Items (E)</DockTooltip>
            <button
              type="button"
              title="Place Props & Items (E)"
              onClick={() => setActiveModal((cur) => (cur === 'props' ? null : 'props'))}
              className={`flex min-w-10.5 flex-col items-center justify-center rounded-xl px-2.5 pt-2 pb-1.5 transition active:scale-95 ${
                activeModal === 'props'
                  ? 'bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                  : 'text-white/80 hover:bg-white/15 hover:text-white'
              }`}
              aria-label="Place Props & Items (E)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-5 w-5"
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <span className="mt-1 font-mono text-[9px] leading-none font-medium tracking-tight text-white/50 transition-colors group-hover:text-white/90">
                E
              </span>
            </button>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-white/15" />

          {/* 4. Sound Button */}
          <div className="group relative flex flex-col items-center">
            <DockTooltip>Sound & Ambience (M)</DockTooltip>
            <button
              type="button"
              title="Sound & Ambience (M)"
              onClick={() => setActiveModal((cur) => (cur === 'sound' ? null : 'sound'))}
              className={`flex min-w-10.5 flex-col items-center justify-center rounded-xl px-2.5 pt-2 pb-1.5 transition active:scale-95 ${
                activeModal === 'sound'
                  ? 'bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                  : 'text-white/80 hover:bg-white/15 hover:text-white'
              }`}
              aria-label="Sound & Ambience (M)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-5 w-5"
              >
                <path d="M9 18V5l12-2v13" strokeLinejoin="round" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <span className="mt-1 font-mono text-[9px] leading-none font-medium tracking-tight text-white/50 transition-colors group-hover:text-white/90">
                M
              </span>
            </button>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-white/15" />

          {/* 4. Character Button */}
          <div className="group relative flex flex-col items-center">
            <DockTooltip>Avatar Studio (C)</DockTooltip>
            <button
              type="button"
              title="Avatar Studio (C)"
              onClick={() => setActiveModal((cur) => (cur === 'character' ? null : 'character'))}
              className={`flex min-w-10.5 flex-col items-center justify-center rounded-xl px-2.5 pt-2 pb-1.5 transition active:scale-95 ${
                activeModal === 'character'
                  ? 'bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                  : 'text-white/80 hover:bg-white/15 hover:text-white'
              }`}
              aria-label="Avatar Studio (C)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-5 w-5"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="mt-1 font-mono text-[9px] leading-none font-medium tracking-tight text-white/50 transition-colors group-hover:text-white/90">
                C
              </span>
            </button>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-white/15" />

          {/* 5. Pet Companion AI Button */}
          <div className="group relative flex flex-col items-center">
            <DockTooltip>AI Companion (P)</DockTooltip>
            <button
              type="button"
              title="AI Companion (P)"
              onClick={() => setCompanionOpen(!isCompanionOpen)}
              className={`flex min-w-10.5 flex-col items-center justify-center rounded-xl px-2.5 pt-2 pb-1.5 transition active:scale-95 ${
                isCompanionOpen
                  ? 'bg-amber-400/30 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.35)] ring-1 ring-amber-400/60'
                  : 'text-white/80 hover:bg-white/15 hover:text-white'
              }`}
              aria-label="AI Companion (P)"
            >
              <PetIcon />
              <span className="mt-1 font-mono text-[9px] leading-none font-medium tracking-tight text-amber-200/80 transition-colors group-hover:text-amber-200">
                P
              </span>
            </button>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-white/15" />

          {/* 6. Display Button */}
          <div className="group relative flex flex-col items-center">
            <DockTooltip>Display & Comfort (O)</DockTooltip>
            <button
              type="button"
              title="Display & Comfort (O)"
              onClick={() => setActiveModal((cur) => (cur === 'display' ? null : 'display'))}
              className={`flex min-w-10.5 flex-col items-center justify-center rounded-xl px-2.5 pt-2 pb-1.5 transition active:scale-95 ${
                activeModal === 'display'
                  ? 'bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                  : 'text-white/80 hover:bg-white/15 hover:text-white'
              }`}
              aria-label="Display & Comfort (O)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-5 w-5"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              <span className="mt-1 font-mono text-[9px] leading-none font-medium tracking-tight text-white/50 transition-colors group-hover:text-white/90">
                O
              </span>
            </button>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-white/15" />

          {/* 7. Scenery Button */}
          <div className="group relative flex flex-col items-center">
            <DockTooltip>Scenery Selector</DockTooltip>
            <button
              type="button"
              title="Scenery Selector"
              onClick={() => setActiveModal((cur) => (cur === 'scenery' ? null : 'scenery'))}
              className={`flex min-w-10.5 flex-col items-center justify-center rounded-xl px-2.5 pt-2 pb-1.5 transition active:scale-95 ${
                activeModal === 'scenery'
                  ? 'bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                  : 'text-white/80 hover:bg-white/15 hover:text-white'
              }`}
              aria-label="Scenery Selector"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-5 w-5"
              >
                <path d="M8 18l4-8 4 8" />
                <path d="M3 20l6-12 5 10" />
                <path d="M14 18l3-5 4 7" />
              </svg>
              <span className="mt-1 font-mono text-[9px] leading-none font-medium tracking-tight text-white/50 transition-colors group-hover:text-white/90">
                K
              </span>
            </button>
          </div>

          {/* 7b. Constellations Button — observatory scenery only */}
          {sceneryId === 'observatory' && (
            <>
              <div className="h-4 w-px bg-white/15" />
              <div className="group relative flex flex-col items-center">
                <DockTooltip>Search Constellations</DockTooltip>
                <button
                  type="button"
                  title="Search Constellations"
                  onClick={() => setActiveModal((cur) => (cur === 'constellation' ? null : 'constellation'))}
                  className={`flex min-w-10.5 flex-col items-center justify-center rounded-xl px-2.5 pt-2 pb-1.5 transition active:scale-95 ${
                    activeModal === 'constellation'
                      ? 'bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                      : 'text-white/80 hover:bg-white/15 hover:text-white'
                  }`}
                  aria-label="Search Constellations"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    className="h-5 w-5"
                  >
                    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
                    <circle cx="6" cy="7" r="1" fill="currentColor" stroke="none" />
                    <circle cx="18" cy="6" r="1" fill="currentColor" stroke="none" />
                    <circle cx="17" cy="16" r="1" fill="currentColor" stroke="none" />
                    <path d="M12 12L6 7M12 12l6-6M12 12l5 4" strokeLinecap="round" />
                  </svg>
                  <span className="mt-1 font-mono text-[9px] leading-none font-medium tracking-tight text-white/50 transition-colors group-hover:text-white/90">
                    N
                  </span>
                </button>
              </div>
            </>
          )}

          {/* Divider */}
          <div className="h-4 w-px bg-white/15" />

          {/* 8. LAN Share Button */}
          <LanDockIcon onClick={() => setActiveModal((cur) => (cur === 'lan' ? null : 'lan'))} />

          {/* Divider */}
          <div className="h-4 w-px bg-white/15" />

          {/* 9. User Manual / Guide Button */}
          <div className="group relative flex flex-col items-center">
            <DockTooltip>Player&apos;s Manual</DockTooltip>
            <a
              href="/manual"
              target="_blank"
              rel="noreferrer"
              title="Player's Manual"
              className="flex min-w-10.5 flex-col items-center justify-center rounded-xl px-2.5 pt-2 pb-1.5 text-white/80 transition hover:bg-white/15 hover:text-cyan-300 active:scale-95"
              aria-label="Player's Manual"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-5 w-5"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <path d="M9 7h6" />
                <path d="M9 11h4" />
              </svg>
              <span className="mt-1 font-mono text-[9px] leading-none font-medium tracking-tight text-cyan-300/80 transition-colors group-hover:text-cyan-200">
                ?
              </span>
            </a>
          </div>
        </div>

      {/* Modals */}
      <CompanionModal command={command} />

      <SoundModal
        isOpen={activeModal === 'sound'}
        onClose={() => setActiveModal(null)}
        command={command}
      />

      {activeModal === 'character' && (
        <ChibiCustomizerModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          command={command}
        />
      )}

      <SceneryModal isOpen={activeModal === 'scenery'} onClose={() => setActiveModal(null)} />

      {activeModal === 'display' && (
        <ComfortSettings
          ready={ready}
          command={command}
          stats={stats}
          forceOpen={true}
          onClose={() => setActiveModal(null)}
        />
      )}

      <LanShareModal isOpen={activeModal === 'lan'} onClose={() => setActiveModal(null)} />

      {activeModal === 'props' && (
        <PropPaletteModal onClose={() => setActiveModal(null)} command={command} />
      )}

      <ConstellationModal
        isOpen={activeModal === 'constellation'}
        onClose={() => setActiveModal(null)}
        command={command}
        names={getConstellationNames?.() ?? []}
        isVisible={isConstellationVisible}
        ready={ready}
      />
    </>
  )
}
