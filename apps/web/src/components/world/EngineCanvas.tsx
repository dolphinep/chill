'use client'

import { useEffect, useRef, useState } from 'react'
import type { EngineEvents, QualityTierName } from '@/engine/core/EngineEventBus'
import type { Engine, EngineCommand, MinimapSnapshot } from '@/engine/core/Engine'
import type { LanternProjection } from '@/engine/thoughts/ThoughtField'
import type {
  ConstellationLabelProjection,
  ConstellationSummary,
} from '@/engine/sky/ConstellationField'
import { appConfig } from '@/configs/appConfig'
import { BootDissolve } from '@/components/boot/BootDissolve'
import { useLanSession } from '@/lib/lan/lanSessionStore'

/**
 * The single `'use client'` boundary for the 3D subtree, and the only place that knows
 * both React and the engine exist.
 *
 * React never drives the render loop and never holds scene objects — it subscribes to
 * `engine.events` and issues `engine.command()`. Everything below `engine/` is
 * framework-free (ESLint-enforced), so swapping in a reconciler later touches this file
 * and nothing else.
 */

export type EngineCanvasProps = {
  /** Which scenery to load. Changing this remounts the whole engine — see
   * `lib/scenery/sceneryStore.ts` for why that's a full dispose/reconstruct rather
   * than an in-place hot-swap. Defaults to `appConfig.defaultSceneryId`. */
  sceneryId?: string
  children?: (api: {
    stats: EngineEvents['stats'] | null
    ready: EngineEvents['ready'] | null
    audioUnlocked: boolean
    command: (cmd: EngineCommand) => void
    getLanternProjections: (viewportWidth: number, viewportHeight: number) => LanternProjection[]
    getMinimapSnapshot: () => MinimapSnapshot | null
    /** Target-practice mini-game board — `null` before the engine's first `stats`-like
     * event, otherwise `{ hit, total }` kept in sync via the `targetHit`/`targetsReset`
     * one-shot events (see `EngineEventBus.ts`'s own doc comment on why those aren't
     * polled like `stats` is). */
    targetProgress: { hit: number; total: number } | null
    nearbyProp: EngineEvents['nearbyProp']
    /** Observatory-only — `[]` for every other scenery, same "nothing to show"
     * convention as `targetProgress`. One entry per currently-visible-and-on-screen
     * constellation, not just the searched one. */
    getConstellationLabels: (
      viewportWidth: number,
      viewportHeight: number,
    ) => ConstellationLabelProjection[]
    getConstellationNames: () => ConstellationSummary[]
    isConstellationVisible: (id: string) => boolean
  }) => React.ReactNode
}

export function EngineCanvas({ sceneryId, children }: EngineCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  // LAN multiplayer (optional): once connected, the host's scenery/time-of-day is
  // authoritative — `sceneryId ?? sceneryStore`'s own value means solo play is
  // completely unaffected (`lanSession.sceneryId` stays `null` until a session is
  // actually joined). This is why `RoomClient` lives in a module-scope store rather
  // than being constructed here: it must survive the remount this effective id change
  // itself triggers (see `lanSessionStore.ts`'s doc comment).
  const lanSession = useLanSession()
  const effectiveSceneryId = lanSession.sceneryId ?? sceneryId
  // The command fn lives in state, not a ref: it is handed to `children` during render,
  // and reading a ref there is both lint-flagged and genuinely unsound under concurrent
  // rendering. State makes the dependency explicit and re-renders consumers when the
  // engine becomes available.
  const [command, setCommand] = useState<(cmd: EngineCommand) => void>(() => noop)
  const [getLanternProjections, setGetLanternProjections] = useState<
    (viewportWidth: number, viewportHeight: number) => LanternProjection[]
  >(() => noLanterns)
  const [getMinimapSnapshot, setGetMinimapSnapshot] = useState<() => MinimapSnapshot | null>(
    () => noMinimap,
  )
  const [getConstellationLabels, setGetConstellationLabels] = useState<
    (viewportWidth: number, viewportHeight: number) => ConstellationLabelProjection[]
  >(() => noConstellationLabels)
  const [getConstellationNames, setGetConstellationNames] = useState<() => ConstellationSummary[]>(
    () => noConstellationNames,
  )
  const [isConstellationVisible, setIsConstellationVisible] = useState<(id: string) => boolean>(
    () => noConstellationVisible,
  )
  const [stats, setStats] = useState<EngineEvents['stats'] | null>(null)
  const [ready, setReady] = useState<EngineEvents['ready'] | null>(null)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [targetProgress, setTargetProgress] = useState<{ hit: number; total: number } | null>(null)
  const [nearbyProp, setNearbyProp] = useState<EngineEvents['nearbyProp']>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // A fresh boot dissolve for the new scenery, not the previous one's last frame —
    // "the picture comes alive" should happen again on a scenery switch, not show a
    // stale `ready` state while the new engine is still constructing.
    setReady(null)
    setStats(null)
    setFatal(null)
    setTargetProgress(null)
    setNearbyProp(null)

    let disposed = false
    let engine: Engine | null = null

    void (async () => {
      // Dynamic import keeps the ~272 KB gz engine chunk out of the shell (S1).
      const { Engine } = await import('@/engine/core/Engine')
      if (disposed) return

      // Config flows app -> engine, never the reverse: `engine/` stays framework- and
      // deployment-agnostic, which is what makes it portable and testable.
      // `?webgl=1` forces the WebGL2 backend. TSL transpiles to both, so this is the
      // only way to actually exercise the fallback real users on older GPUs will get.
      const params = new URLSearchParams(window.location.search)
      const forceWebGL = params.has('webgl') ? params.get('webgl') === '1' : undefined
      const debug = params.get('debug')
      engine = new Engine(host, {
        sceneryId: effectiveSceneryId ?? appConfig.defaultSceneryId,
        forceWebGL,
        debugPaint: debug === 'water' || debug === 'terrain' ? debug : null,
        roomClient: lanSession.roomClient ?? undefined,
      })
      const instance = engine
      setCommand(() => (cmd: EngineCommand) => instance.command(cmd))
      setGetLanternProjections(() => (w: number, h: number) => instance.getLanternProjections(w, h))
      setGetMinimapSnapshot(() => () => instance.getMinimapSnapshot())
      setGetConstellationLabels(
        () => (w: number, h: number) => instance.getConstellationLabels(w, h),
      )
      setGetConstellationNames(() => () => instance.getConstellationNames())
      setIsConstellationVisible(() => (id: string) => instance.isConstellationVisible(id))

      engine.events.on('stats', setStats)
      engine.events.on('ready', setReady)
      engine.events.on('audioState', ({ unlocked }) => setAudioUnlocked(unlocked))
      engine.events.on('diagnose', (d) => console.log('[diagnose]', d))
      engine.events.on('deviceLost', ({ reason }) =>
        setFatal(`GPU device lost: ${reason}. Reload to continue.`),
      )
      engine.events.on('error', ({ message }) =>
        console.warn('[chill] recoverable frame error:', message),
      )
      engine.events.on('targetHit', ({ hit, total }) => setTargetProgress({ hit, total }))
      engine.events.on('targetsReset', ({ total }) => setTargetProgress({ hit: 0, total }))
      engine.events.on('nearbyProp', setNearbyProp)

      await engine.init()
      if (disposed) engine.dispose()
    })().catch((e: unknown) => {
      setFatal(e instanceof Error ? e.message : String(e))
    })

    return () => {
      disposed = true
      engine?.dispose()
      setCommand(() => noop)
      setGetLanternProjections(() => noLanterns)
      setGetMinimapSnapshot(() => noMinimap)
      setGetConstellationLabels(() => noConstellationLabels)
      setGetConstellationNames(() => noConstellationNames)
      setIsConstellationVisible(() => noConstellationVisible)
    }
  }, [effectiveSceneryId, lanSession.roomClient])

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" />
      {fatal && (
        <div className="glass absolute top-6 left-6 max-w-sm p-4 text-xs text-red-300">{fatal}</div>
      )}
      <BootDissolve ready={!!ready} />
      {children?.({
        stats,
        ready,
        audioUnlocked,
        command,
        getLanternProjections,
        getMinimapSnapshot,
        targetProgress,
        nearbyProp,
        getConstellationLabels,
        getConstellationNames,
        isConstellationVisible,
      })}
    </div>
  )
}

function noop() {}
function noLanterns(): LanternProjection[] {
  return []
}
function noMinimap(): MinimapSnapshot | null {
  return null
}
function noConstellationLabels(): ConstellationLabelProjection[] {
  return []
}
function noConstellationNames(): ConstellationSummary[] {
  return []
}
function noConstellationVisible(): boolean {
  return false
}

export type { QualityTierName }
