'use client'

import type { EngineEvents, QualityTierName } from '@/engine/core/EngineEventBus'
import type { EngineCommand } from '@/engine/core/Engine'
import { cn } from '@/lib/utils'
import { useHudHidden } from '@/lib/hud/hudStore'

/**
 * Development stats + tier override.
 *
 * Deliberately built as a real glass panel rather than tweakpane: it exercises the
 * design system against the live 3D backdrop from day one, which is the only way to
 * find legibility problems before they are expensive. It is also the first consumer of
 * the engine event bus, which keeps that contract honest.
 */

import { useEffect, useState } from 'react'

const TIERS: QualityTierName[] = ['low', 'medium', 'high']

export function DevStatsPanel({
  stats,
  ready,
  command,
}: {
  stats: EngineEvents['stats'] | null
  ready: EngineEvents['ready'] | null
  command: (cmd: EngineCommand) => void
}) {
  const [visible, setVisible] = useState(false)
  const [minimized, setMinimized] = useState(false)

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

      if (e.code === 'Backslash' || e.code === 'IntlBackslash' || e.key === '\\') {
        setVisible((v) => !v)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // `H` is "hide all UI" — a dev panel left showing would not be "all".
  if (useHudHidden() || !visible) return null

  if (minimized) {
    return (
      <div className="glass absolute top-6 right-6 z-40 flex items-center gap-2.5 rounded-full border border-white/10 px-3 py-1.5 font-mono text-[11px] shadow-lg transition-all">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <span className="font-medium text-white/80">chill · engine</span>
        <span className="text-white/60">{stats ? `${stats.fps} FPS` : '…'}</span>
        <button
          onClick={() => setMinimized(false)}
          className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-xs text-white/70 transition hover:bg-white/20 hover:text-white"
          title="Expand Engine Panel"
        >
          +
        </button>
      </div>
    )
  }

  return (
    <div className="glass absolute top-6 right-6 z-40 w-64 p-4 text-[11px] shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-white/90">chill · §1 engine</p>
        <button
          onClick={() => setMinimized(true)}
          className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-xs text-white/70 transition hover:bg-white/20 hover:text-white"
          title="Minimize Panel"
        >
          −
        </button>
      </div>

      {stats ? (
        <dl className="space-y-1 font-mono">
          <Row k="backend" v={stats.backend} />
          <Row k="adapter" v={ready?.adapter ?? '…'} />
          <Row k="cpu/frame" v={`${stats.frameMs.toFixed(2)} ms`} />
          <Row k="frame-to-frame" v={`${stats.tierFrameMs.toFixed(2)} ms`} />
          <Row k="fps" v={`${stats.fps} / ${stats.targetHz} Hz`} />
          <Row k="draw calls" v={String(stats.drawCalls)} />
          <Row k="triangles" v={stats.triangles.toLocaleString()} />
          <Row k="tier" v={stats.tier} />
          <Row
            k="footprint depth"
            v={
              stats.footprintDepthAtFeet == null
                ? '…'
                : `${(stats.footprintDepthAtFeet * 100).toFixed(1)}cm`
            }
          />
          <Row k="footfalls" v={String(stats.footfallCount)} />
          {stats.footprintScan && (
            <Row
              k="scan found"
              v={`${(stats.footprintScan.depth * 100).toFixed(1)}cm @ (${stats.footprintScan.worldX.toFixed(0)}, ${stats.footprintScan.worldZ.toFixed(0)})`}
            />
          )}
        </dl>
      ) : (
        <p className="text-glass-faint">starting…</p>
      )}

      <div className="mt-4 flex gap-1">
        {TIERS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => command({ type: 'setTier', tier: t })}
            className={cn(
              'border-glass-edge flex-1 rounded-md border px-2 py-1 transition-colors',
              stats?.tier === t ? 'bg-glass-foreground/15' : 'hover:bg-glass-foreground/8',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => command({ type: 'setAutoTier', auto: true })}
        className="border-glass-edge hover:bg-glass-foreground/8 mt-1 w-full rounded-md border px-2 py-1 transition-colors"
      >
        auto
      </button>

      {/* rAF is suspended while the document is hidden (S1), so an automated harness
          needs an explicit way to advance the world. Useful for debugging too. */}
      <button
        type="button"
        onClick={() => command({ type: 'stepFrames', frames: 90 })}
        className="border-glass-edge hover:bg-glass-foreground/8 mt-1 w-full rounded-md border px-2 py-1 transition-colors"
      >
        step 90 frames
      </button>
      <button
        type="button"
        onClick={() => command({ type: 'diagnose' })}
        className="border-glass-edge hover:bg-glass-foreground/8 mt-1 w-full rounded-md border px-2 py-1 transition-colors"
      >
        diagnose draw calls
      </button>
      <button
        type="button"
        onClick={() => command({ type: 'scanFootprintField' })}
        className="border-glass-edge hover:bg-glass-foreground/8 mt-1 w-full rounded-md border px-2 py-1 transition-colors"
        title="Slow — reads the whole deformation texture back to find where any depth actually landed"
      >
        scan footprint field
      </button>

      <p className="text-glass-faint mt-3 leading-relaxed">{hint(stats)}</p>
    </div>
  )
}

function hint(stats: EngineEvents['stats'] | null): string {
  // WASD both stands the figure up (from sitting) and walks — there is no separate
  // "get up" key, so the hint is the same in both states, only the trailing view-toggle
  // clause depends on which side of that transition you're on.
  if (!stats || stats.characterState === 'sit')
    return 'WASD move · Shift run · drag to look · F throw'
  return stats.firstPerson
    ? 'WASD move · Shift run · drag to look · V for 3rd person · F throw'
    : 'WASD move · Shift run · drag to look · V for 1st person · F throw'
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-glass-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  )
}
