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

function TrophyIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2M6 3h12v7a6 6 0 0 1-12 0V3z" strokeLinejoin="round" />
      <path d="M12 16v4M8 20h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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

function CloseIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
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

  // Handle ESC key to dismiss celebration modal
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

      {/* Victory Speedrun Celebration Modal */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150 pointer-events-auto">
          {/* Click outside to dismiss */}
          <div className="fixed inset-0" onClick={() => setIsDismissed(true)} />

          {/* Modal Container */}
          <div
            className="animate-in fade-in zoom-in-95 relative z-10 flex w-full max-w-md flex-col gap-4 overflow-hidden rounded-2xl border border-white/15 bg-slate-950/90 p-5 text-white shadow-2xl backdrop-blur-xl duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 shadow">
                  <TrophyIcon className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-wide">
                    Challenge Completed
                  </h2>
                  <p className="text-[10px] text-white/50">
                    Frostholm Ridge · Coin Speedrun
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDismissed(true)}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex flex-col gap-3">
              {/* Primary Stats Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Time Card */}
                <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between text-white/50 text-[10px] font-semibold tracking-wider uppercase">
                    <span>Time Taken</span>
                    <TimerIcon className="h-3 w-3 text-white/40" />
                  </div>
                  <div className="mt-1">
                    <span className="font-mono text-xl sm:text-2xl font-bold text-white tracking-tight">
                      {completedTimeMs ? formatTime(completedTimeMs) : '--:--.-'}
                    </span>
                    {bestTimeMs && (
                      <div className="mt-0.5 text-[10px] text-white/40 font-mono">
                        Best: {formatTime(bestTimeMs)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Speedrun Rank Card */}
                <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between text-white/50 text-[10px] font-semibold tracking-wider uppercase">
                    <span>Speedrun Rank</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${rank?.badgeColor ?? 'text-white border-white/20'}`}>
                      {rank?.label ?? 'S-Rank'}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="text-xs font-semibold text-white/90 truncate block">
                      {rank?.tag ?? 'Alpine Champion'}
                    </span>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                      <CheckIcon className="h-2.5 w-2.5" />
                      <span>Target reached</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Info Box */}
              <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/60">Coins Collected</span>
                  <span className="font-mono font-semibold text-amber-300">
                    {collectedCount} / {TARGET_FROSTHOLM_COINS} (100%)
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-linear-to-r from-amber-500 to-yellow-300 rounded-full w-full" />
                </div>
                <div className="flex items-center justify-between text-[11px] text-white/50 pt-0.5">
                  <span>Location</span>
                  <span className="text-white/80">Frostholm Ridge</span>
                </div>
              </div>
            </div>

            {/* Footer / Actions */}
            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
              <button
                type="button"
                onClick={handleReset}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 px-4 py-2.5 text-xs font-semibold text-amber-200 hover:text-white transition active:scale-95 shadow-md"
              >
                <RefreshIcon className="h-3.5 w-3.5" />
                <span>Play Again</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDismissed(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/25 px-4 py-2.5 text-xs font-medium text-white/80 hover:text-white transition active:scale-95"
              >
                <span>Free Ski</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
