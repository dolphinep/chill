'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useCoinStore, coinStore } from '@/lib/coins/coinStore'
import { useSceneryId } from '@/lib/scenery/sceneryStore'
import type { EngineCommand } from '@/engine/core/Engine'
import { TARGET_FROSTHOLM_COINS } from '@/engine/scenery/FrostholmCoinField'

interface CoinHudProps {
  command?: (cmd: EngineCommand) => void
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const tenths = Math.floor((ms % 1000) / 100)
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${tenths}`
}

interface RankInfo {
  label: string
  tag: string
  color: string
  badgeColor: string
}

function getRank(timeMs: number): RankInfo {
  if (timeMs < 30_000) {
    return {
      label: 'S-Rank',
      tag: 'Legendary Ski God',
      color: 'text-amber-300 border-amber-400/40 bg-amber-500/15',
      badgeColor: 'text-amber-300 bg-amber-500/20 border-amber-400/50',
    }
  }
  if (timeMs < 45_000) {
    return {
      label: 'A-Rank',
      tag: 'Alpine Champion',
      color: 'text-cyan-300 border-cyan-400/40 bg-cyan-500/15',
      badgeColor: 'text-cyan-300 bg-cyan-500/20 border-cyan-400/50',
    }
  }
  if (timeMs < 65_000) {
    return {
      label: 'B-Rank',
      tag: 'Master Downhill Racer',
      color: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/15',
      badgeColor: 'text-emerald-300 bg-emerald-500/20 border-emerald-400/50',
    }
  }
  return {
    label: 'C-Rank',
    tag: 'Alpine Finisher',
    color: 'text-purple-300 border-purple-400/40 bg-purple-500/15',
    badgeColor: 'text-purple-300 bg-purple-500/20 border-purple-400/50',
  }
}

function TimerIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 2h4" strokeLinecap="round" />
      <path d="M19 6l1.5-1.5" strokeLinecap="round" />
    </svg>
  )
}

function RefreshIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CoinHud({ command }: CoinHudProps) {
  const sceneryId = useSceneryId()
  const { collectedIds, startTimeMs, completedTimeMs, bestTimeMs } = useCoinStore()
  const [justCollected, setJustCollected] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isDismissed, setIsDismissed] = useState(false)
  const prevCountRef = useRef(collectedIds.length)

  const isComplete = collectedIds.length >= TARGET_FROSTHOLM_COINS
  const showCelebration = isComplete && !isDismissed

  // Live Timer tick
  useEffect(() => {
    if (!startTimeMs || isComplete) return
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTimeMs)
    }, 100)
    return () => clearInterval(interval)
  }, [startTimeMs, isComplete])

  // Collection pulse animation
  useEffect(() => {
    if (collectedIds.length > prevCountRef.current) {
      prevCountRef.current = collectedIds.length
      setJustCollected(true)
      const timeout = setTimeout(() => setJustCollected(false), 500)
      return () => clearTimeout(timeout)
    }
    prevCountRef.current = collectedIds.length
  }, [collectedIds.length])

  // Auto-dissolve celebration flare after 7 seconds
  useEffect(() => {
    if (!isComplete) return
    const timer = setTimeout(() => {
      setIsDismissed(true)
    }, 7000)
    return () => clearTimeout(timer)
  }, [isComplete])

  // Handle ESC key to dismiss celebration
  useEffect(() => {
    if (!showCelebration) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDismissed(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCelebration])

  // Only render on Frostholm Ridge
  if (sceneryId !== 'frostholm-ridge') return null

  const collectedCount = collectedIds.length
  const displayElapsed = isComplete && completedTimeMs ? completedTimeMs : (startTimeMs ? elapsedMs : 0)
  const rank = completedTimeMs ? getRank(completedTimeMs) : null

  const handleReset = () => {
    coinStore.resetRun()
    command?.({ type: 'resetCoins' })
    setIsDismissed(false)
    setElapsedMs(0)
  }

  return (
    <>
      {/* Top-Right HUD Pill */}
      <div className="fixed top-5 right-5 z-30 pointer-events-auto flex items-center gap-3">
        <div
          className={`glass flex items-center gap-3.5 px-4 py-2.5 rounded-2xl border transition-all duration-300 shadow-xl backdrop-blur-xl ${
            justCollected
              ? 'border-amber-400/80 bg-amber-500/20 scale-105 shadow-amber-500/25'
              : isComplete
                ? 'border-emerald-400/60 bg-emerald-500/20 shadow-emerald-500/20'
                : 'border-white/20 bg-black/40 hover:bg-black/50'
          }`}
        >
          {/* Animated Gold Coin Icon */}
          <div className="relative flex h-8 w-8 items-center justify-center">
            <div
              className={`absolute inset-0 rounded-full bg-amber-400/30 blur-sm transition-opacity duration-300 ${
                justCollected ? 'opacity-100 scale-125' : 'opacity-60'
              }`}
            />
            <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-linear-to-tr from-amber-600 via-amber-400 to-yellow-200 border border-yellow-100 shadow-md text-amber-950 font-black text-xs select-none">
              ★
            </div>
          </div>

          {/* Stats Column */}
          <div className="flex flex-col select-none">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-white tracking-wide">
                {collectedCount} / {TARGET_FROSTHOLM_COINS}
              </span>
              <span className="text-[10px] uppercase font-semibold text-amber-300/90">
                COINS
              </span>
            </div>

            {/* Speedrun Timer */}
            <div className="flex items-center gap-1.5 text-[11px] text-white/80 font-mono">
              <TimerIcon className="text-white/60" />
              <span className={isComplete ? 'text-emerald-300 font-bold' : 'text-cyan-300'}>
                {formatTime(displayElapsed)}
              </span>
              {bestTimeMs && (
                <span className="text-[10px] text-amber-300/70 ml-1">
                  (Best: {formatTime(bestTimeMs)})
                </span>
              )}
            </div>
          </div>

          {/* Reset Run Button */}
          {collectedCount > 0 && (
            <button
              onClick={handleReset}
              title="Reset Coin Run"
              aria-label="Reset Coin Run"
              className="ml-1 rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/60 hover:text-white hover:bg-white/15 hover:border-white/30 transition-all active:scale-95 text-[11px] flex items-center gap-1"
            >
              <RefreshIcon />
            </button>
          )}
        </div>
      </div>

      {/* Minimal & Elegant Level Up / Course Clear Cinematic Flare (Positioned below SkyClock) */}
      {showCelebration && (
        <div className="fixed inset-x-0 top-48 sm:top-50 z-30 pointer-events-none flex flex-col items-center select-none animate-in fade-in zoom-in-95 duration-700">
          {/* Subtle Golden Glow / Aura Behind Text */}
          <div className="absolute -inset-8 rounded-full bg-radial from-amber-400/25 via-amber-500/10 to-transparent blur-3xl -z-10" />

          {/* Subtitle */}
          <div className="flex items-center gap-3">
            <span className="h-px w-10 bg-linear-to-r from-transparent to-amber-300/70" />
            <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-amber-200/90 font-medium">
              FROSTHOLM RIDGE
            </span>
            <span className="h-px w-10 bg-linear-to-l from-transparent to-amber-300/70" />
          </div>

          {/* Main Monumental Title (Cinzel Typography) */}
          <h1 className="mt-2 font-[family-name:var(--font-constellation)] text-4xl sm:text-5xl font-normal tracking-[0.22em] text-transparent bg-clip-text bg-linear-to-b from-yellow-100 via-amber-200 to-amber-400 drop-shadow-[0_4px_24px_rgba(251,191,36,0.45)]">
            COURSE CLEAR
          </h1>

          {/* Decorative Divider Line with Center Diamond */}
          <div className="flex items-center gap-2 mt-2.5 w-56 sm:w-72">
            <span className="h-px flex-1 bg-linear-to-r from-transparent to-amber-400/80" />
            <span className="rotate-45 block h-1.5 w-1.5 bg-amber-300 shadow-[0_0_10px_#fde047]" />
            <span className="h-px flex-1 bg-linear-to-l from-transparent to-amber-400/80" />
          </div>

          {/* Minimal Floating Stats Badge */}
          <div className="flex items-center gap-3 mt-3 px-5 py-1.5 rounded-full bg-black/40 border border-amber-400/30 backdrop-blur-md shadow-2xl">
            <div className="flex items-center gap-1.5 font-mono text-xs text-white/90">
              <span className="text-[10px] text-white/50 tracking-wider">TIME</span>
              <span className="font-bold text-amber-200 tracking-tight">
                {completedTimeMs ? formatTime(completedTimeMs) : '--:--.-'}
              </span>
            </div>

            <span className="text-white/30 text-xs">·</span>

            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${rank?.badgeColor ?? 'text-white border-white/20'}`}>
                {rank?.label ?? 'S-Rank'}
              </span>
              <span className="text-xs font-medium text-amber-100/90">
                {rank?.tag ?? 'Alpine Champion'}
              </span>
            </div>

            {bestTimeMs && (
              <>
                <span className="text-white/30 text-xs">·</span>
                <div className="flex items-center gap-1 font-mono text-[11px] text-white/60">
                  <span className="text-[9px] text-white/40">BEST</span>
                  <span>{formatTime(bestTimeMs)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
