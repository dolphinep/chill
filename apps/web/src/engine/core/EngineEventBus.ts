import type { CharacterState } from '@/engine/character/CharacterStateMachine'
import type { RosterEvent, SkeetEvent } from '@chill/protocol'
import type { PropType } from '@/engine/props/PropField'

/**
 * The ONLY channel between the engine and React.
 *
 * `src/engine/**` may not import react/next (ESLint-enforced), so the engine never
 * calls into UI code. It emits typed events; React subscribes. That one rule is what
 * keeps the R3F migration seam cheap — if we ever adopt a reconciler, nothing under
 * engine/ changes.
 */

export type EngineEvents = {
  /** Emitted at most a few times a second, never per frame. */
  stats: {
    fps: number
    /** CPU work per frame (command submission). NOT GPU frame time. */
    frameMs: number
    /** Frame-to-frame wall time — the signal the quality ladder actually uses. */
    tierFrameMs: number
    drawCalls: number
    triangles: number
    tier: QualityTierName
    targetHz: number
    backend: 'WebGPU' | 'WebGL2'
    characterState: CharacterState
    firstPerson: boolean
    /** Seconds until the author's next post would bloom immediately — the composer's
     * refilling-hairline, not an error. 0 means "would bloom right away." */
    thoughtCooldownS: number
    /** Diagnostic: max footprint depth (metres) read back from the GPU texture in a
     * patch around the player's feet, one stats tick stale. `null` before the first
     * read resolves or if there's no deformation field for this scenery. Exists purely
     * to answer "is the write path working at all" independent of whether the result is
     * visible on screen — see `SandField.readDepthNear`. */
    footprintDepthAtFeet: number | null
    /** Diagnostic: total footfalls fired since boot, pure CPU counter — see
     * `Engine.ts`'s `#footfallCount` doc comment. */
    footfallCount: number
    /** Diagnostic: result of the last manual `scanFootprintField` command — see
     * `SnowField.scanForMax`'s doc comment. `null` until the command runs once. */
    footprintScan: { depth: number; worldX: number; worldZ: number } | null
  }
  tierChanged: { from: QualityTierName; to: QualityTierName; reason: string }
  /** Renderer is up and the first frame has been presented. */
  ready: { backend: 'WebGPU' | 'WebGL2'; adapter: string }
  /** WebGPU device loss. With all-day uptime this is a *when*, not an *if*. */
  deviceLost: { reason: string }
  deviceRestored: Record<string, never>
  error: { message: string }
  nearbyProp: {
    id: string
    type: PropType
    x: number
    y: number
    z: number
    yaw: number
    active: boolean
    text?: string
    authorName?: string
    seatIndex?: 0 | 1
    teamSide?: 'red' | 'blue'
    matchState?: 'idle' | 'serving' | 'in_rally' | 'game_over'
    scoreRed?: number
    scoreBlue?: number
    winner?: 'red' | 'blue' | null
    myTeam?: 'red' | 'blue' | null
    skeetWave?: number
    skeetTotalWaves?: number
    skeetHits?: number
    skeetTotal?: number
    dist: number
  } | null
  volleyball: {
    courtId: string
    action: string
    team?: 'red' | 'blue'
    scoreRed?: number
    scoreBlue?: number
    winner?: 'red' | 'blue'
  }
  skeet: SkeetEvent
  /** Draw-call breakdown from a `diagnose` command. */
  diagnose: {
    sceneDrawCalls: number
    sceneTriangles: number
    totalDrawCalls: number
    sceneChildren: number
    scatterCounts: {
      grass: number
      rocks: number
      palms: number
      pines: number
      snowman: number
      iceHoles: number
    }
    characterState: CharacterState
    spawn: { x: number; y: number; z: number; yaw: number }
    spawnRadius: number
    cameraPos: [number, number, number]
    cameraForward: [number, number, number]
    figurePos: [number, number, number]
    distToFigure: number
    seawardProfile: { d: number; h: number }[]
  }
  /** Whether the audio context is actually producing sound right now. False after
   * construction (browsers require a gesture), and again if macOS re-suspends it. */
  audioState: { unlocked: boolean }
  /** LAN multiplayer roster changes — forwarded as-is from whatever `RoomClient` is
   * connected (see `applyRemoteSnapshot`/`RemoteAvatar`), so a HUD peer list can render
   * without `engine/` importing react/next. Never fires at all in solo play — nothing
   * emits this event unless a `RoomClient` was passed to `EngineOptions`. */
  peers: RosterEvent
  /** Fired once per local `postThought` command, carrying the exact position/id the
   * engine just resolved — the LAN layer forwards this outward via `sendThought`
   * without re-deriving the author's position (avoiding drift between what's rendered
   * locally and what's actually sent over the wire). */
  thoughtPosted: { id: string; text: string; x: number; z: number }
  /** Target-practice mini-game: fires once per knockdown (local or a peer's claim
   * arriving over the network — see `Engine.ts`'s `#handleTargetHit`), never per
   * frame, matching `peers`/`thoughtPosted`'s one-shot-occurrence shape rather than
   * `stats`'s polling-dashboard one. `hit`/`total` are provided directly so the HUD
   * never needs to poll or maintain its own running count. */
  targetHit: { index: number; hit: number; total: number }
  /** Fires once when the board resets (every target back to standing). */
  targetsReset: { total: number }
}

export type QualityTierName = 'low' | 'medium' | 'high'

type Handler<K extends keyof EngineEvents> = (payload: EngineEvents[K]) => void

export class EngineEventBus {
  #handlers = new Map<keyof EngineEvents, Set<Handler<never>>>()

  on<K extends keyof EngineEvents>(event: K, handler: Handler<K>): () => void {
    let set = this.#handlers.get(event)
    if (!set) {
      set = new Set()
      this.#handlers.set(event, set)
    }
    set.add(handler as Handler<never>)
    return () => {
      set!.delete(handler as Handler<never>)
    }
  }

  emit<K extends keyof EngineEvents>(event: K, payload: EngineEvents[K]): void {
    const set = this.#handlers.get(event)
    if (!set) return
    for (const h of set) {
      try {
        ;(h as Handler<K>)(payload)
      } catch {
        // A listener throwing must never take down the render loop.
      }
    }
  }

  clear(): void {
    this.#handlers.clear()
  }
}
