import * as THREE from 'three/webgpu'
import { float, positionWorldDirection, vec4 } from 'three/tsl'
import { Clock } from './Clock'
import { Disposables } from './Disposables'
import { EngineEventBus, type QualityTierName, type EngineEvents } from './EngineEventBus'
import { FrameScheduler } from './FrameScheduler'
import { QualityTier, TIER_SETTINGS } from './QualityTier'
import { createRenderer } from '@/engine/render/createRenderer'
import { buildRenderPipeline, type BuiltPipeline } from '@/engine/render/RenderPipelineBuilder'
import { createSky, createSkyMaterial } from '@/engine/tsl/sky/atmosphere'
import { Clipmap, DEFAULT_CLIPMAP } from '@/engine/terrain/Clipmap'
import { createTerrainMaterial } from '@/engine/tsl/terrain/terrainMaterial'
import { createSnowTerrainMaterial } from '@/engine/tsl/terrain/snowTerrainMaterial'
import { createWaterMaterial } from '@/engine/tsl/water/waterMaterial'
import { findBeachSpawn, findRidgeSpawn, sampleHeight } from '@/engine/terrain/HeightFieldCpu'
import { createTargetField, type TargetField } from '@/engine/minigame/TargetField'
import { SkeetField } from '@/engine/minigame/SkeetField'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import { ARM_LENGTH_3P, CameraRig } from '@/engine/camera/CameraRig'
import { InputMap } from '@/engine/input/InputMap'
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js'
import { SEATED_EYE_HEIGHT } from '@/engine/character/SeatedFigure'
import { STANDING_EYE_HEIGHT } from '@/engine/character/StandingFigure'
import { ChibiAvatarMesh } from '@/engine/character/ChibiAvatarMesh'
import { ChibiAnimator } from '@/engine/character/ChibiAnimator'
import {
  ProjectileField,
  getTerrainProjectileType,
  type ProjectileMaterialType,
} from '@/engine/character/ProjectileField'
import { getAvatarConfig, type ChibiAvatarConfig } from '@/lib/avatar/avatarStore'
import { CharacterController } from '@/engine/character/CharacterController'
import { createSkiPair, attachSkis, type SkiPair } from '@/engine/character/SkiRig'
import { SnowSprayField } from '@/engine/character/SnowSprayField'
import { FrostholmCoinField } from '@/engine/scenery/FrostholmCoinField'
import { FootfallTracker } from '@/engine/character/FootfallTracker'
import { SkiTrackTracker } from '@/engine/character/SkiTrackTracker'
import { CharacterStateMachine } from '@/engine/character/CharacterStateMachine'
import { CompanionPet, type CompanionSpecies } from '@/engine/character/CompanionPet'
import { createGrassField, type GrassField } from '@/engine/tsl/foliage/grassMaterial'
import { createRockField, type RockField } from '@/engine/tsl/foliage/rockField'
import { createPalmField, type PalmField } from '@/engine/tsl/foliage/palmField'
import { createPineField, type PineField } from '@/engine/tsl/foliage/pineField'
import { createSnowmanField, type SnowmanField } from '@/engine/tsl/foliage/snowmanField'
import { createIceHoleField, type IceHoleField } from '@/engine/tsl/foliage/iceHoleField'
import { createAutumnTreeField, type AutumnTreeField } from '@/engine/tsl/foliage/autumnTreeField'
import {
  ConstellationField,
  defaultObservatoryDate,
  observatoryDateFromInput,
  type ConstellationLabelProjection,
  type ConstellationSummary,
} from '@/engine/sky/ConstellationField'
import { RealisticMoon } from '@/engine/sky/MoonPhase'
import { createObservatoryDeck } from '@/engine/sky/ObservatoryDeck'
import { createPlayerLantern, type PlayerLantern } from '@/engine/character/PlayerLantern'
import {
  createGoldenGrassField,
  type GoldenGrassField,
} from '@/engine/tsl/foliage/goldenGrassField'
import { createAutumnTerrainMaterial } from '@/engine/tsl/terrain/autumnTerrainMaterial'
import { SandField } from '@/engine/terrain/SandField'
import { SnowField } from '@/engine/terrain/SnowField'
import { AudioEngine, type AmbienceType } from '@/lib/audio/engine'
import type { LofiMood } from '@/lib/audio/generative'
import { getAudioContextState, subscribeAudioContextState } from '@/lib/audio/context'
import { prefersReducedMotion, subscribeReducedMotion } from '@/lib/comfort/reducedMotion'
import { setFoliageMotionScale } from '@/engine/tsl/foliage/wind'
import { ThoughtField, type LanternProjection } from '@/engine/thoughts/ThoughtField'
import { resolveScenery } from '@/lib/scenery/registry'
import type { Scenery } from '@/types/models/scenery'
import { RemoteAvatar, type RemoteAvatarDetail } from '@/engine/multiplayer/RemoteAvatar'
import { PropField, type PropType } from '@/engine/props/PropField'
import {
  INPUT_HZ,
  type RoomClient,
  type RosterEvent,
  type Snapshot,
  type Thought,
  type ThrowEvent,
  type TargetHitEvent,
  type Sid,
  type AnimState,
  type PlacedProp,
} from '@chill/protocol'

/**
 * The engine. Owns the renderer, the scene, the ordered system list, and disposal.
 *
 * Imports nothing from react/next/components — ESLint enforces it. React talks to this
 * through `events` and `command()` only. That single rule is what keeps the R3F
 * migration seam a one-file change instead of a rewrite.
 */

export type EngineOptions = {
  /** Scenery to load. Resolved by the app layer from config/URL/favourite, not here. */
  sceneryId: string
  /** Force the WebGL2 backend. The fallback ships to real users, so it needs a way to be exercised. */
  forceWebGL?: boolean
  /**
   * Replace terrain/water with flat unlit colours. Bisecting a rendering artifact by
   * screenshot is guesswork; tinting each subsystem answers "which mesh is that?" in
   * one frame. `?debug=water` -> magenta water, `?debug=terrain` -> cyan terrain.
   */
  debugPaint?: 'water' | 'terrain' | null
  /** LAN multiplayer (optional). Owned OUTSIDE `Engine` — a scenery switch disposes
   * and reconstructs the whole engine, and a `RoomClient`'s connection must survive
   * that (a guest getting scenery-corrected to match the host must not also drop
   * their network session). Passed in fresh on every construction, same instance
   * across remounts. `undefined` is today's exact solo behavior. */
  roomClient?: RoomClient
}

export type TimeOfDayPreset = 'dawn' | 'noon' | 'sunset' | 'moonlight'

export type EngineCommand =
  | { type: 'setTier'; tier: QualityTierName }
  | { type: 'setAutoTier'; auto: boolean }
  | { type: 'setTargetHz'; hz: number }
  | { type: 'stepFrames'; frames: number }
  | { type: 'diagnose' }
  | { type: 'audioUnlock' }
  | { type: 'setFov'; fov: number }
  | { type: 'setDamping'; damping: number }
  | { type: 'setVolume'; volume: number }
  | { type: 'setMusicVolume'; volume: number }
  | { type: 'setMusicMood'; mood: LofiMood }
  | { type: 'setAmbienceVolume'; volume: number }
  | { type: 'setAmbiencePreset'; preset: AmbienceType }
  | { type: 'setSfxVolume'; volume: number }
  | { type: 'scanFootprintField' }
  | { type: 'postThought'; text: string }
  | { type: 'setTimeOfDay'; preset: TimeOfDayPreset }
  | { type: 'setTimeNormalized'; progress: number }
  | { type: 'updateAvatarConfig'; config: Partial<ChibiAvatarConfig> }
  | { type: 'togglePosture' }
  | { type: 'teleportToPeer'; sid: Sid }
  | { type: 'setPosture'; posture: 'sit' | 'stand' }
  | { type: 'throwProjectile' }
  | { type: 'placeProp'; propType: PropType; text?: string }
  | { type: 'interactProp'; propId: string }
  | { type: 'sitOnProp'; propId: string; seatIndex?: 0 | 1 }
  | {
      type: 'volleyballAction'
      courtId: string
      action: 'join' | 'leave' | 'start' | 'hit' | 'reset'
      team?: 'red' | 'blue'
      spike?: boolean
    }
  | {
      type: 'skeetAction'
      action: 'start' | 'reset'
    }
  | {
      type: 'updatePropText'
      propId: string
      text: string
      authorName?: string
    }
  | { type: 'setCompanion'; species: CompanionSpecies }
  | { type: 'setCompanionName'; name: string }
  | { type: 'petCompanion' }
  | { type: 'highlightConstellation'; id: string | null }
  | { type: 'setSkyDate'; dateInput: string }
  | { type: 'setConstellationOpacity'; value: number }
  | { type: 'setConstellationsEnabled'; enabled: boolean }
  | { type: 'resetCoins' }

export type MinimapSnapshot = {
  local: { x: number; z: number; yaw: number; cameraYaw?: number }
  peers: { sid: Sid; x: number; z: number }[]
}

const STATS_INTERVAL_MS = 500
/** Above this, a frame gap is a stall rather than load — see `#frame`. */
const STALL_MS = 100
/** Camera distance while seated — closer than standing's 3rd-person follow distance,
 * matching the original hand-tuned sit shot's ~1.8m offset. */
const SIT_ARM_LENGTH = 1.8
/** Reduced-motion halves water/foliage amplitude — never to zero, per the plan's own
 * accessibility note: a frozen ocean reads as a crash, not as calm. */
const REDUCED_MOTION_SCALE = 0.5
/** v0.1 verification checklist: "< 150 draw calls, < 2M tris asserted in dev." A
 * `console.warn`, not a thrown error — the budget is a design target to notice drifting
 * past, not a condition that should crash the app for a real user if it ever does. */
const MAX_DRAW_CALLS = 250
const MAX_TRIANGLES = 2_000_000
/** Beyond this, a LAN peer's 3D avatar just isn't rendered at all — not culled by
 * frustum (that's already handled correctly by the engine defaults; see
 * `#rerankRemoteAvatarDetail`'s doc comment), but by plain distance: a person is small
 * and detailed, and stays hard to make out well before this in practice. The minimap
 * (`Engine.getMinimapSnapshot`) still shows them regardless — this only affects the
 * 3D scene. */
const MAX_AVATAR_RENDER_DISTANCE_M = 150
/** Target-practice mini-game: how long the board stays fully knocked down before
 * resetting, giving everyone a moment to notice/celebrate before it refills. */
const TARGET_RESET_DELAY_S = 6
/** Minimum time between `throwProjectile()` calls — see `#throwCooldownRemainingS`'s
 * own doc comment. */
const THROW_COOLDOWN_S = 0.45
/** Hit radius for the "friendly bonk" — wider than `CharacterController`'s own
 * `CHARACTER_RADIUS` (0.32) since this is a fun reaction, not a precise hitbox; a
 * near-miss reading as a hit is the right side to err on for something this casual. */
const PEER_HIT_RADIUS_M = 0.45
/** See `#pendingAvatarDisposals`'s own doc comment. */
const AVATAR_DISPOSE_DELAY_FRAMES = 3

export const TIME_OF_DAY_PRESETS: Record<
  TimeOfDayPreset,
  {
    sunDir: [number, number, number]
    sunIntensity: number
    sunLightIntensity: number
    zenith: number
    horizon: number
    sunColor: number
    hemiSky: number
    hemiGround: number
  }
> = {
  dawn: {
    sunDir: [-0.62, 0.16, -0.77],
    sunIntensity: 6,
    sunLightIntensity: 2.6,
    zenith: 0x1f4a8f,
    horizon: 0xd8c9ad,
    sunColor: 0xffd0a0,
    hemiSky: 0x9dbbe8,
    hemiGround: 0xbfa27a,
  },
  noon: {
    sunDir: [-0.15, 0.85, -0.45],
    sunIntensity: 10,
    sunLightIntensity: 3.8,
    zenith: 0x1e60c4,
    horizon: 0x94d2eb,
    sunColor: 0xfffaed,
    hemiSky: 0xb0d6ff,
    hemiGround: 0xd4c2a5,
  },
  sunset: {
    sunDir: [-0.85, 0.08, -0.52],
    sunIntensity: 8,
    sunLightIntensity: 2.4,
    zenith: 0x2a1c4e,
    horizon: 0xeb7b52,
    sunColor: 0xff6e38,
    hemiSky: 0xe39578,
    hemiGround: 0x7a5144,
  },
  moonlight: {
    sunDir: [0.35, 0.65, -0.68],
    sunIntensity: 0.4,
    sunLightIntensity: 0.55,
    zenith: 0x0c1e38,
    horizon: 0x1e3a60,
    sunColor: 0x93c5fd,
    hemiSky: 0x1e3250,
    hemiGround: 0x0d192c,
  },
}

function loadSavedPosition(
  sceneryId: string,
): { x: number; y: number; z: number; yaw: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`chill_position_${sceneryId}`)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (
      typeof p.x === 'number' &&
      typeof p.y === 'number' &&
      typeof p.z === 'number' &&
      typeof p.yaw === 'number'
    ) {
      return p
    }
  } catch {}
  return null
}

function savePosition(
  sceneryId: string,
  pos: { x: number; y: number; z: number; yaw: number },
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`chill_position_${sceneryId}`, JSON.stringify(pos))
  } catch {}
}

/** LAN multiplayer (optional): a couple of metres to the side of a peer already in the
 * room, not exactly on top of them — offset perpendicular to their own facing so a
 * newcomer lands beside them rather than overlapping. Facing is turned roughly back
 * toward them (their yaw + 180°); with a side offset this isn't an exact "look at
 * them," but it's close enough that the newcomer isn't staring away from the one
 * person they'd actually want to see first. */
function spawnNearPeer(
  peer: { x: number; z: number; yaw: number },
  terrain: HeightSpec,
): { x: number; y: number; z: number; yaw: number } {
  const OFFSET_M = 2
  const rightX = Math.cos(peer.yaw)
  const rightZ = -Math.sin(peer.yaw)
  const x = peer.x + rightX * OFFSET_M
  const z = peer.z + rightZ * OFFSET_M
  return { x, y: sampleHeight(terrain, x, z), z, yaw: peer.yaw + Math.PI }
}

export class Engine {
  readonly events = new EngineEventBus()

  #host: HTMLElement
  #options: EngineOptions
  #disposables = new Disposables()
  #clock = new Clock()
  #scheduler: FrameScheduler
  #quality: QualityTier
  #lastPositionSavedAt = 0

  #renderer!: THREE.WebGPURenderer
  #scene = new THREE.Scene()
  #built!: BuiltPipeline
  #cameraRig!: CameraRig
  #input!: InputMap
  #scenery!: Scenery
  #clipmap!: Clipmap
  /** Undefined for a non-coastal scenery — there is no water body to clip. */
  #waterClipmap?: Clipmap
  #sky!: ReturnType<typeof createSky>
  #skyDome?: THREE.Mesh
  /** Set once in `init()` from `scenery.sky.domeRadius ?? 4000` — read by the moon's
   * orbit distance and `ConstellationField`'s own radius so a shrunk dome (the
   * observatory scenery) scales everything else that sits "on" it consistently. */
  #skyDomeRadius = 4000
  #constellations?: ConstellationField
  #playerLantern?: PlayerLantern
  #sun!: THREE.DirectionalLight
  #hemiLight!: THREE.HemisphereLight
  #water?: ReturnType<typeof createWaterMaterial>
  /** Undefined for a scenery whose terrain doesn't write footprints in this channel —
   * coastal writes `SandField`, ridge writes `SnowField`, never both. */
  #sandField?: SandField
  #snowField?: SnowField
  #terrain!: {
    material: THREE.Material
    setSandTexture?: (tex: THREE.Texture) => void
    setSnowTexture?: (tex: THREE.Texture) => void
  }
  #character!: CharacterController
  #footfalls = new FootfallTracker()
  #skiTracks = new SkiTrackTracker()
  #lastCharX = 0
  #lastCharZ = 0
  #hasLastChar = false
  /** One stats-tick stale, by design — see `EngineEventBus`'s doc comment on this field. */
  #footprintDepthAtFeet: number | null = null
  #readingFootprintDepth = false
  /** Diagnostic: how many footfalls have fired since boot, CPU-side, nothing GPU about
   * it — settles whether `FootfallTracker` is even producing anything to write in the
   * first place, independent of every render-pipeline theory tried so far. */
  #footfallCount = 0
  #footprintScan: { depth: number; worldX: number; worldZ: number } | null = null
  #stateMachine = new CharacterStateMachine()
  #rocks!: RockField
  /** Coastal-only flora. */
  #grass?: GrassField
  #palms?: PalmField
  /** Ridge-only flora. */
  #pines?: PineField
  /** Frostholm Ridge-only. */
  #snowman?: SnowmanField
  #iceHoles?: IceHoleField
  /** Aki Highlands-only flora. */
  #autumnTrees?: AutumnTreeField
  #goldenGrass?: GoldenGrassField
  #audio!: AudioEngine
  #thoughts = new ThoughtField()
  #projectiles!: ProjectileField
  #propField?: PropField
  #lastNearbyPropId: string | null = null
  #nearbyCheckAccum = 0
  #myVolleyballTeam: 'red' | 'blue' | null = null
  #myVolleyballCourtId: string | null = null
  /** Impact points waiting for the next `#frame()`'s single footprint-field update —
   * see `ProjectileField`'s `onImpact` callback's doc comment for why this can't just
   * call `#sandField.update()`/`#snowField.update()` directly the moment an impact
   * happens. */
  #pendingImpactStamps: { x: number; z: number; pressure: number }[] = []
  /** A `RemoteAvatar` leaving or getting rebuilt (tier change) is always removed from
   * `this.#scene` immediately — it must stop being drawn/traversed the instant that
   * happens, no reason to delay that. Its GPU-side teardown (`avatar.dispose()`,
   * which destroys textures/geometries/materials) is delayed a few frames instead of
   * running inline from whatever event triggered it: on WebGPU, `render()` returns as
   * soon as commands are *submitted*, not once the GPU has actually finished
   * executing them (`#frame()`'s own comment on `pipeline.render()`), so a network
   * message arriving between two frames — a guest's socket closing, say — could
   * `dispose()` a buffer the GPU hadn't finished consuming from a just-submitted
   * frame yet, which is exactly the shape of a real "used in submit while destroyed"
   * WebGPU validation error this was written to stop. `AVATAR_DISPOSE_DELAY_FRAMES`
   * frames is a generous safety margin, not a measured minimum. */
  #pendingAvatarDisposals: { avatar: RemoteAvatar; framesLeft: number }[] = []
  /** Target-practice mini-game — see `TargetField.ts`'s own doc comment. Optional:
   * constructed for every scenery today, but kept nullable the same way
   * `#sandField`/`#snowField` are, in case a future scenery opts out. */
  #targetField?: TargetField
  #skeetField?: SkeetField
  #snowSpray?: SnowSprayField
  #coinField?: FrostholmCoinField
  #lastPlayerX = 0
  #lastPlayerZ = 0
  #skis?: SkiPair
  /** Set the instant every target goes down; cleared the instant any target comes
   * back up (including via a reset). `#frame()` compares against this to decide when
   * the reset delay has actually elapsed, and — since every client runs this same
   * clock off the same broadcast `targetHit` events — a non-host's board resets
   * visually in lockstep with the host's actual reset broadcast, without needing to
   * agree on wall-clock time. */
  #targetsAllDownAt: number | null = null
  /** Throttles `throwProjectile()` — protects both the game feel (no machine-gunning
   * snowballs) and the flagged performance risk (uncapped concurrent projectiles,
   * each ground impact spawning 14 debris particles) at 7-20-player scale. */
  #throwCooldownRemainingS = 0
  #spawn!: { x: number; y: number; z: number; yaw: number }
  #resizeObserver?: ResizeObserver
  #chibiAvatar?: ChibiAvatarMesh
  #chibiAnimator = new ChibiAnimator()
  #companionPet?: CompanionPet

  /** LAN multiplayer (optional) — see `EngineOptions.roomClient`'s doc comment. */
  #roomClient?: RoomClient
  #remoteAvatars = new Map<Sid, RemoteAvatar>()
  /** See `#rerankRemoteAvatarDetail`'s doc comment on why this can't just be read off
   * the live `RemoteAvatar` instance. */
  #remoteAvatarConfigs = new Map<Sid, ChibiAvatarConfig>()
  /** Same reason as `#remoteAvatarConfigs`: a rebuild on tier change constructs a fresh
   * `RemoteAvatar`, which needs the name to hand its `NameTag` again. */
  #remoteAvatarNames = new Map<Sid, string>()
  /** Accumulates real time between `#rerankRemoteAvatarDetail` passes — that check is
   * cheap per-peer but still a sort + distance calc, and this only needs to change on
   * the order of once a second, not every frame. */
  #avatarRerankAccum = 0
  #roomUnsubs: (() => void)[] = []
  /** Throttles outbound `sendInput` to `INPUT_HZ`, not every render frame — 60Hz would
   * be needless even on a LAN, and the relay only rebroadcasts at its own snapshot
   * rate anyway. */
  #localInputAccum = 0

  #backend: 'WebGPU' | 'WebGL2' = 'WebGPU'
  #lastFrameEnd = 0
  #stepping = false
  #statsAt = 0
  #frames = 0
  #frameMsAcc = 0
  #overBudget = false
  #disposed = false

  #moonMesh?: THREE.Mesh
  #realisticMoon?: RealisticMoon
  #starMesh?: THREE.Points
  #starMat?: THREE.PointsMaterial
  #meteorMesh?: THREE.LineSegments
  #meteorMat?: THREE.LineBasicMaterial
  #meteorActive = false
  #meteorStartTime = 0
  #meteorPos = { startX: 0, startY: 0, startZ: 0, endX: 0, endY: 0, endZ: 0 }
  #nextMeteorTimer = 0

  constructor(host: HTMLElement, options: EngineOptions) {
    this.#host = host
    this.#options = options
    this.#quality = new QualityTier({
      onChange: (to, from, reason) => {
        this.events.emit('tierChanged', { from, to, reason })
        this.#rebuildPipeline()
      },
    })
    this.#scheduler = new FrameScheduler({
      onFrame: (now) => this.#frame(now),
      onFrameError: (error) => {
        // Not `deviceLost` — the GPU device itself is still alive, one frame's worth
        // of work just failed (see `FrameScheduler`'s own comment on why this no
        // longer kills the loop). Surfaced the same way the existing "unknown
        // scenery" case is: a small non-blocking notice, not a "reload to continue"
        // fatal state, since the loop is already recovering on its own.
        console.error('[chill] frame failed, recovering:', error)
        this.events.emit('error', {
          message: error instanceof Error ? error.message : 'A rendering frame failed.',
        })
      },
      onStateChange: (state) => {
        // Returning from hidden carries a multi-second gap; resync rather than
        // integrating through it, and give the tier ladder time to settle.
        if (state !== 'hidden') {
          this.#clock.reset(performance.now())
          this.#quality.settle(performance.now())
        }
      },
    })
  }

  async init(): Promise<void> {
    const { renderer, backend, adapter } = await createRenderer(this.#host, {
      forceWebGL: this.#options.forceWebGL,
    })
    if (this.#disposed) {
      renderer.dispose()
      return
    }
    this.#renderer = renderer
    this.#backend = backend

    const scenery = resolveScenery(this.#options.sceneryId)
    if (this.#options.sceneryId !== scenery.id) {
      this.events.emit('error', {
        message: `Unknown scenery '${this.#options.sceneryId}' — falling back to ${scenery.id}`,
      })
    }
    this.#scenery = scenery
    // "The scenery declares whether the HUD should be dark-on-light or light-on-dark...
    // as soon as the scenery resolves" (plan) — before/during hydration is the point;
    // this is that resolution.
    document.documentElement.dataset.uiPolarity = scenery.uiPolarity

    const size = this.#hostSize()
    // Spawn is computed from the heightfield, not hardcoded. Scenery is parametric, so
    // any literal camera position goes stale the moment a noise parameter changes —
    // which is how every previous guess ended up standing in open water (or, for a
    // ridge, on a cliff edge).
    // Coastal: 3.5m back from the waterline — close enough that the swash is right
    // there, far enough that you are not sitting in it. Ridge: the flattest point in
    // the valley, facing uphill toward the peaks.
    const savedPos = loadSavedPosition(scenery.id)
    const defaultSpawn =
      scenery.id === 'sports-arena'
        ? {
            x: 0,
            y: sampleHeight(scenery.terrain, 0, -8.5),
            z: -8.5,
            yaw: 0,
          }
        : scenery.terrain.kind === 'coastal'
          ? findBeachSpawn(scenery.terrain, { setbackM: 3.5 })
          : findRidgeSpawn(scenery.terrain)
    // LAN multiplayer (optional): whoever's already in the room wins over both the
    // deterministic terrain spawn AND a solo-play saved position — joining a shared
    // session should put you next to your friends, not wherever you personally stood
    // last time you played alone. `getInitialAvatars()` is synchronous and already
    // populated by the time `connect()` resolved (see its doc comment on
    // `RoomClient`), so there's no race to worry about here.
    const nearbyPeer = this.#options.roomClient?.getInitialAvatars()[0]
    const spawn = nearbyPeer
      ? spawnNearPeer(nearbyPeer, scenery.terrain)
      : savedPos
        ? {
            x: savedPos.x,
            y: sampleHeight(scenery.terrain, savedPos.x, savedPos.z),
            z: savedPos.z,
            yaw: savedPos.yaw,
          }
        : defaultSpawn
    this.#spawn = spawn

    // Start in standing pose upright facing the world
    this.#stateMachine.standUp()
    this.#cameraRig = new CameraRig(size.width / size.height, ARM_LENGTH_3P)
    this.#cameraRig.setOrientation(spawn.yaw + Math.PI - 0.08, -0.05)
    // Applied once, immediately: `step()` is what actually moves the camera, and the
    // very first render happens before the fixed-step loop has run once (S1/§3 —
    // `FlyCamera.setOrientation`'s doc comment covers exactly this hazard). Reusing
    // `step()` itself rather than re-deriving its position formula here keeps there
    // being exactly one place that formula lives.
    this.#cameraRig.step(
      { moveX: 0, moveZ: 0, moveY: 0, lookDX: 0, lookDY: 0, run: false, jump: false },
      spawn.x,
      spawn.y + STANDING_EYE_HEIGHT,
      spawn.z,
    )

    this.#character = new CharacterController(scenery.terrain, spawn.x, spawn.z, spawn.yaw)

    // --- sky ---------------------------------------------------------------
    // Sun low and off to one side, not dead ahead: a sun centred in frame blows out the
    // whole image through bloom and leaves the terrain with no contrast. Off-axis also
    // gives long raking shadows, which is what makes dunes (or ridgelines) read as
    // dunes (or ridgelines).
    const sky = createSky(scenery.sky)
    this.#sky = sky
    const skyMaterial = createSkyMaterial(sky, THREE, positionWorldDirection)
    // Per-scenery, defaulting to the original fixed 4000 — "bring the sky closer"
    // (the observatory scenery) is otherwise just a smaller sphere; the moon's orbit
    // distance and the real-constellation layer's own radius are both scaled off
    // this same value below, so nothing pokes through or floats disconnected from a
    // shrunk dome.
    const skyDomeRadius = scenery.sky.domeRadius ?? 4000
    this.#skyDomeRadius = skyDomeRadius
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(skyDomeRadius, 32, 16), skyMaterial)
    skyDome.frustumCulled = false
    skyDome.renderOrder = -100
    this.#skyDome = skyDome
    this.#scene.add(skyDome)
    this.#disposables.add(skyDome.geometry)
    this.#disposables.add(skyMaterial)

    const sun = new THREE.DirectionalLight(scenery.sun.color, scenery.sun.intensity)
    const sunDir = scenery.sky.sunDirection ?? [-0.62, 0.16, -0.77]
    sun.position.set(...sunDir).multiplyScalar(300)
    sun.castShadow = true
    const shadowSize = TIER_SETTINGS[this.#quality.tier].shadowMapSize
    sun.shadow.mapSize.set(shadowSize, shadowSize)
    sun.shadow.bias = -0.0001
    sun.shadow.normalBias = 0.03
    sun.shadow.shadowNode = new CSMShadowNode(sun, { cascades: 2, maxFar: 140, mode: 'practical' })
    this.#sun = sun
    this.#scene.add(sun)

    this.#hemiLight = new THREE.HemisphereLight(
      scenery.hemi.sky,
      scenery.hemi.ground,
      scenery.hemi.intensity,
    )
    this.#scene.add(this.#hemiLight)

    // --- 3D Realistic Astronomical Moon with Moon Phases ---
    const initialMoonDate = defaultObservatoryDate()
    this.#realisticMoon = new RealisticMoon(initialMoonDate)
    this.#moonMesh = this.#realisticMoon.group as unknown as THREE.Mesh
    this.#scene.add(this.#realisticMoon.group)
    this.#disposables.add({
      dispose: () => {
        this.#realisticMoon?.dispose()
      },
    })

    // --- 3D Smooth Multi-Segment Meteor Line Trail ---
    const meteorSegments = 12
    const meteorPositions = new Float32Array(meteorSegments * 2 * 3) // 12 line segments (24 vertices)
    const meteorGeo = new THREE.BufferGeometry()
    meteorGeo.setAttribute('position', new THREE.BufferAttribute(meteorPositions, 3))
    const meteorMat = new THREE.LineBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    })
    const meteorMesh = new THREE.LineSegments(meteorGeo, meteorMat)
    meteorMesh.frustumCulled = false
    meteorMesh.renderOrder = -85
    this.#meteorMesh = meteorMesh
    this.#meteorMat = meteorMat
    this.#scene.add(meteorMesh)
    this.#disposables.add(meteorGeo)
    this.#disposables.add(meteorMat)

    // --- terrain -----------------------------------------------------------
    // Local variables keep each branch's *specific* return type (so `.colorNode` etc.
    // below typecheck); only the common shape both branches satisfy is assigned to
    // `this.#terrain`, which the rest of `init()`/`#frame()` treats generically.
    if (scenery.terrain.kind === 'coastal') {
      // Built before the terrain material so the material can be handed a live texture
      // reference from the moment it's constructed, rather than patching one in after.
      const sandField = new SandField(scenery.terrain)
      this.#sandField = sandField
      this.#disposables.add(sandField)

      const coastalTerrain = createTerrainMaterial(
        scenery.terrain,
        { baseCell: DEFAULT_CLIPMAP.baseCell, gridSide: DEFAULT_CLIPMAP.gridSide },
        sky,
        sandField.texture,
      )
      if (this.#options.debugPaint === 'terrain') {
        coastalTerrain.material.colorNode = vec4(0, 1, 1, 1)
        coastalTerrain.material.normalNode = null
        coastalTerrain.material.emissiveNode = vec4(0, 0.5, 0.5, 1)
      }
      this.#disposables.add(coastalTerrain.material)
      this.#terrain = coastalTerrain

      // Water rides its own clipmap: detail near the shore where the swash reads,
      // coarse out to the horizon. Fewer levels than terrain — waves past a few
      // hundred metres are sub-pixel anyway.
      const water = createWaterMaterial(scenery.terrain, sky)
      if (this.#options.debugPaint === 'water') {
        water.material.colorNode = vec4(1, 0, 1, 1)
        water.material.opacityNode = float(1)
        water.material.transparent = false
        water.material.emissiveNode = vec4(0.5, 0, 0.5, 1)
      }
      this.#water = water
      this.#disposables.add(water.material)
      this.#waterClipmap = new Clipmap(water.material, { ...DEFAULT_CLIPMAP, levels: 5 })
      this.#waterClipmap.rings.renderOrder = 1
      this.#waterClipmap.center.renderOrder = 1
      this.#scene.add(this.#waterClipmap.group)
      this.#disposables.add(this.#waterClipmap)
    } else {
      // No water — `deformable: false` in the plan meant "no sand box to deform," not
      // "no footprints anywhere." `SnowField` is `SandField`'s depth-only counterpart:
      // same ping-pong mechanism, no wetness/shoreline (ridge has no water to trace).
      const snowField = new SnowField()
      this.#snowField = snowField
      this.#disposables.add(snowField)

      const isAki = scenery.id === 'aki-highlands'
      const terrainMat = isAki
        ? createAutumnTerrainMaterial(
            scenery.terrain,
            { baseCell: DEFAULT_CLIPMAP.baseCell, gridSide: DEFAULT_CLIPMAP.gridSide },
            sky,
            snowField.texture,
          )
        : createSnowTerrainMaterial(
            scenery.terrain,
            { baseCell: DEFAULT_CLIPMAP.baseCell, gridSide: DEFAULT_CLIPMAP.gridSide },
            sky,
            snowField.texture,
          )
      if (this.#options.debugPaint === 'terrain') {
        terrainMat.material.colorNode = vec4(1, 0.5, 0, 1)
        terrainMat.material.normalNode = null
        terrainMat.material.emissiveNode = vec4(0.5, 0.25, 0, 1)
      }
      this.#disposables.add(terrainMat.material)
      this.#terrain = terrainMat
    }

    // Shoreline emitter positions are the same ray-marched crossings `SandField` already
    // found for the wetness ring — one trace, two consumers, rather than tracing twice.
    // Empty for a scenery with no `SandField` at all — `AudioEngine` treats that as
    // "no shoreline emitters," not an error.
    this.#audio = new AudioEngine(
      this.#scene,
      this.#cameraRig.camera,
      this.#sandField?.shorelinePoints ?? [],
      scenery.terrain.kind === 'coastal' ? scenery.terrain.seaLevelM : 0,
      scenery.audio,
    )
    this.#disposables.add(this.#audio)
    this.#disposables.add({ dispose: subscribeAudioContextState(() => this.#emitAudioState()) })
    this.#emitAudioState()

    this.#clipmap = new Clipmap(this.#terrain.material, DEFAULT_CLIPMAP)
    // Only the centre patch casts. Dune/ridge self-shadowing is most of the sense of
    // relief, but having the *rings* cast too re-renders the full 156k-triangle
    // clipmap per cascade — 4x the geometry for shadows falling on terrain too distant
    // to read.
    this.#clipmap.rings.castShadow = false
    this.#clipmap.rings.receiveShadow = true
    this.#clipmap.center.castShadow = true
    this.#clipmap.center.receiveShadow = true
    this.#scene.add(this.#clipmap.group)
    this.#disposables.add(this.#clipmap)

    // --- scatter -------------------------------------------------------------------
    // The §2 art-direction gate explicitly failed on this: materials were believable
    // but the island was bare ground. Placement runs once at scene build from the same
    // CPU heightfield everything else uses, so cover follows the terrain shape for free.
    // Rocks are the one field both archetypes share (see `createRockField`'s own
    // comment); flora is archetype-specific — grass/palms for a coastal scenery, pines
    // for a ridge one, autumn trees & golden grass for Aki Highlands.
    this.#rocks = createRockField(scenery.terrain)
    this.#scene.add(this.#rocks.mesh)
    this.#disposables.add(this.#rocks)

    const floraColliders: { x: number; z: number; radius: number }[] = []
    if (scenery.terrain.kind === 'coastal') {
      this.#grass = createGrassField(scenery.terrain)
      this.#scene.add(this.#grass.mesh)
      this.#disposables.add(this.#grass)

      this.#palms = createPalmField(scenery.terrain)
      this.#scene.add(this.#palms.mesh)
      this.#disposables.add(this.#palms)
      floraColliders.push(...this.#palms.colliders)
    } else if (scenery.id === 'aki-highlands') {
      // Aki Highlands: Dense red/amber autumn trees with varied heights & golden meadow grass
      this.#autumnTrees = createAutumnTreeField(scenery.terrain)
      this.#scene.add(this.#autumnTrees.mesh)
      this.#disposables.add(this.#autumnTrees)
      floraColliders.push(...this.#autumnTrees.colliders)

      this.#goldenGrass = createGoldenGrassField(scenery.terrain)
      this.#scene.add(this.#goldenGrass.mesh)
      this.#disposables.add(this.#goldenGrass)
    } else if (scenery.id === 'observatory') {
      // Bare rocky summit — the shared `createRockField` call above is the only
      // dressing it gets. No pines/snowman/ice-holes: a stargazing platform should
      // read as open and unobstructed, not a forest floor.
    } else {
      this.#pines = createPineField(scenery.terrain)
      this.#scene.add(this.#pines.mesh)
      this.#disposables.add(this.#pines)
      floraColliders.push(...this.#pines.colliders)

      // Frostholm Ridge's own dressing, in place of the shared rock field it opts out
      // of (see `createRockField`'s doc comment) — a snowman here and there, and the
      // odd frozen pond breathing-hole near the valley floor.
      this.#snowman = createSnowmanField(scenery.terrain)
      this.#scene.add(this.#snowman.mesh)
      this.#disposables.add(this.#snowman)
      floraColliders.push(...this.#snowman.colliders)

      this.#iceHoles = createIceHoleField(scenery.terrain)
      this.#scene.add(this.#iceHoles.mesh)
      this.#disposables.add(this.#iceHoles)
    }

    // Grass is walk-through by design (there are tens of thousands of blades — nobody
    // wants collision math against ground cover); everything else scattered is not.
    this.#character.setColliders([...this.#rocks.colliders, ...floraColliders])

    // Reduced-motion contract: halve water/foliage amplitude, live, for as long as the
    // app stays open — not just a load-time check. Never all the way to zero (§Comfort).
    // No water at all for a non-coastal scenery — nothing to scale.
    const applyMotionPreference = (reduced: boolean): void => {
      const scale = reduced ? REDUCED_MOTION_SCALE : 1
      this.#water?.setAmplitudeScale(scale)
      setFoliageMotionScale(scale)
    }
    applyMotionPreference(prefersReducedMotion())
    this.#disposables.add({ dispose: subscribeReducedMotion(applyMotionPreference) })

    // --- Chibi Avatar Character ---
    const avatarConfig = getAvatarConfig()
    const chibiAvatar = new ChibiAvatarMesh(avatarConfig)
    chibiAvatar.group.position.set(spawn.x, spawn.y, spawn.z)
    chibiAvatar.group.rotation.y = spawn.yaw
    this.#chibiAvatar = chibiAvatar
    this.#scene.add(chibiAvatar.group)
    this.#disposables.add({ dispose: () => chibiAvatar.dispose() })

    // --- Ski gear, Powder Snow Spray & Alpine Coin Run (Frostholm Ridge exclusive) ---
    if (scenery.id === 'frostholm-ridge') {
      const skis = createSkiPair()
      attachSkis(chibiAvatar.rig, skis)
      this.#skis = skis
      this.#disposables.add({ dispose: () => skis.dispose() })

      const snowSpray = new SnowSprayField(this.#scene)
      this.#snowSpray = snowSpray
      this.#disposables.add({ dispose: () => snowSpray.dispose() })

      const coinField = new FrostholmCoinField(this.#scene, scenery.terrain, spawn)
      this.#coinField = coinField
      this.#disposables.add(coinField)
    }

    this.#lastPlayerX = spawn.x
    this.#lastPlayerZ = spawn.z

    // --- Cozy Follower Companion Pet ---
    const companionPet = new CompanionPet(this.#scene, scenery.terrain)
    companionPet.teleportNear(spawn.x, spawn.z, spawn.yaw)
    this.#companionPet = companionPet
    this.#disposables.add({ dispose: () => companionPet.dispose() })

    // --- Target practice & Skeet shooting mini-games (Sports Arena exclusive) ---
    if (scenery.id === 'sports-arena') {
      const targetField = createTargetField(scenery.terrain, 22, 0)
      this.#targetField = targetField
      this.#scene.add(targetField.mesh)
      this.#disposables.add({ dispose: () => targetField.dispose() })

      const skeetField = new SkeetField(scenery.terrain, -24, 0)
      this.#skeetField = skeetField
      this.#scene.add(skeetField.group)
      this.#disposables.add({ dispose: () => skeetField.dispose() })
    }

    // --- Real constellations + landmark deck (Observatory exclusive) ---
    if (scenery.id === 'observatory') {
      const deck = createObservatoryDeck(scenery.terrain, spawn.x, spawn.z - 4)
      this.#scene.add(deck.group)
      this.#disposables.add({ dispose: () => deck.dispose() })

      // Radius just inside the (already-shrunk, see `#skyDomeRadius`) sky dome, same
      // ~0.875-ish margin as the moon's own orbit distance, so real stars read as
      // sitting on the dome rather than floating obviously in front of/behind it.
      const constellations = new ConstellationField(
        this.#skyDomeRadius * 0.9,
        defaultObservatoryDate(),
      )
      this.#constellations = constellations
      this.#scene.add(constellations.group)
      this.#disposables.add({ dispose: () => constellations.dispose() })

      // Permanent deep night makes the ground genuinely hard to see without an
      // actual local light source, not just decorative glow — see
      // `PlayerLantern.ts`'s own doc comment.
      const playerLantern = createPlayerLantern()
      this.#playerLantern = playerLantern
      this.#scene.add(playerLantern.group)
      this.#disposables.add({ dispose: () => playerLantern.dispose() })
    }

    // --- Projectile Field (Throwing Snow/Sand/Soil) ---
    this.#projectiles = new ProjectileField(this.#scene, {
      onImpact: (type, x, z) => {
        this.#audio?.playImpactSound(type)
        this.#pendingImpactStamps.push({ x, z, pressure: 1.2 })
      },
      onTargetHit: (index) => this.#handleTargetHit(index),
      onPeerHit: (sid, type) => this.#handlePeerHit(sid, type),
      onSkeetHit: (targetId) => this.#handleSkeetHit(targetId),
    })
    this.#disposables.add({ dispose: () => this.#projectiles?.dispose() })

    // --- Interactive Placed Props ---
    const propField = new PropField(this.#scene)
    this.#propField = propField
    this.#disposables.add({ dispose: () => propField.dispose() })

    // In Sports Arena scenery, instantiate permanent Volleyball Court at central arena
    if (scenery.id === 'sports-arena') {
      propField.addProp(
        {
          id: 'permanent-sports-volleyball',
          type: 'volleyball_court',
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          active: true,
        },
        scenery.terrain,
      )
    }

    // --- LAN multiplayer (optional) -----------------------------------------
    // Subscribing here, not constructing here — the `RoomClient` itself is owned by
    // the app layer and outlives this `Engine` instance across scenery-driven
    // remounts (see `EngineOptions.roomClient`'s doc comment). This engine's own
    // subscriptions do NOT need to outlive it, though: they're torn down in
    // `dispose()` and re-created fresh by the next `Engine` instance's `init()`.
    if (this.#options.roomClient) {
      this.#roomClient = this.#options.roomClient
      this.#roomUnsubs.push(
        this.#roomClient.onRoster((event) => this.#handleRosterEvent(event)),
        this.#roomClient.onSnapshot((snapshot) => this.#applyRemoteSnapshot(snapshot)),
        this.#roomClient.onThought((thought) => this.#handleRemoteThought(thought)),
        this.#roomClient.onThrow((event) => this.#handleRemoteThrow(event)),
        this.#roomClient.onTargetHit((event) => this.#handleRemoteTargetHit(event)),
        this.#roomClient.onTargetsReset(() => this.#applyTargetsReset()),
        // Open to anyone (see `RoomClient.announceTimeOfDay`'s doc comment) — applying
        // every incoming value, including this client's own echoed-back broadcast, is
        // safe with no sid-based echo-guard needed: `#applyNormalizedTime` is a pure
        // function of `progress`, so re-applying the same value it was just set to
        // locally is a harmless no-op, exactly like `onSceneryChange` already assumes.
        this.#roomClient.onTimeOfDayChange((progress) => this.#applyNormalizedTime(progress)),
        this.#roomClient.onPropPlaced((prop) => {
          this.#propField?.addProp(prop, this.#scenery.terrain)
          if (prop.type === 'firework') {
            this.#audio?.playFireworkSound()
          } else {
            this.#audio?.playPropPlaceSound(prop.type)
          }
        }),
        this.#roomClient.onPropTextUpdated((data) => {
          this.#propField?.updatePropText(data.propId, data.text, data.authorName)
        }),
        this.#roomClient.onPropInteracted((data) => {
          if (data.action === 'toggle') {
            this.#propField?.toggleActive(data.propId, data.active)
            const prop = this.#propField?.getProp(data.propId)
            if (prop) {
              this.#audio?.playPropPlaceSound(prop.data.type)
            }
          } else if (data.action === 'firework') {
            this.#propField?.relaunchFirework(data.propId)
            this.#audio?.playFireworkSound()
          }
        }),
        this.#roomClient.onVolleyballAction((event) => {
          const court = this.#propField?.volleyballCourt
          if (!court) return

          const sidStr = event.sid !== undefined ? String(event.sid) : ''
          if (event.action === 'join') {
            court.joinTeam(sidStr, event.team ?? 'red')
          } else if (event.action === 'leave') {
            court.leaveCourt(sidStr)
          } else if (event.action === 'start') {
            court.startMatch()
            this.#audio?.playVolleyballWhistleSound()
          } else if (event.action === 'hit' && event.ball) {
            court.applyRemoteHit(event.ball)
            this.#audio?.playVolleyballHitSound(false)
            if (event.sid !== undefined) {
              const peer = this.#remoteAvatars.get(Number(event.sid))
              peer?.triggerThrow()
            }
          } else if (event.action === 'point') {
            court.applyRemoteScore(event.scoreRed ?? 0, event.scoreBlue ?? 0, event.winner)
            if (event.winner) {
              this.#audio?.playVolleyballWinSound()
            } else {
              this.#audio?.playVolleyballWhistleSound()
            }
          } else if (event.action === 'reset') {
            court.resetMatch()
          }
        }),
        this.#roomClient.onSkeetAction((event) => {
          if (!this.#skeetField) return
          if (event.action === 'start') {
            this.#skeetField.startRound()
            this.#audio?.playSkeetLaunchSound()
          } else if (event.action === 'launch' && event.targets) {
            this.#skeetField.applyRemoteLaunch(event.targets, event.wave)
            this.#audio?.playSkeetLaunchSound()
          } else if (event.action === 'hit' && event.targetId !== undefined) {
            this.#skeetField.shatterTarget(event.targetId)
            this.#audio?.playSkeetShatterSound()
          } else if (event.action === 'reset') {
            this.#skeetField.resetRound()
          }
        }),
      )
      // Bootstrap placed props
      this.#roomClient.getInitialProps().forEach((p) => {
        this.#propField?.addProp(p, this.#scenery.terrain)
      })
      // Bootstrap the mini-game board the same way roster/avatars are bootstrapped
      // just below — a late joiner's `onTargetHit` subscription only just started,
      // so any hit claimed before it existed is gone; `getInitialTargetStates()` is
      // the synchronous "catch me up" query for exactly that gap.
      this.#roomClient.getInitialTargetStates().forEach((down, index) => {
        if (down) this.#targetField?.setKnockedDown(index, true)
      })
      // Bootstrap: whoever was already in the room the instant `connect()` resolved.
      // Their `onRoster`/`onSnapshot` events already fired — before this subscription
      // existed — so without this, every peer already present would stay invisible
      // until their next move or config change (a real bug this fixes: joining a
      // session with people already in it showed nobody until they happened to walk).
      // `getInitialRoster()`/`getInitialAvatars()` are exactly the synchronous
      // "catch me up" queries `RoomClient`'s interface exists for.
      const initialAvatarsBySid = new Map(
        this.#roomClient.getInitialAvatars().map((a) => [a.sid, a]),
      )
      for (const entry of this.#roomClient.getInitialRoster()) {
        this.#handleRosterEvent({
          type: 'join',
          sid: entry.sid,
          name: entry.name,
          avatarConfig: entry.avatarConfig,
        })
        const state = initialAvatarsBySid.get(entry.sid)
        if (state)
          this.#remoteAvatars
            .get(entry.sid)
            ?.setTarget(state.x, state.y, state.z, state.yaw, state.anim)
      }
    }

    // --- input -------------------------------------------------------------
    this.#input = new InputMap(this.#renderer.domElement)
    this.#input.attach()

    this.#built = buildRenderPipeline(
      this.#renderer,
      this.#scene,
      this.#cameraRig.camera,
      this.#quality.tier,
    )

    this.#resizeObserver = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry?.contentRect.width ?? 0)
      const h = Math.floor(entry?.contentRect.height ?? 0)
      if (w === 0 || h === 0) return // never hand three a zero-sized target (S1)
      this.#renderer.setSize(w, h)
      this.#cameraRig.setAspect(w / h)
      this.#quality.settle(performance.now())
    })
    this.#resizeObserver.observe(this.#host)

    this.#watchDeviceLoss()

    this.#applyTierSettings()
    this.#clock.reset(performance.now())
    this.#quality.settle(performance.now())

    const realNow = new Date()
    const realTimeProgress =
      (realNow.getHours() * 60 + realNow.getMinutes() + realNow.getSeconds() / 60) / 1440
    this.#applyNormalizedTime(realTimeProgress)
    // A LAN session's already-agreed time (see `getInitialTimeOfDay`'s doc comment)
    // overrides the real-wall-clock guess above — same "catch me up" reasoning as the
    // roster/avatars/target-board bootstrap further down; without this, a late joiner
    // would keep showing their own local time until someone else next drags the dial.
    if (this.#options.roomClient) {
      this.#applyNormalizedTime(this.#options.roomClient.getInitialTimeOfDay())
    }

    // Present one frame BEFORE the loop starts pacing. Two reasons, both real:
    //  - §5's poster -> live cross-dissolve needs a presented frame to dissolve *to*.
    //  - Opening the app in a background tab must not show black until the tab is
    //    focused; the scheduler legitimately refuses to run while hidden.
    this.renderOnce()

    this.#scheduler.start()
    this.events.emit('ready', { backend, adapter })
  }

  command(cmd: EngineCommand): void {
    switch (cmd.type) {
      case 'setTier':
        this.#quality.auto = false
        this.#quality.set(cmd.tier, 'user override')
        break
      case 'setAutoTier':
        this.#quality.auto = cmd.auto
        break
      case 'setTargetHz':
        this.#scheduler.targetHz = cmd.hz
        break
      case 'audioUnlock':
        void this.#audio.unlock().then(() => this.#emitAudioState())
        break
      case 'setFov':
        // Guarded: comfort settings can dispatch before `init()` finishes assigning
        // `#cameraRig` (React gets a live `command()` as soon as the engine is
        // constructed, not once it's ready). The comfort UI re-syncs once `ready` fires,
        // so a dropped early command here isn't lost, just deferred.
        this.#cameraRig?.setFov(cmd.fov)
        break
      case 'setDamping':
        this.#cameraRig?.setDamping(cmd.damping)
        break
      case 'setVolume':
        // Guarded like `setFov`/`setDamping` — `#audio` is assigned inside `init()`.
        this.#audio?.setMasterVolume(cmd.volume)
        break
      case 'setMusicVolume':
        this.#audio?.setMusicVolume(cmd.volume)
        break
      case 'setMusicMood':
        this.#audio?.setMusicMood(cmd.mood)
        break
      case 'setAmbienceVolume':
        this.#audio?.setAmbienceVolume(cmd.volume)
        break
      case 'setAmbiencePreset':
        this.#audio?.setAmbiencePreset(cmd.preset)
        break
      case 'setSfxVolume':
        this.#audio?.setSfxVolume(cmd.volume)
        break
      case 'scanFootprintField': {
        // Manual, heavy, diagnostic-only — see `SnowField.scanForMax`'s doc comment.
        // Logs directly rather than only updating stats: the comparison that actually
        // matters (where the data landed vs. where the character actually is) is easiest
        // to read as one console line, not two separately-polled numbers.
        const field = this.#sandField ?? this.#snowField
        const cx = this.#stateMachine.state === 'stand' ? this.#character.x : this.#spawn.x
        const cz = this.#stateMachine.state === 'stand' ? this.#character.z : this.#spawn.z
        if (!field) {
          console.log('[chill] scanFootprintField: no deformation field for this scenery')
          break
        }
        void field.scanForMax(this.#renderer).then((result) => {
          this.#footprintScan = result
          if (!result) {
            console.log('[chill] scanFootprintField: entire texture is zero')
          } else {
            console.log(
              `[chill] scanFootprintField: max depth ${result.depth.toFixed(4)}m at world ` +
                `(${result.worldX.toFixed(1)}, ${result.worldZ.toFixed(1)}) — character is at ` +
                `(${cx.toFixed(1)}, ${cz.toFixed(1)}), ${Math.hypot(result.worldX - cx, result.worldZ - cz).toFixed(1)}m away`,
            )
          }
        })
        break
      }
      case 'postThought': {
        // Emerges at wherever the author currently is — same "author's position, or
        // spawn while seated" branch the audio/footprint code already uses. Guarded the
        // same way `setFov`/`setDamping` are: this can arrive before `init()` finishes.
        if (!this.#spawn) break
        const grounded = this.#stateMachine.state === 'stand'
        const x = grounded ? this.#character.x : this.#spawn.x
        const z = grounded ? this.#character.z : this.#spawn.z
        this.#thoughts.post(cmd.text, x, z)
        // Fire-and-forget: the LAN relay has no quota/rejection policy to react to
        // (see `LanRoomClient.sendThought`'s doc comment), and the local lantern above
        // already rendered with zero round-trip latency regardless of the network.
        if (this.#roomClient) void this.#roomClient.sendThought(cmd.text)
        break
      }
      case 'setTimeOfDay': {
        const p = TIME_OF_DAY_PRESETS[cmd.preset]
        if (!p || !this.#sky) break
        this.#sky.uniforms.sunDirection.value.set(...p.sunDir).normalize()
        this.#sky.uniforms.sunIntensity.value = p.sunIntensity
        this.#sky.uniforms.zenith.value.set(p.zenith)
        this.#sky.uniforms.horizon.value.set(p.horizon)
        this.#sky.uniforms.sunColor.value.set(p.sunColor)

        if (this.#sun) {
          this.#sun.color.set(p.sunColor)
          this.#sun.intensity = p.sunLightIntensity
          this.#sun.position.set(...p.sunDir).multiplyScalar(300)
        }
        if (this.#hemiLight) {
          this.#hemiLight.color.set(p.hemiSky)
          this.#hemiLight.groundColor.set(p.hemiGround)
        }
        break
      }
      case 'setTimeNormalized': {
        this.#applyNormalizedTime(cmd.progress)
        // Fire-and-forget, same reasoning as `sendThrow`/`sendTargetHit` — the local
        // drag already applied above with zero round-trip latency; this only tells
        // everyone else in the session.
        this.#roomClient?.announceTimeOfDay(cmd.progress)
        break
      }
      case 'updateAvatarConfig': {
        this.#chibiAvatar?.updateConfig(cmd.config)
        // `updateConfig` may have fully rebuilt the rig (new leg pivots) — re-parenting
        // the same two ski meshes onto them is a harmless no-op otherwise.
        if (this.#skis && this.#chibiAvatar) {
          attachSkis(this.#chibiAvatar.rig, this.#skis)
        }
        // Fire-and-forget, same reasoning as `sendThrow`/`announceTimeOfDay` — the
        // local mesh already updated above with zero round-trip latency. Without
        // this, a mid-session look change (hair, outfit, colors) was completely
        // invisible to everyone else in the room: `'join'` only ever carries the
        // avatar config once, at connect time, and nothing re-sent it after that.
        if (this.#chibiAvatar) {
          this.#roomClient?.sendAvatarUpdate(
            this.#chibiAvatar.config as unknown as Record<string, string>,
          )
        }
        break
      }
      case 'togglePosture': {
        if (this.#stateMachine.state === 'stand') {
          this.#stateMachine.sitDown()
          this.#spawn.x = this.#character.x
          this.#spawn.y = this.#character.y
          this.#spawn.z = this.#character.z
          this.#spawn.yaw = this.#character.yaw
          this.#cameraRig.setArmLength(SIT_ARM_LENGTH)
        } else {
          this.#stateMachine.standUp()
          this.#cameraRig.setArmLength(ARM_LENGTH_3P)
        }
        break
      }
      case 'setPosture': {
        if (cmd.posture === 'sit' && this.#stateMachine.state === 'stand') {
          this.#stateMachine.sitDown()
          this.#spawn.x = this.#character.x
          this.#spawn.y = this.#character.y
          this.#spawn.z = this.#character.z
          this.#spawn.yaw = this.#character.yaw
          this.#cameraRig.setArmLength(SIT_ARM_LENGTH)
        } else if (cmd.posture === 'stand' && this.#stateMachine.state === 'sit') {
          this.#stateMachine.standUp()
          this.#cameraRig.setArmLength(ARM_LENGTH_3P)
        }
        break
      }
      case 'teleportToPeer': {
        const peer = this.#remoteAvatars.get(cmd.sid)
        if (!peer) break
        if (this.#stateMachine.state !== 'stand') {
          this.#stateMachine.standUp()
          this.#cameraRig.setArmLength(ARM_LENGTH_3P)
        }
        // Same 2m-to-the-side placement `spawnNearPeer` uses when a joiner first
        // spawns next to whoever's already there — reused here so "walk over to say
        // hi" and "teleport over to say hi" land you in the same relative spot.
        const target = spawnNearPeer({ x: peer.x, z: peer.z, yaw: peer.yaw }, this.#scenery.terrain)
        this.#character.teleportTo(this.#scenery.terrain, target.x, target.z, target.yaw)
        break
      }
      case 'throwProjectile': {
        this.throwProjectile()
        break
      }
      case 'placeProp': {
        const charX = this.#stateMachine.state === 'stand' ? this.#character.x : this.#spawn.x
        const charZ = this.#stateMachine.state === 'stand' ? this.#character.z : this.#spawn.z
        const charYaw = this.#stateMachine.state === 'stand' ? this.#character.yaw : this.#spawn.yaw

        // Place 1.2m in front of the character facing direction
        const forwardX = Math.sin(charYaw)
        const forwardZ = Math.cos(charYaw)
        const placeX = charX + forwardX * 1.2
        const placeZ = charZ + forwardZ * 1.2
        const placeY = sampleHeight(this.#scenery.terrain, placeX, placeZ)

        const propId = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const propData: PlacedProp = {
          id: propId,
          type: cmd.propType,
          x: placeX,
          y: placeY,
          z: placeZ,
          yaw: charYaw,
          text: cmd.text,
          authorName: 'Friend',
          createdAtEpochS: Math.floor(Date.now() / 1000),
        }

        this.#propField?.addProp(propData, this.#scenery.terrain)
        if (cmd.propType === 'firework') {
          this.#audio?.playFireworkSound()
        } else {
          this.#audio?.playPropPlaceSound(cmd.propType)
        }

        if (this.#roomClient) {
          this.#roomClient.sendPlaceProp(propData)
        }
        break
      }
      case 'updatePropText': {
        this.#propField?.updatePropText(cmd.propId, cmd.text, cmd.authorName)
        this.#audio?.playPropPlaceSound('sign')
        if (this.#roomClient) {
          this.#roomClient.sendUpdatePropText(cmd.propId, cmd.text, cmd.authorName)
        }
        break
      }
      case 'setCompanion': {
        this.#companionPet?.setSpecies(cmd.species)
        const charX = this.#stateMachine.state === 'stand' ? this.#character.x : this.#spawn.x
        const charZ = this.#stateMachine.state === 'stand' ? this.#character.z : this.#spawn.z
        const charYaw = this.#stateMachine.state === 'stand' ? this.#character.yaw : this.#spawn.yaw
        this.#companionPet?.teleportNear(charX, charZ, charYaw)
        break
      }
      case 'setCompanionName': {
        this.#companionPet?.setName(cmd.name)
        break
      }
      case 'petCompanion': {
        this.#companionPet?.petReaction()
        break
      }
      case 'highlightConstellation': {
        this.#constellations?.setActive(cmd.id)
        if (cmd.id && this.#constellations && this.#cameraRig) {
          const centroid = this.#constellations.getCentroid(cmd.id)
          if (centroid) {
            const dir = centroid.clone().normalize()
            const targetYaw = Math.atan2(-dir.x, -dir.z)
            const targetPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)))
            this.#cameraRig.setTargetOrientation(targetYaw, targetPitch)
          }
        }
        break
      }
      case 'setSkyDate': {
        const d = observatoryDateFromInput(cmd.dateInput)
        this.#constellations?.setDate(d)
        this.#realisticMoon?.setDate(d)
        break
      }
      case 'setConstellationOpacity': {
        this.#constellations?.setOpacity(cmd.value)
        break
      }
      case 'setConstellationsEnabled': {
        this.#constellations?.setEnabled(cmd.enabled)
        break
      }
      case 'resetCoins': {
        this.#coinField?.resetAll()
        break
      }
      case 'interactProp': {
        const prop = this.#propField?.getProp(cmd.propId)
        if (!prop) break

        if (
          prop.data.type === 'campfire' ||
          prop.data.type === 'lantern' ||
          prop.data.type === 'tent'
        ) {
          const active = this.#propField?.toggleActive(cmd.propId)
          this.#audio?.playPropPlaceSound(prop.data.type)
          if (this.#roomClient) {
            this.#roomClient.sendInteractProp(cmd.propId, 'toggle', active)
          }
        } else if (prop.data.type === 'radio') {
          const active = this.#propField?.toggleActive(cmd.propId)
          this.#audio?.playRadioSound()
          if (this.#roomClient) {
            this.#roomClient.sendInteractProp(cmd.propId, 'toggle', active)
          }
        } else if (prop.data.type === 'tea_table') {
          this.#audio?.playTeaSound()
        } else if (prop.data.type === 'sakura_pot') {
          this.#audio?.playPropPlaceSound('campfire')
        } else if (prop.data.type === 'firework') {
          this.#propField?.relaunchFirework(cmd.propId)
          this.#audio?.playFireworkSound()
          if (this.#roomClient) {
            this.#roomClient.sendInteractProp(cmd.propId, 'firework')
          }
        }
        break
      }
      case 'sitOnProp': {
        const prop = this.#propField?.getProp(cmd.propId)
        if (!prop) break

        if (this.#stateMachine.state === 'stand') {
          this.#stateMachine.sitDown()
        }

        if (prop.data.type === 'bench') {
          // Plank top surface is at y = +0.425m; torsoPivot in sit is +0.06m
          this.#spawn.x = prop.data.x
          this.#spawn.y = prop.group.position.y + 0.36
          this.#spawn.z = prop.data.z
          this.#spawn.yaw = prop.data.yaw
        } else if (prop.data.type === 'tea_table') {
          // Sit on tatami cushion (Seat 0: left -0.65, Seat 1: right +0.65)
          const seatIdx = cmd.seatIndex ?? 0
          const sign = seatIdx === 1 ? 1 : -1
          const cosY = Math.cos(prop.data.yaw)
          const sinY = Math.sin(prop.data.yaw)
          this.#spawn.x = prop.data.x + sign * cosY * 0.65
          this.#spawn.y = prop.group.position.y + 0.02
          this.#spawn.z = prop.data.z + sign * sinY * 0.65
          this.#spawn.yaw = prop.data.yaw + (seatIdx === 1 ? -Math.PI / 2 : Math.PI / 2)
        } else {
          this.#spawn.x = prop.data.x
          this.#spawn.y = prop.group.position.y
          this.#spawn.z = prop.data.z
          this.#spawn.yaw = prop.data.yaw
        }

        this.#cameraRig.setArmLength(SIT_ARM_LENGTH)
        this.#audio?.playPropPlaceSound('bench')
        break
      }
      case 'volleyballAction': {
        const court = this.#propField?.volleyballCourt
        if (!court) break

        const localSidStr = String(this.#roomClient?.sid ?? 'local')
        if (cmd.action === 'join') {
          this.#myVolleyballTeam = cmd.team ?? 'red'
          this.#myVolleyballCourtId = cmd.courtId
          court.joinTeam(localSidStr, this.#myVolleyballTeam)
          if (this.#roomClient) {
            this.#roomClient.sendVolleyballAction({
              courtId: cmd.courtId,
              action: 'join',
              team: this.#myVolleyballTeam,
              sid: this.#roomClient.sid ?? undefined,
            })
          }
        } else if (cmd.action === 'leave') {
          this.#myVolleyballTeam = null
          this.#myVolleyballCourtId = null
          court.leaveCourt(localSidStr)
          if (this.#roomClient) {
            this.#roomClient.sendVolleyballAction({
              courtId: cmd.courtId,
              action: 'leave',
              sid: this.#roomClient.sid ?? undefined,
            })
          }
        } else if (cmd.action === 'start') {
          court.startMatch()
          this.#audio?.playVolleyballWhistleSound()
          if (this.#roomClient) {
            this.#roomClient.sendVolleyballAction({
              courtId: cmd.courtId,
              action: 'start',
            })
          }
        } else if (cmd.action === 'hit') {
          const hitResult = court.hitBall(
            this.#character.x,
            this.#character.y,
            this.#character.z,
            localSidStr,
            cmd.spike,
          )
          if (hitResult?.hit) {
            this.#audio?.playVolleyballHitSound(cmd.spike)
            this.#chibiAnimator.triggerThrow()
            const ballPos = court.ballPosition
            if (this.#roomClient) {
              this.#roomClient.sendVolleyballAction({
                courtId: cmd.courtId,
                action: 'hit',
                sid: this.#roomClient.sid ?? undefined,
                ball: {
                  x: ballPos.x,
                  y: ballPos.y,
                  z: ballPos.z,
                  vx: hitResult.vx,
                  vy: hitResult.vy,
                  vz: hitResult.vz,
                },
              })
            }
          }
        } else if (cmd.action === 'reset') {
          court.resetMatch()
          if (this.#roomClient) {
            this.#roomClient.sendVolleyballAction({
              courtId: cmd.courtId,
              action: 'reset',
            })
          }
        }
        break
      }
      case 'skeetAction': {
        if (!this.#skeetField) break
        if (cmd.action === 'start') {
          const round = this.#skeetField.startRound()
          this.#audio?.playSkeetLaunchSound()
          if (this.#roomClient) {
            this.#roomClient.sendSkeetAction({
              action: 'start',
              wave: round.wave,
              targets: round.targets,
            })
          }
        } else if (cmd.action === 'reset') {
          this.#skeetField.resetRound()
          if (this.#roomClient) {
            this.#roomClient.sendSkeetAction({ action: 'reset' })
          }
        }
        break
      }
      case 'diagnose': {
        // Bare scene render, bypassing RenderPipeline, so scene cost and post cost are
        // separable. `renderer.info` resets per render (S3), hence reading immediately.
        this.#renderer.render(this.#scene, this.#cameraRig.camera)
        const sceneCalls = this.#renderer.info.render.drawCalls
        const sceneTris = this.#renderer.info.render.triangles
        this.#built.pipeline.render()
        const totalCalls = this.#renderer.info.render.drawCalls
        const cam = this.#cameraRig.camera
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
        const figPos = this.#chibiAvatar?.group.position ?? new THREE.Vector3()
        this.events.emit('diagnose', {
          sceneDrawCalls: sceneCalls,
          sceneTriangles: sceneTris,
          totalDrawCalls: totalCalls,
          sceneChildren: this.#scene.children.length,
          scatterCounts: {
            grass: this.#grass?.count ?? 0,
            rocks: this.#rocks.count,
            palms: this.#palms?.count ?? 0,
            pines: this.#pines?.count ?? 0,
            snowman: this.#snowman?.count ?? 0,
            iceHoles: this.#iceHoles?.count ?? 0,
          },
          characterState: this.#stateMachine.state,
          spawn: this.#spawn,
          spawnRadius: Math.hypot(this.#spawn.x, this.#spawn.z),
          cameraPos: [cam.position.x, cam.position.y, cam.position.z],
          cameraForward: [fwd.x, fwd.y, fwd.z],
          figurePos: [figPos.x, figPos.y, figPos.z],
          distToFigure: cam.position.distanceTo(figPos),
          // Height profile walking seaward from the spawn. If the sea is not visible,
          // this says whether it is a shading problem or the water is simply far away.
          seawardProfile: [0, 2, 5, 10, 20, 40, 80, 160].map((d) => {
            const sw = new THREE.Vector3(Math.sin(this.#spawn.yaw), 0, Math.cos(this.#spawn.yaw))
            const px = this.#spawn.x + sw.x * d
            const pz = this.#spawn.z + sw.z * d
            return { d, h: Number(sampleHeight(this.#scenery.terrain, px, pz).toFixed(2)) }
          }),
        })
        break
      }
      case 'stepFrames': {
        // Synthetic 60 Hz timeline, so stepping is deterministic and independent of
        // how long the loop actually takes.
        // Tier sampling is suppressed throughout: stepped frames run unthrottled and
        // would otherwise skew the ladder in both directions.
        this.#stepping = true
        let t = performance.now()
        for (let i = 0; i < cmd.frames; i++) {
          t += 1000 / 60
          this.#frame(t)
        }
        this.#stepping = false
        this.#lastFrameEnd = 0
        break
      }
    }
  }

  throwProjectile(): void {
    if (!this.#chibiAvatar || !this.#projectiles) return
    if (this.#throwCooldownRemainingS > 0) return
    this.#throwCooldownRemainingS = THROW_COOLDOWN_S
    const type = getTerrainProjectileType(this.#scenery.id)
    if (this.#chibiAnimator && typeof this.#chibiAnimator.triggerThrow === 'function') {
      this.#chibiAnimator.triggerThrow()
    }
    this.#audio?.playThrowSound(type)

    const charX = this.#stateMachine.state === 'stand' ? this.#character.x : this.#spawn.x
    const charY = this.#stateMachine.state === 'stand' ? this.#character.y : this.#spawn.y
    const charZ = this.#stateMachine.state === 'stand' ? this.#character.z : this.#spawn.z
    const yaw = this.#stateMachine.state === 'stand' ? this.#character.yaw : this.#spawn.yaw

    // Compute launch direction from camera orientation or avatar forward
    const camDir = new THREE.Vector3()
    this.#cameraRig.camera.getWorldDirection(camDir)

    const forwardX = Math.sin(yaw)
    const forwardZ = Math.cos(yaw)
    const rightX = Math.cos(yaw)
    const rightZ = -Math.sin(yaw)

    const handOrigin = {
      x: charX + rightX * 0.18 + forwardX * 0.15,
      y: charY + (this.#stateMachine.state === 'stand' ? 0.36 : 0.18),
      z: charZ + rightZ * 0.18 + forwardZ * 0.15,
    }

    const dir = { x: camDir.x, y: Math.max(camDir.y, -0.2), z: camDir.z }
    this.#projectiles.spawn(handOrigin, dir, type)
    // Fire-and-forget, same reasoning as `postThought`'s `sendThought` call: the local
    // throw already spawned above with zero round-trip latency, this only tells
    // whoever else is in the session.
    if (this.#roomClient) {
      this.#roomClient.sendThrow({
        x: handOrigin.x,
        y: handOrigin.y,
        z: handOrigin.z,
        dirX: dir.x,
        dirY: dir.y,
        dirZ: dir.z,
        kind: type,
      })
    }
  }

  /** Render a single frame immediately, bypassing the scheduler. */
  renderOnce(): void {
    if (!this.#renderer) return
    this.#frame(performance.now())
  }

  /**
   * A pull, not a push: `EngineEventBus` is "a few times a second, never per frame" by
   * design (see `stats`'s own doc comment), but a drifting lantern needs smoother
   * updates than that. React's `LanternLayer` calls this from its own `requestAnimationFrame`
   * loop instead of waiting on an event — same reasoning as why the render loop itself
   * isn't driven from React.
   */
  getLanternProjections(viewportWidth: number, viewportHeight: number): LanternProjection[] {
    if (!this.#cameraRig) return []
    return this.#thoughts.project(
      this.#cameraRig.camera,
      viewportWidth,
      viewportHeight,
      this.#scenery.terrain,
    )
  }

  /** Same pull pattern as `getLanternProjections` — polled every rAF frame by
   * `ConstellationHighlightLayer.tsx` rather than pushed through `EngineEventBus`,
   * since projected screen positions must track the camera continuously, not "a few
   * times a second." One label per currently-visible-and-on-screen constellation,
   * not just the searched one — see `ConstellationField.projectLabels`'s own doc
   * comment. `[]` outside the observatory scenery (no field at all). */
  getConstellationLabels(
    viewportWidth: number,
    viewportHeight: number,
  ): ConstellationLabelProjection[] {
    if (!this.#constellations || !this.#cameraRig) return []
    return this.#constellations.projectLabels(this.#cameraRig.camera, viewportWidth, viewportHeight)
  }

  /** The searchable list for `ConstellationModal.tsx` — `[]` outside the observatory
   * scenery, same "nothing to show" convention as the mini-game HUD elements. */
  getConstellationNames(): ConstellationSummary[] {
    return this.#constellations?.names ?? []
  }

  /** Lets `ConstellationModal.tsx` tell "this one's below the horizon tonight" apart
   * from an actual bug — without this, picking one that isn't up currently looked
   * identical to search silently not working at all. */
  isConstellationVisible(id: string): boolean {
    return this.#constellations?.isVisible(id) ?? false
  }

  /** Same pull pattern as `getLanternProjections` — the minimap redraws every rAF
   * frame off `RemoteAvatar.x/z`, which changes continuously as peers walk, so an
   * `EngineEventBus` event (deliberately "a few times a second, never per frame")
   * would make dots visibly stutter. `null` before `init()` assigns `#character`. */
  getMinimapSnapshot(): MinimapSnapshot | null {
    if (!this.#character) return null
    const grounded = this.#stateMachine.state === 'stand'
    const charX = grounded ? this.#character.x : this.#spawn.x
    const charZ = grounded ? this.#character.z : this.#spawn.z
    const charYaw = grounded ? this.#character.yaw : this.#spawn.yaw
    const camYaw = this.#cameraRig?.yaw ?? charYaw
    return {
      local: {
        x: charX,
        z: charZ,
        yaw: charYaw,
        cameraYaw: camYaw,
      },
      peers: [...this.#remoteAvatars.entries()].map(([sid, avatar]) => ({
        sid,
        x: avatar.x,
        z: avatar.z,
      })),
    }
  }

  dispose(): void {
    this.#disposed = true
    this.#scheduler.stop()
    this.#resizeObserver?.disconnect()
    this.#input?.detach()
    this.#built?.dispose()
    // Unsubscribe, not disconnect — the `RoomClient` itself belongs to the app layer
    // and must keep talking to the relay across this engine instance's lifetime (see
    // `EngineOptions.roomClient`'s doc comment).
    this.#roomUnsubs.forEach((unsub) => unsub())
    this.#roomUnsubs = []
    for (const avatar of this.#remoteAvatars.values()) avatar.dispose()
    this.#remoteAvatars.clear()
    this.#remoteAvatarConfigs.clear()
    this.#remoteAvatarNames.clear()
    // The whole `Engine`/renderer is going away regardless, so the race
    // `#pendingAvatarDisposals` otherwise waits out no longer applies — dispose
    // whatever's still queued right now instead of leaking it.
    for (const entry of this.#pendingAvatarDisposals) entry.avatar.dispose()
    this.#pendingAvatarDisposals = []
    this.#disposables.dispose()
    this.events.clear()
    if (this.#renderer) {
      this.#renderer.dispose()
      this.#renderer.domElement.remove()
    }
  }

  // ------------------------------------------------------------------------

  #frame(now: number): void {
    const start = performance.now()
    this.#renderer.info.reset() // autoReset is off — see createRenderer
    const tick = this.#clock.tick(now)

    // See `#pendingAvatarDisposals`'s own doc comment — counted down once per
    // rendered frame, not per real second, since what it's actually waiting out is a
    // number of `render()` calls' worth of GPU pipelining, not wall time.
    if (this.#pendingAvatarDisposals.length > 0) {
      const stillPending: { avatar: RemoteAvatar; framesLeft: number }[] = []
      for (const entry of this.#pendingAvatarDisposals) {
        entry.framesLeft--
        if (entry.framesLeft <= 0) entry.avatar.dispose()
        else stillPending.push(entry)
      }
      this.#pendingAvatarDisposals = stillPending
    }

    // Systems run in an explicit order. `resynced` means a long gap (sleep, tab
    // restore) — skip integration entirely and just re-snap.
    if (!tick.resynced) {
      if (this.#starMesh) {
        this.#starMesh.rotation.y += tick.rawDt * 0.005
      }
      // Edge-triggered, checked once per rendered frame rather than once per fixed step:
      // the 1P/3P toggle is a discrete transition, not something that should fire once
      // per step on a frame that happens to run several steps.
      if (this.#stateMachine.state === 'stand' && this.#input.consumeJustPressed('KeyV')) {
        this.#cameraRig.toggleFirstPerson()
      }
      if (this.#input.consumeJustPressed('KeyX')) {
        this.command({ type: 'togglePosture' })
      }
      if (this.#input.consumeJustPressed('KeyF')) {
        this.throwProjectile()
      }

      for (let i = 0; i < tick.steps; i++) {
        // Sampled every step regardless of state, not just while standing — look deltas
        // accumulate on every pointermove (InputMap has no idea the character is sitting)
        // and `sample()` is the only thing that drains them. Skipping it while sitting
        // would dump a session's worth of mouse movement onto the camera the instant you
        // stand.
        const input = this.#input.sample()

        // Standing up is not its own keybind — pressing a movement key while seated both
        // stands the figure up AND starts walking on the same input, which is what
        // "press W to get up and go" actually feels like. The state flips at most once:
        // after this, `state === 'stand'` stays true, so this branch stops matching.
        if (this.#stateMachine.state === 'sit' && (input.moveX !== 0 || input.moveZ !== 0)) {
          this.#stateMachine.standUp()
          this.#cameraRig.setArmLength(ARM_LENGTH_3P)
        }

        if (this.#stateMachine.state === 'stand') {
          this.#character.step(
            this.#scenery.terrain,
            input,
            this.#cameraRig.yaw,
            this.#scenery.id === 'frostholm-ridge',
          )

          // In-game court boundary confinement for active volleyball players
          if (this.#myVolleyballTeam && this.#propField?.volleyballCourt) {
            const clamped = this.#propField.volleyballCourt.clampPlayerInsideCourt(
              this.#character.x,
              this.#character.z,
              this.#myVolleyballTeam,
            )
            if (clamped.clamped) {
              this.#character.teleportTo(
                this.#scenery.terrain,
                clamped.x,
                clamped.z,
                this.#character.yaw,
              )
            }
          }

          this.#cameraRig.step(
            input,
            this.#character.x,
            this.#character.y + STANDING_EYE_HEIGHT,
            this.#character.z,
          )
        } else {
          this.#cameraRig.step(
            input,
            this.#spawn.x,
            this.#spawn.y + SEATED_EYE_HEIGHT,
            this.#spawn.z,
          )
        }
      }
    }

    const skiMode = this.#scenery.id === 'frostholm-ridge'

    if (this.#chibiAvatar && this.#chibiAnimator) {
      const isStand = this.#stateMachine.state === 'stand'
      const activeX = isStand ? this.#character.x : this.#spawn.x
      const activeY = isStand ? this.#character.y : this.#spawn.y
      const activeZ = isStand ? this.#character.z : this.#spawn.z
      const activeYaw = isStand ? this.#character.yaw : this.#spawn.yaw
      const speed = isStand ? this.#character.speed : 0

      this.#chibiAvatar.group.position.set(activeX, activeY, activeZ)
      this.#chibiAvatar.group.rotation.y = activeYaw

      this.#chibiAnimator.update(
        this.#chibiAvatar.rig,
        this.#stateMachine.state,
        speed,
        tick.rawDt,
        this.#clock.wallTime,
        isStand ? this.#character.isGrounded : true,
        isStand && skiMode,
        this.#character.yawRate,
      )

      this.#playerLantern?.update(tick.rawDt, activeX, activeY, activeZ, activeYaw)

      if (this.#snowSpray && isStand && skiMode && this.#skis) {
        const moveDeltaX = activeX - this.#lastPlayerX
        const moveDeltaZ = activeZ - this.#lastPlayerZ
        const moveDist = Math.hypot(moveDeltaX, moveDeltaZ)

        if (moveDist > 0.002 || speed > 0.2) {
          const leftWorldPos = new THREE.Vector3()
          const rightWorldPos = new THREE.Vector3()
          this.#skis.left.getWorldPosition(leftWorldPos)
          this.#skis.right.getWorldPosition(rightWorldPos)

          this.#snowSpray.emitFromSkis(
            leftWorldPos.x,
            leftWorldPos.y,
            leftWorldPos.z,
            rightWorldPos.x,
            rightWorldPos.y,
            rightWorldPos.z,
            moveDeltaX,
            moveDeltaZ,
            speed,
            tick.rawDt,
          )
        }
      }
      this.#lastPlayerX = activeX
      this.#lastPlayerZ = activeZ

      this.#coinField?.update(this.#clock.wallTime, tick.rawDt, activeX, activeY, activeZ)
    }

    // Remote avatars (LAN multiplayer, optional). Smoothing/animation advances every
    // frame regardless of whether this scenery even has a deformation field — a peer
    // still needs to move and animate on a scenery with no footprints at all.
    const remoteFootfalls: { x: number; z: number; pressure: number }[] = []
    for (const avatar of this.#remoteAvatars.values()) {
      const footfalls = avatar.update(
        tick.rawDt,
        this.#scenery.terrain,
        this.#clock.wallTime,
        skiMode,
      )
      remoteFootfalls.push(...footfalls)
      if (this.#snowSpray && skiMode && avatar.speed > 0.25) {
        this.#snowSpray.emit(avatar.x, avatar.y, avatar.z, avatar.yaw, avatar.speed, 0, tick.rawDt)
      }
    }

    this.#snowSpray?.update(tick.rawDt)

    this.#avatarRerankAccum += tick.rawDt
    if (this.#avatarRerankAccum >= 1) {
      this.#avatarRerankAccum = 0
      this.#rerankRemoteAvatarDetail()
    }

    const p = this.#cameraRig.camera.position
    if (this.#skyDome) {
      this.#skyDome.position.copy(p)
    }
    if (this.#constellations) {
      this.#constellations.group.position.copy(p)
    }
    this.#clipmap.update(p.x, p.z)
    // No water/sand for a non-coastal scenery — nothing to update.
    if (this.#waterClipmap && this.#water) {
      this.#waterClipmap.update(p.x, p.z)
      this.#water.setTime(this.#clock.wallTime)
    }
    this.#propField?.update(
      tick.rawDt,
      this.#clock.wallTime,
      (scoringTeam, scoreRed, scoreBlue, winner) => {
        if (winner) {
          this.#audio?.playVolleyballWinSound()
        } else {
          this.#audio?.playVolleyballWhistleSound()
        }
        const courtId = this.#propField?.volleyballCourt?.id ?? ''
        this.events.emit('volleyball', {
          courtId,
          action: 'point',
          team: scoringTeam,
          scoreRed,
          scoreBlue,
          winner,
        })
        if (this.#roomClient) {
          this.#roomClient.sendVolleyballAction({
            courtId,
            action: 'point',
            team: scoringTeam,
            scoreRed,
            scoreBlue,
            winner,
          })
        }
      },
    )

    // Check nearby interactable props (every ~60ms)
    this.#nearbyCheckAccum += tick.rawDt
    if (this.#nearbyCheckAccum >= 0.06) {
      this.#nearbyCheckAccum = 0
      const activeCharX = this.#stateMachine.state === 'stand' ? this.#character.x : this.#spawn.x
      const activeCharZ = this.#stateMachine.state === 'stand' ? this.#character.z : this.#spawn.z
      let nearby: EngineEvents['nearbyProp'] =
        this.#propField?.getNearbyProp(activeCharX, activeCharZ, 2.2) ?? null
      if (!nearby && this.#skeetField) {
        const distToSkeet = Math.hypot(
          activeCharX - this.#skeetField.originX,
          activeCharZ - this.#skeetField.originZ,
        )
        if (distToSkeet < 4.2) {
          const stats = this.#skeetField.stats
          nearby = {
            id: 'skeet_stand',
            type: 'skeet_stand',
            x: this.#skeetField.originX,
            y: this.#skeetField.standY,
            z: this.#skeetField.originZ,
            yaw: 0,
            active: this.#skeetField.matchState === 'in_progress',
            matchState:
              this.#skeetField.matchState === 'in_progress'
                ? 'in_rally'
                : this.#skeetField.matchState === 'completed'
                  ? 'game_over'
                  : 'idle',
            skeetWave: stats.currentWave,
            skeetTotalWaves: stats.totalWaves,
            skeetHits: stats.hits,
            skeetTotal: stats.total,
            dist: distToSkeet,
          }
        }
      }
      const nearbyKey = nearby
        ? `${nearby.id}-${nearby.active}-${nearby.teamSide}-${nearby.matchState}-${nearby.scoreRed}-${nearby.scoreBlue}-${nearby.skeetWave}-${nearby.skeetHits}-${this.#myVolleyballTeam}`
        : null
      if (nearbyKey !== this.#lastNearbyPropId) {
        this.#lastNearbyPropId = nearbyKey
        this.events.emit(
          'nearbyProp',
          nearby ? { ...nearby, myTeam: this.#myVolleyballTeam } : null,
        )
      }
    }

    // Update flying skeet clay pigeon targets
    if (this.#skeetField) {
      const skeetUpdate = this.#skeetField.update(tick.rawDt)
      if (skeetUpdate.newWave) {
        this.#audio?.playSkeetLaunchSound()
        if (this.#roomClient) {
          this.#roomClient.sendSkeetAction({
            action: 'launch',
            wave: skeetUpdate.newWave.wave,
            targets: skeetUpdate.newWave.targets,
          })
        }
      } else if (skeetUpdate.waveComplete) {
        this.#audio?.playVolleyballWinSound()
      }
    }

    // Auto-bump volleyball when player gets close during active rally
    const court = this.#propField?.volleyballCourt
    if (court && court.matchState === 'in_rally') {
      const hitResult = court.hitBall(
        this.#character.x,
        this.#character.y,
        this.#character.z,
        String(this.#roomClient?.sid ?? 'local'),
        false,
      )
      if (hitResult?.hit) {
        this.#audio?.playVolleyballHitSound(false)
        this.#chibiAnimator.triggerThrow()
        const ballPos = court.ballPosition
        if (this.#roomClient) {
          this.#roomClient.sendVolleyballAction({
            courtId: court.id,
            action: 'hit',
            sid: this.#roomClient.sid ?? undefined,
            ball: {
              x: ballPos.x,
              y: ballPos.y,
              z: ballPos.z,
              vx: hitResult.vx,
              vy: hitResult.vy,
              vz: hitResult.vz,
            },
          })
        }
      }
    }

    // Footprints (§4). Both fields accept a list — this is that "multiplayer avatars
    // slot in without this call site changing shape" moment the original comment here
    // anticipated. At most one of `#sandField`/`#snowField` exists per scenery, never
    // both. Projectile impacts ride this exact same list too, for the same reason
    // remote footfalls do: exactly one `update()` call per frame, not one per event.
    if (this.#sandField || this.#snowField) {
      const footprints: { x: number; z: number; pressure: number }[] = [
        ...remoteFootfalls,
        ...this.#pendingImpactStamps,
      ]
      if (this.#stateMachine.state === 'stand') {
        if (!this.#hasLastChar) {
          this.#lastCharX = this.#character.x
          this.#lastCharZ = this.#character.z
          this.#hasLastChar = true
        }
        const dist = Math.hypot(
          this.#character.x - this.#lastCharX,
          this.#character.z - this.#lastCharZ,
        )
        this.#lastCharX = this.#character.x
        this.#lastCharZ = this.#character.z

        if (skiMode) {
          // Boot-print shape (discrete, centered, radially symmetric) reads as
          // visibly wrong under skis — `SkiTrackTracker` instead fires both ski
          // grooves together, closely spaced, so consecutive circular stamps overlap
          // into what reads as two continuous tracks.
          this.#footfalls.reset()
          const trackStamps = this.#skiTracks.step(
            this.#character.x,
            this.#character.z,
            this.#character.yaw,
            this.#character.speed,
            dist,
          )
          if (trackStamps.length > 0) {
            footprints.push(...trackStamps)
            this.#footfallCount += trackStamps.length
          }
        } else {
          this.#skiTracks.reset()
          // A discrete stamp only when a foot actually lands (alternating left/right),
          // not one every frame — see `FootfallTracker`'s own doc comment for why.
          const footfall = this.#footfalls.step(
            this.#character.x,
            this.#character.z,
            this.#character.yaw,
            this.#character.speed,
            dist,
          )
          if (footfall) {
            footprints.push(footfall)
            this.#footfallCount++
          }
        }
      } else {
        this.#hasLastChar = false
        this.#footfalls.reset()
        this.#skiTracks.reset()
      }
      if (this.#sandField) {
        this.#sandField.update(this.#renderer, tick.rawDt, footprints)
        this.#terrain.setSandTexture?.(this.#sandField.texture)
      }
      if (this.#snowField) {
        this.#snowField.update(this.#renderer, tick.rawDt, footprints)
        this.#terrain.setSnowTexture?.(this.#snowField.texture)
      }
    }
    // Drained every frame regardless of whether either field exists above — a
    // scenery with neither (nothing thrown ever stamps anywhere) must not let this
    // grow unbounded across a long session.
    this.#pendingImpactStamps = []

    this.#thoughts.update(tick.rawDt)

    const charX = this.#stateMachine.state === 'stand' ? this.#character.x : this.#spawn.x
    const charY = this.#stateMachine.state === 'stand' ? this.#character.y : this.#spawn.y
    const charZ = this.#stateMachine.state === 'stand' ? this.#character.z : this.#spawn.z
    const charYaw = this.#stateMachine.state === 'stand' ? this.#character.yaw : this.#spawn.yaw
    const isMoving = this.#stateMachine.state === 'stand' && this.#character.speed > 0.1
    this.#companionPet?.update(tick.rawDt, charX, charY, charZ, charYaw, isMoving)

    const peerHitTargets = [...this.#remoteAvatars.entries()].map(([sid, avatar]) => ({
      sid,
      x: avatar.x,
      z: avatar.z,
      radius: PEER_HIT_RADIUS_M,
    }))
    this.#projectiles.update(
      tick.rawDt,
      this.#scenery.terrain,
      this.#targetField?.targets,
      peerHitTargets,
      this.#skeetField?.activeTargets,
    )

    // Target-practice reset: every client attempts this once the delay elapses, host
    // or not — `announceTargetsReset()` is silently dropped by the relay unless the
    // caller actually is host, the same "just always announce, let the relay's own
    // authority check decide" pattern `announceScenery`/`announceTimeOfDay` already
    // use. Solo play has no `#roomClient` at all, so the local reset is the only
    // thing that happens there.
    if (
      this.#targetsAllDownAt !== null &&
      this.#clock.wallTime - this.#targetsAllDownAt >= TARGET_RESET_DELAY_S
    ) {
      this.#applyTargetsReset()
      this.#roomClient?.announceTargetsReset()
    }

    if (this.#throwCooldownRemainingS > 0) this.#throwCooldownRemainingS -= tick.rawDt

    const grounded = this.#stateMachine.state === 'stand'
    this.#audio.update(
      grounded ? this.#character.x : this.#spawn.x,
      grounded ? this.#character.z : this.#spawn.z,
      grounded ? this.#character.speed : 0,
      // No boot-crunch footstep audio while skiing — same reasoning as suppressing
      // the visual snow footprints just above: crunchy boot steps under skis would
      // be audibly wrong, not just visually.
      grounded && !skiMode,
    )

    // LAN multiplayer (optional): send local pose at INPUT_HZ, not every render frame
    // — 60Hz would be needless bandwidth even on a LAN, and the relay only
    // rebroadcasts at its own snapshot rate anyway.
    if (this.#roomClient) {
      this.#localInputAccum += tick.rawDt
      if (this.#localInputAccum >= 1 / INPUT_HZ) {
        this.#localInputAccum = 0
        const speed = grounded ? this.#character.speed : 0
        const anim: AnimState = !grounded
          ? 'sit'
          : speed >= 2.5
            ? 'run'
            : speed > 0.2
              ? 'walk'
              : 'idle'
        this.#roomClient.sendInput({
          x: grounded ? this.#character.x : this.#spawn.x,
          y: grounded ? this.#character.y : this.#spawn.y,
          z: grounded ? this.#character.z : this.#spawn.z,
          yaw: grounded ? this.#character.yaw : this.#spawn.yaw,
          anim,
          flags: 0,
        })
      }
    }

    if (now - this.#lastPositionSavedAt > 1000 && this.#character) {
      this.#lastPositionSavedAt = now
      savePosition(this.#scenery.id, {
        x: this.#character.x,
        y: this.#character.y,
        z: this.#character.z,
        yaw: this.#character.yaw,
      })
    }

    const currentSunY = this.#sun?.position.y ?? 0
    const nightFactor = Math.max(0, Math.min(1, (-currentSunY / 300) * 1.8))
    this.#updateMeteors(now, nightFactor)

    this.#built.pipeline.render() // sync at r185 — never await per frame (S1)

    const end = performance.now()
    const cpuMs = end - start

    // Drive the tier ladder from FRAME-TO-FRAME wall time, not from the CPU work
    // window. On WebGPU `render()` returns once commands are *submitted* (S3), so the
    // CPU window is ~1ms even when the GPU is drowning — a ladder fed by it would
    // never demote. Frame-to-frame time is display-paced and does reflect GPU load.
    const frameMs = this.#lastFrameEnd === 0 ? cpuMs : end - this.#lastFrameEnd
    this.#lastFrameEnd = end

    // Ignore implausible deltas. A 170ms frame-to-frame gap is a *stall* — a paused
    // loop, an alt-tab, a stepped frame — not sustained GPU load, and demoting on it
    // would silently cost users quality every time they switched windows.
    if (frameMs <= STALL_MS && !this.#stepping) this.#quality.sample(frameMs, now)
    this.#frames++
    this.#frameMsAcc += cpuMs
    if (this.#statsAt === 0) this.#statsAt = end

    const elapsed = end - this.#statsAt
    if (elapsed >= STATS_INTERVAL_MS) {
      const drawCalls = this.#renderer.info.render.drawCalls
      const triangles = this.#renderer.info.render.triangles
      if (process.env.NODE_ENV !== 'production') this.#assertBudget(drawCalls, triangles)
      this.events.emit('stats', {
        // Frames per second of *wall clock*, not 1/frameMs. During `stepFrames` this
        // correctly reports unthrottled throughput rather than a fictional display rate.
        fps: Math.round((this.#frames * 1000) / elapsed),
        frameMs: this.#frameMsAcc / this.#frames,
        tierFrameMs: this.#quality.frameMs,
        drawCalls,
        triangles,
        tier: this.#quality.tier,
        targetHz: this.#scheduler.effectiveHz,
        backend: this.#backend,
        characterState: this.#stateMachine.state,
        firstPerson: this.#cameraRig.firstPerson,
        thoughtCooldownS: this.#thoughts.authorCooldownS(),
        footprintDepthAtFeet: this.#footprintDepthAtFeet,
        footfallCount: this.#footfallCount,
        footprintScan: this.#footprintScan,
      })
      this.#statsAt = end
      this.#frames = 0
      this.#frameMsAcc = 0
      this.#kickFootprintDepthRead()
    }
  }

  /** Fire-and-forget: `readRenderTargetPixelsAsync` is a real GPU round-trip (a buffer
   * map), too slow to await inline in the per-frame path. `#readingFootprintDepth`
   * drops overlapping reads rather than queuing them — this is a diagnostic, not
   * something that needs every tick accounted for. */
  #kickFootprintDepthRead(): void {
    const field = this.#sandField ?? this.#snowField
    if (!field || this.#readingFootprintDepth) return
    this.#readingFootprintDepth = true
    const x = this.#stateMachine.state === 'stand' ? this.#character.x : this.#spawn.x
    const z = this.#stateMachine.state === 'stand' ? this.#character.z : this.#spawn.z
    field
      .readDepthNear(this.#renderer, x, z)
      .then((depth) => {
        this.#footprintDepthAtFeet = depth
      })
      .catch(() => {
        this.#footprintDepthAtFeet = null
      })
      .finally(() => {
        this.#readingFootprintDepth = false
      })
  }

  /** `RosterEvent` from whatever `RoomClient` is connected. `'join'` covers both an
   * actual join and a later avatar-config change — the relay sends the same `roster`
   * message shape for either, so a `RemoteAvatar` that already exists just gets its
   * config updated rather than being torn down and rebuilt. */
  #handleRosterEvent(event: RosterEvent): void {
    this.events.emit('peers', event)

    if (event.type === 'leave') {
      const court = this.#propField?.volleyballCourt
      if (court) {
        court.leaveCourt(String(event.sid))
        court.resetMatch()
      }
      const avatar = this.#remoteAvatars.get(event.sid)
      if (!avatar) return
      this.#scene.remove(avatar.group)
      this.#pendingAvatarDisposals.push({ avatar, framesLeft: AVATAR_DISPOSE_DELAY_FRAMES })
      this.#remoteAvatars.delete(event.sid)
      this.#remoteAvatarConfigs.delete(event.sid)
      this.#remoteAvatarNames.delete(event.sid)
      return
    }

    // Remembered separately from the `RemoteAvatar` instance itself — re-ranking
    // (`#rerankRemoteAvatarDetail`) needs to *rebuild* an avatar from scratch when its
    // detail tier changes, and a `'cheap'` instance only ever kept `outfitColor`, not
    // the full config a `'full'` rebuild needs.
    this.#remoteAvatarConfigs.set(event.sid, event.avatarConfig as unknown as ChibiAvatarConfig)
    this.#remoteAvatarNames.set(event.sid, event.name)

    const existing = this.#remoteAvatars.get(event.sid)
    if (existing) {
      existing.updateConfig(event.avatarConfig as Partial<ChibiAvatarConfig>)
      existing.setName(event.name)
      return
    }
    // Spawns at the local spawn point, not (0,0,0) — a peer's first snapshot arrives
    // within one network tick and corrects this immediately, but spawning at the
    // world origin would put them underground or in the sea for that one frame on a
    // scenery whose walkable area sits far from (0,0) (see `HeightSpec.ts`'s spawn
    // doc comments — both sceneries' spawns are well off-centre). Always starts
    // `'full'` — `#rerankRemoteAvatarDetail` demotes it within one rerank interval if
    // the party's already at the cap, which is simpler than guessing a brand-new
    // peer's eventual distance from the camera up front.
    const avatar = new RemoteAvatar(
      event.avatarConfig as unknown as ChibiAvatarConfig,
      { x: this.#spawn.x, z: this.#spawn.z, yaw: this.#spawn.yaw },
      'full',
      event.name,
      this.#scenery.id === 'frostholm-ridge',
    )
    this.#scene.add(avatar.group)
    this.#remoteAvatars.set(event.sid, avatar)
    console.log(
      `[lan] remote avatar added sid=${event.sid} name="${event.name}" at (${this.#spawn.x.toFixed(1)}, ${this.#spawn.z.toFixed(1)}), group children=${avatar.group.children.length}, in scene=${this.#scene.children.includes(avatar.group)}`,
    )
  }

  /** Nearest `TIER_SETTINGS[tier].maxFullAvatars` VISIBLE peers (by distance to the
   * camera) render as the full `ChibiAvatarMesh`; the rest of the visible ones fall
   * back to `RemoteAvatar`'s cheap placeholder tier — see that file's own doc comment
   * for why. Beyond `MAX_AVATAR_RENDER_DISTANCE_M`, a peer is hidden from the 3D scene
   * entirely (`group.visible = false`) and forced to `'cheap'` regardless of rank —
   * there's no point spending a "full detail" slot on someone who isn't even drawn.
   *
   * Frustum culling is deliberately NOT reimplemented here: `Mesh.frustumCulled`
   * defaults to `true` and nothing in `ChibiAvatarMesh`/`RemoteAvatar` turns it off,
   * so THREE already lazily computes each merged mesh's bounding sphere and culls
   * off-screen/behind-camera peers correctly on its own — verified directly
   * (`Frustum.intersectsObject` against a real avatar mesh) rather than assumed, since
   * writing culling code for something that already works would just be needless risk
   * for zero benefit.
   *
   * Only actually rebuilds an avatar (dispose + reconstruct, carrying its current
   * smoothed position/yaw across so there's no visual snap) when its assigned tier
   * differs from what it currently is; called periodically, not every frame, by
   * `#frame()`. */
  #rerankRemoteAvatarDetail(): void {
    if (this.#remoteAvatars.size === 0) return
    const cap = TIER_SETTINGS[this.#quality.tier].maxFullAvatars
    const maxDistSq = MAX_AVATAR_RENDER_DISTANCE_M * MAX_AVATAR_RENDER_DISTANCE_M
    const camPos = this.#cameraRig.camera.position
    const ranked = [...this.#remoteAvatars.entries()]
      .map(([sid, avatar]) => ({
        sid,
        avatar,
        distSq: (avatar.x - camPos.x) ** 2 + (avatar.z - camPos.z) ** 2,
      }))
      .sort((a, b) => a.distSq - b.distSq)

    let visibleRank = 0
    for (const { sid, avatar, distSq } of ranked) {
      const beyondRenderDistance = distSq > maxDistSq
      const wantDetail: RemoteAvatarDetail =
        beyondRenderDistance || visibleRank >= cap ? 'cheap' : 'full'
      if (!beyondRenderDistance) visibleRank++

      if (avatar.detail !== wantDetail) {
        const config = this.#remoteAvatarConfigs.get(sid)
        if (!config) continue
        const name = this.#remoteAvatarNames.get(sid)
        const replacement = new RemoteAvatar(
          config,
          { x: avatar.x, z: avatar.z, yaw: avatar.yaw },
          wantDetail,
          name,
          this.#scenery.id === 'frostholm-ridge',
        )
        replacement.group.visible = !beyondRenderDistance
        this.#scene.remove(avatar.group)
        this.#pendingAvatarDisposals.push({ avatar, framesLeft: AVATAR_DISPOSE_DELAY_FRAMES })
        this.#scene.add(replacement.group)
        this.#remoteAvatars.set(sid, replacement)
      } else {
        avatar.group.visible = !beyondRenderDistance
      }
    }
  }

  /** Merged position snapshot, ~`INPUT_HZ` times a second. Skips our own echoed-back
   * entry — the relay broadcasts to everyone including the sender rather than
   * maintaining a per-recipient exclusion list. */
  #applyRemoteSnapshot(snapshot: Snapshot): void {
    const localSid = this.#roomClient?.sid
    for (const a of snapshot.avatars) {
      if (a.sid === localSid) continue
      this.#remoteAvatars.get(a.sid)?.setTarget(a.x, a.y, a.z, a.yaw, a.anim)
    }
  }

  /** The relay broadcasts a thought to everyone including its own sender, so this
   * guards against re-posting our own words back to ourselves — the local
   * `postThought` command already posted it once, immediately, with no round-trip
   * latency. Anchors the lantern at the sender's last known *rendered* position
   * (`RemoteAvatar.x/z`, not whatever arrived in the same network tick), since the
   * wire message carries no position of its own — thoughts are rare enough that
   * reusing the avatar's own smoothed position is simpler than adding a redundant
   * field to every thought message just for this. */
  #handleRemoteThought(thought: Thought): void {
    if (thought.sid === this.#roomClient?.sid) return
    const avatar = this.#remoteAvatars.get(thought.sid)
    const x = avatar?.x ?? this.#spawn.x
    const z = avatar?.z ?? this.#spawn.z
    this.#thoughts.post(thought.text, x, z, `remote-${thought.sid}`, `relay-${thought.id}`)
  }

  /** A peer's thrown object, arriving over the network — same echo-guard reasoning as
   * `#handleRemoteThought`: the local throw already spawned instantly with zero
   * round-trip latency, so a client seeing its own broadcast come back must ignore
   * it. Spawns straight from the wire message's own origin/direction (not the peer's
   * `RemoteAvatar` position) since those are exactly what the thrower actually used —
   * the same reasoning as `input`, not `thought`'s "reuse the avatar's own position"
   * shortcut (a thought has nowhere else to put its position; a throw already carries
   * one). The arm-swing on the peer's own avatar is a nice-to-have on top, not the
   * object's source of truth. */
  #handleRemoteThrow(event: ThrowEvent): void {
    if (event.sid === this.#roomClient?.sid) return
    this.#projectiles?.spawn(
      { x: event.x, y: event.y, z: event.z },
      { x: event.dirX, y: event.dirY, z: event.dirZ },
      event.kind as ProjectileMaterialType,
    )
    this.#remoteAvatars.get(event.sid)?.triggerThrow()
  }

  /** My own projectile determined this hit (`ProjectileField`'s `onTargetHit`
   * callback) — apply it locally and, unlike `#handleRemoteTargetHit`, also tell
   * everyone else. Every OTHER client watching the same thrown ball (they received
   * it via `onThrow` and are simulating their own independent copy — see
   * `ProjectileField`'s own doc comment on why clients can disagree at the margins)
   * might make the same call themselves and broadcast it too; `#applyTargetHit`'s own
   * idempotency guard is what makes that harmless instead of a duplicate-event bug. */
  #handleTargetHit(index: number): void {
    this.#applyTargetHit(index)
    this.#roomClient?.sendTargetHit(index)
  }

  /** Someone else's hit claim (or our own, echoed back by the relay to every client
   * including the sender) — just apply it, never re-broadcast. Re-sending here would
   * be an infinite echo loop. */
  #handleRemoteTargetHit(event: TargetHitEvent): void {
    this.#applyTargetHit(event.targetId)
  }

  #applyTargetHit(index: number): void {
    const field = this.#targetField
    if (!field || field.isKnockedDown(index)) return
    field.setKnockedDown(index, true)
    const hit = field.targets.filter((_, i) => field.isKnockedDown(i)).length
    this.events.emit('targetHit', { index, hit, total: field.targets.length })
    if (field.allKnockedDown()) this.#targetsAllDownAt = this.#clock.wallTime
  }

  /** Every target back to standing — from either a host's broadcast reset or this
   * client's own `#frame()` noticing the delay elapsed (see that call site's own
   * comment on why every client attempts this, host or not). Idempotent: resetting
   * an already-standing target is a no-op, which is what makes the redundant local
   * attempt + the eventual official broadcast both landing harmless instead of a
   * double-reset bug. */
  #applyTargetsReset(): void {
    const field = this.#targetField
    if (!field) return
    for (let i = 0; i < field.targets.length; i++) field.setKnockedDown(i, false)
    this.#targetsAllDownAt = null
    this.events.emit('targetsReset', { total: field.targets.length })
  }

  /** The "friendly bonk" — a thrown ball landed on a peer instead of the ground or a
   * target. No state change, no elimination, just a reaction; see `ProjectileField`'s
   * `onPeerHit` doc comment. */
  #handlePeerHit(_sid: Sid, type: ProjectileMaterialType): void {
    this.#audio?.playImpactSound(type)
  }

  /** A local throw hit a flying skeet clay — same "apply locally, then tell everyone
   * else" shape as `#handleTargetHit`. `shatterTarget` is idempotent (a no-op if the
   * target is already inactive), so a duplicate claim from elsewhere (this client's
   * own broadcast echoed back via `onSkeetAction`) is harmless. */
  #handleSkeetHit(targetId: number): void {
    this.#skeetField?.shatterTarget(targetId)
    this.#audio?.playSkeetShatterSound()
    this.#roomClient?.sendSkeetAction({ action: 'hit', targetId })
  }

  /** Warns at most once per budget-exceeded stretch, not once per stats tick — repeating
   * the same warning every 500ms for a whole scene swap would train everyone to ignore it. */
  #assertBudget(drawCalls: number, triangles: number): void {
    const overBudget = drawCalls > MAX_DRAW_CALLS || triangles > MAX_TRIANGLES
    if (overBudget && !this.#overBudget) {
      console.warn(
        `[chill] over budget: ${drawCalls} draw calls (max ${MAX_DRAW_CALLS}), ` +
          `${triangles.toLocaleString()} triangles (max ${MAX_TRIANGLES.toLocaleString()})`,
      )
    }
    this.#overBudget = overBudget
  }

  /** Apply every tier setting that can change at runtime. */
  #applyTierSettings(): void {
    const s = TIER_SETTINGS[this.#quality.tier]
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * s.renderScale)
    this.#sun.castShadow = s.shadows
    this.#sun.shadow.mapSize.set(s.shadowMapSize, s.shadowMapSize)
    // Force the shadow map to be reallocated at the new size; without disposing it,
    // mapSize is ignored after the first frame — which is exactly why `medium` and
    // `high` used to look identical.
    this.#sun.shadow.map?.dispose()
    this.#sun.shadow.map = null
    this.#clipmap.setVisibleLevels(s.clipmapLevels)
    this.#waterClipmap?.setVisibleLevels(s.waterLevels)
    if (this.#grass) this.#grass.mesh.visible = s.foliage
    this.#rocks.mesh.visible = s.foliage
    if (this.#palms) this.#palms.mesh.visible = s.foliage
    if (this.#pines) this.#pines.mesh.visible = s.foliage
    if (this.#snowman) this.#snowman.mesh.visible = s.foliage
    if (this.#iceHoles) this.#iceHoles.mesh.visible = s.foliage
  }

  #rebuildPipeline(): void {
    if (!this.#renderer) return
    this.#applyTierSettings()
    this.#built.dispose()
    this.#built = buildRenderPipeline(
      this.#renderer,
      this.#scene,
      this.#cameraRig.camera,
      this.#quality.tier,
    )
    this.#quality.settle(performance.now())
    // Rebuilding swaps the pipeline; without a render the canvas keeps presenting the
    // stale swapchain image, which reads as the app freezing on a tier change.
    this.#lastFrameEnd = 0
    this.renderOnce()
  }

  /**
   * `device.lost` fires on driver updates and some sleep/wake cycles. With all-day
   * uptime this is a *when*, not an *if* — and essentially every three.js demo ignores
   * it, which is why they die overnight. We at least surface it honestly; full
   * rebuild-from-descriptor lands with the scene system in §6.
   */
  #watchDeviceLoss(): void {
    const device = (this.#renderer.backend as { device?: GPUDevice }).device
    if (!device) return
    void device.lost.then((info) => {
      if (this.#disposed) return
      this.#scheduler.stop()
      this.events.emit('deviceLost', { reason: info.message || String(info.reason) })
    })
  }

  #emitAudioState(): void {
    this.events.emit('audioState', { unlocked: getAudioContextState() === 'running' })
  }

  #hostSize(): { width: number; height: number } {
    return {
      width: Math.max(1, Math.floor(this.#host.clientWidth)),
      height: Math.max(1, Math.floor(this.#host.clientHeight)),
    }
  }

  #applyNormalizedTime(progress: number): void {
    if (!this.#sky) return
    // Centralized here rather than at each of this method's 4 call sites (the
    // real-clock default, the LAN late-joiner bootstrap, the `setTimeNormalized`
    // command, and the LAN `onTimeOfDayChange` subscription) — one check instead of
    // four, and it means even a peer's broadcast time change can't un-lock it.
    // `SkyClock.tsx` is also told to render read-only for this scenery so there's no
    // control left implying it's draggable, but this is the actual enforcement.
    if (this.#scenery.id === 'observatory') progress = 0 // 0 = 00:00, deep night
    const p = ((progress % 1) + 1) % 1 // wrap to [0, 1)

    // Calculate sun trajectory vector (east to west, elevation follows sin curve)
    // 0 = 00:00 (night), 0.25 = 06:00 (dawn), 0.5 = 12:00 (noon), 0.75 = 18:00 (sunset)
    const angle = p * Math.PI * 2 - Math.PI / 2
    const sinA = Math.sin(angle) // -1 at midnight, +1 at noon
    const cosA = Math.cos(angle) // 0 at noon/midnight, -1 at 6am, +1 at 6pm

    const sunX = -cosA * 0.75
    const sunY = sinA
    const sunZ = -0.45
    const sunDir: [number, number, number] = [sunX, sunY, sunZ]

    const P = TIME_OF_DAY_PRESETS

    let zenithColor: THREE.Color
    let horizonColor: THREE.Color
    let sunColor: THREE.Color
    let hemiSkyColor: THREE.Color
    let hemiGroundColor: THREE.Color
    let sunIntensity: number
    let lightIntensity: number

    if (p < 0.25) {
      // Midnight (0.0) -> Dawn (0.25)
      const t = p / 0.25
      zenithColor = new THREE.Color(P.moonlight.zenith).lerp(new THREE.Color(P.dawn.zenith), t)
      horizonColor = new THREE.Color(P.moonlight.horizon).lerp(new THREE.Color(P.dawn.horizon), t)
      sunColor = new THREE.Color(P.moonlight.sunColor).lerp(new THREE.Color(P.dawn.sunColor), t)
      hemiSkyColor = new THREE.Color(P.moonlight.hemiSky).lerp(new THREE.Color(P.dawn.hemiSky), t)
      hemiGroundColor = new THREE.Color(P.moonlight.hemiGround).lerp(
        new THREE.Color(P.dawn.hemiGround),
        t,
      )
      sunIntensity = THREE.MathUtils.lerp(P.moonlight.sunIntensity, P.dawn.sunIntensity, t)
      lightIntensity = THREE.MathUtils.lerp(
        P.moonlight.sunLightIntensity,
        P.dawn.sunLightIntensity,
        t,
      )
    } else if (p < 0.5) {
      // Dawn (0.25) -> Noon (0.50)
      const t = (p - 0.25) / 0.25
      zenithColor = new THREE.Color(P.dawn.zenith).lerp(new THREE.Color(P.noon.zenith), t)
      horizonColor = new THREE.Color(P.dawn.horizon).lerp(new THREE.Color(P.noon.horizon), t)
      sunColor = new THREE.Color(P.dawn.sunColor).lerp(new THREE.Color(P.noon.sunColor), t)
      hemiSkyColor = new THREE.Color(P.dawn.hemiSky).lerp(new THREE.Color(P.noon.hemiSky), t)
      hemiGroundColor = new THREE.Color(P.dawn.hemiGround).lerp(
        new THREE.Color(P.noon.hemiGround),
        t,
      )
      sunIntensity = THREE.MathUtils.lerp(P.dawn.sunIntensity, P.noon.sunIntensity, t)
      lightIntensity = THREE.MathUtils.lerp(P.dawn.sunLightIntensity, P.noon.sunLightIntensity, t)
    } else if (p < 0.75) {
      // Noon (0.50) -> Sunset (0.75)
      const t = (p - 0.5) / 0.25
      zenithColor = new THREE.Color(P.noon.zenith).lerp(new THREE.Color(P.sunset.zenith), t)
      horizonColor = new THREE.Color(P.noon.horizon).lerp(new THREE.Color(P.sunset.horizon), t)
      sunColor = new THREE.Color(P.noon.sunColor).lerp(new THREE.Color(P.sunset.sunColor), t)
      hemiSkyColor = new THREE.Color(P.noon.hemiSky).lerp(new THREE.Color(P.sunset.hemiSky), t)
      hemiGroundColor = new THREE.Color(P.noon.hemiGround).lerp(
        new THREE.Color(P.sunset.hemiGround),
        t,
      )
      sunIntensity = THREE.MathUtils.lerp(P.noon.sunIntensity, P.sunset.sunIntensity, t)
      lightIntensity = THREE.MathUtils.lerp(P.noon.sunLightIntensity, P.sunset.sunLightIntensity, t)
    } else {
      // Sunset (0.75) -> Midnight (1.00)
      const t = (p - 0.75) / 0.25
      zenithColor = new THREE.Color(P.sunset.zenith).lerp(new THREE.Color(P.moonlight.zenith), t)
      horizonColor = new THREE.Color(P.sunset.horizon).lerp(new THREE.Color(P.moonlight.horizon), t)
      sunColor = new THREE.Color(P.sunset.sunColor).lerp(new THREE.Color(P.moonlight.sunColor), t)
      hemiSkyColor = new THREE.Color(P.sunset.hemiSky).lerp(new THREE.Color(P.moonlight.hemiSky), t)
      hemiGroundColor = new THREE.Color(P.sunset.hemiGround).lerp(
        new THREE.Color(P.moonlight.hemiGround),
        t,
      )
      sunIntensity = THREE.MathUtils.lerp(P.sunset.sunIntensity, P.moonlight.sunIntensity, t)
      lightIntensity = THREE.MathUtils.lerp(
        P.sunset.sunLightIntensity,
        P.moonlight.sunLightIntensity,
        t,
      )
    }

    this.#sky.uniforms.sunDirection.value.set(...sunDir).normalize()
    this.#sky.uniforms.sunIntensity.value = sunIntensity
    this.#sky.uniforms.zenith.value.copy(zenithColor)
    this.#sky.uniforms.horizon.value.copy(horizonColor)
    this.#sky.uniforms.sunColor.value.copy(sunColor)

    if (this.#sun) {
      this.#sun.color.copy(sunColor)
      this.#sun.intensity = lightIntensity
      this.#sun.position.set(...sunDir).multiplyScalar(300)
    }
    if (this.#hemiLight) {
      this.#hemiLight.color.copy(hemiSkyColor)
      this.#hemiLight.groundColor.copy(hemiGroundColor)
    }

    // Position Moon 3D Mesh in exact opposite celestial coordinates (180° opposite)
    const moonAngle = angle + Math.PI
    const moonX = -Math.cos(moonAngle) * 0.75
    const moonY = Math.sin(moonAngle)
    const moonZ = -0.45
    const moonDir = new THREE.Vector3(moonX, moonY, moonZ).normalize()

    if (this.#realisticMoon) {
      this.#realisticMoon.group.position.copy(moonDir).multiplyScalar(this.#skyDomeRadius * 0.875)
      this.#realisticMoon.group.lookAt(0, 0, 0)
      this.#realisticMoon.group.visible = moonDir.y > -0.15
    } else if (this.#moonMesh) {
      this.#moonMesh.position.copy(moonDir).multiplyScalar(this.#skyDomeRadius * 0.875)
      this.#moonMesh.visible = moonDir.y > -0.15
    }
  }

  #updateMeteors(now: number, nightFactor: number): void {
    if (!this.#meteorMesh || !this.#meteorMat) return

    if (nightFactor < 0.2) {
      this.#meteorMat.opacity = 0
      this.#meteorActive = false
      return
    }

    if (!this.#meteorActive) {
      if (now > this.#nextMeteorTimer) {
        this.#meteorActive = true
        this.#meteorStartTime = now
        this.#nextMeteorTimer = now + 2500 + Math.random() * 4500

        // Eye-level / upper view plane
        const rx = (Math.random() - 0.5) * 2200
        const ry = 600 + Math.random() * 800
        const rz = -400 - Math.random() * 1800

        const dx = (Math.random() - 0.5) * 1600
        const dy = -300 - Math.random() * 300
        const dz = (Math.random() - 0.5) * 1600

        this.#meteorPos = {
          startX: rx,
          startY: ry,
          startZ: rz,
          endX: rx + dx,
          endY: ry + dy,
          endZ: rz + dz,
        }
      }
    } else {
      const duration = 650 // Fast, sleek shooting star streak (0.65 seconds)
      const elapsed = now - this.#meteorStartTime
      if (elapsed > duration) {
        this.#meteorActive = false
        this.#meteorMat.opacity = 0
      } else {
        const t = elapsed / duration
        const alpha = Math.sin(t * Math.PI) * nightFactor * 0.98
        this.#meteorMat.opacity = alpha

        const segments = 12
        const posAttr = this.#meteorMesh.geometry.attributes.position
        if (posAttr) {
          const positions = posAttr.array as Float32Array
          for (let i = 0; i < segments; i++) {
            const segT = Math.max(0, t - (i / segments) * 0.2)
            const px = THREE.MathUtils.lerp(this.#meteorPos.startX, this.#meteorPos.endX, segT)
            const py = THREE.MathUtils.lerp(this.#meteorPos.startY, this.#meteorPos.endY, segT)
            const pz = THREE.MathUtils.lerp(this.#meteorPos.startZ, this.#meteorPos.endZ, segT)

            const nextSegT = Math.max(0, t - ((i + 1) / segments) * 0.2)
            const nx = THREE.MathUtils.lerp(this.#meteorPos.startX, this.#meteorPos.endX, nextSegT)
            const ny = THREE.MathUtils.lerp(this.#meteorPos.startY, this.#meteorPos.endY, nextSegT)
            const nz = THREE.MathUtils.lerp(this.#meteorPos.startZ, this.#meteorPos.endZ, nextSegT)

            positions[i * 6] = px
            positions[i * 6 + 1] = py
            positions[i * 6 + 2] = pz
            positions[i * 6 + 3] = nx
            positions[i * 6 + 4] = ny
            positions[i * 6 + 5] = nz
          }
          posAttr.needsUpdate = true
        }
      }
    }
  }
}
