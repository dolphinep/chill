import * as THREE from 'three/webgpu'
import type { Thought } from '@/types/models/thought'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import { sampleHeight } from '@/engine/terrain/HeightFieldCpu'
import { WIND_DIR } from '@/engine/tsl/foliage/wind'

/**
 * "A message in a bottle, not a tweet" (plan, Thoughts). Local-only in v0.1 — one author,
 * no server, no daily quota (quota is explicitly a multi-user thing: "solo rooms have no
 * quota, there is nobody to spam"). Still builds the calm limiter and the 12-bloom/
 * 1-per-author caps for real, even though a single local author will rarely brush up
 * against them — the point of this slice is exercising the whole pipeline before the
 * backend exists, not shipping a stub that gets rewritten.
 *
 * "Never more than one bloomed thought per author" reads, for the *solo* case, as the
 * plan's own framing of local thoughts: "you post; your own lantern drifts away and
 * dissolves" — singular, sequential. A second post while the first is still live queues
 * rather than displacing it or appearing beside it.
 */

const LOCAL_AUTHOR_ID = 'local'
const DECAY_S = 90
const RISE_S = 3
const FADE_OUT_S = 10
const RISE_HEIGHT_M = 1.6
const DRIFT_SPEED_MPS = 0.12
const BLOOM_GAP_S = 2.5
const MAX_BLOOMED = 12
/** Occluded thoughts dim, not hide — a lantern behind a dune should still read as
 * "still there," the same reasoning the plan gives for occlusion generally. */
const OCCLUDED_OPACITY = 0.25
const OCCLUSION_SAMPLES = 5
const NEAR_TIER_M = 15
const FAR_TIER_M = 40
const TRUNCATED_GRAPHEMES = 60

type LanternTier = 'full' | 'truncated' | 'mote'

export type LanternProjection = {
  id: string
  text: string
  tier: LanternTier
  /** Viewport pixels, origin top-left — ready to drop straight into a CSS `left`/`top`. */
  screenX: number
  screenY: number
  opacity: number
  distanceM: number
}

export type LiveThoughtSummary = {
  id: string
  text: string
  opacity: number
  /** 0 at the moment it blooms, 1 the instant it's removed — a stable per-thought value
   * Still mode's CSS-only renderer uses to seed a screen position, so a given lantern
   * doesn't jump around between polls the way a fresh random number would. */
  ageFraction: number
}

type LiveThought = Thought & {
  x: number
  z: number
  bornAt: number
}

export class ThoughtField {
  #live: LiveThought[] = []
  #pending: (Thought & { x: number; z: number })[] = []
  #clock = 0
  #lastBloomAt = -Infinity
  #nextId = 0

  /** `x`/`z` is the author's position at the moment of posting — where the lantern
   * emerges, per the plan ("emerges near its author"). `authorId` defaults to the
   * local player; a LAN session's remote thoughts (already accepted by the relay, so
   * no re-validation needed here) pass the sender's own sid instead, generalizing the
   * one-bloom-per-author limiter below to apply per friend, not just to solo. `id` is
   * caller-supplied for a remote thought (the relay's own id, so de-dupe against
   * retransmits is possible) and generated locally otherwise. */
  post(text: string, x: number, z: number, authorId: string = LOCAL_AUTHOR_ID, id?: string): void {
    // Retransmit guard — only meaningful when `id` is caller-supplied (a remote
    // thought); locally-generated ids are always fresh.
    if (id && (this.#pending.some((t) => t.id === id) || this.#live.some((t) => t.id === id))) return
    const thought: Thought & { x: number; z: number } = {
      id: id ?? `local-${this.#nextId++}`,
      authorId,
      text,
      x,
      z,
    }
    this.#pending.push(thought)
  }

  /** Advance drift/rise/decay and promote queued posts once the calm limiter and the
   * one-bloom-per-author rule both allow it. `dt` in seconds. */
  update(dt: number): void {
    this.#clock += dt

    this.#live = this.#live.filter((t) => this.#clock - t.bornAt < DECAY_S)
    for (const t of this.#live) {
      t.x += WIND_DIR.x * DRIFT_SPEED_MPS * dt
      t.z += WIND_DIR.z * DRIFT_SPEED_MPS * dt
    }

    if (this.#pending.length === 0) return
    // Checked against the FRONT of the queue's own author, not a hardcoded id — this
    // is what generalizes "one bloom per author" from solo to a LAN session's several
    // authors. Known limitation, accepted rather than engineered around: if the front
    // item's author already has a live bloom, nothing promotes this tick even if a
    // later, different-author item could — head-of-line blocking, harmless at the
    // scale (a handful of friends) and cadence (a thought every so often) this is
    // built for.
    const authorAlreadyBloomed = this.#live.some((t) => t.authorId === this.#pending[0]!.authorId)
    const calmLimiterReady = this.#clock - this.#lastBloomAt >= BLOOM_GAP_S
    if (authorAlreadyBloomed || !calmLimiterReady) return

    if (this.#live.length >= MAX_BLOOMED) {
      // Snowfall, not a queue overflow error: the oldest bloom makes room by fading
      // early rather than the new post being silently dropped.
      this.#live.sort((a, b) => a.bornAt - b.bornAt)
      this.#live.shift()
    }

    const next = this.#pending.shift()!
    this.#live.push({ ...next, bornAt: this.#clock })
    this.#lastBloomAt = this.#clock
  }

  /** Screen-space projection for the HTML overlay layer — called from React's own
   * per-frame loop, not pushed via `EngineEventBus` (that channel is "a few times a
   * second, never per frame" by design; a drifting lantern needs smoother updates than
   * that). Pure read: computing this never mutates field state. */
  project(
    camera: THREE.Camera,
    viewportWidth: number,
    viewportHeight: number,
    terrainSpec: HeightSpec,
  ): LanternProjection[] {
    const out: LanternProjection[] = []
    const v = new THREE.Vector3()
    const camPos = camera.position

    for (const t of this.#live) {
      const age = this.#clock - t.bornAt
      const y = terrainSpawnHeight(terrainSpec, t.x, t.z) + riseOffset(age)

      v.set(t.x, y, t.z).project(camera)
      if (v.z > 1 || v.z < -1) continue // behind the camera or beyond the far plane

      const screenX = ((v.x + 1) / 2) * viewportWidth
      const screenY = ((1 - v.y) / 2) * viewportHeight
      if (screenX < -100 || screenX > viewportWidth + 100) continue
      if (screenY < -100 || screenY > viewportHeight + 100) continue

      const distanceM = camPos.distanceTo(new THREE.Vector3(t.x, y, t.z))
      const tier: LanternTier = distanceM < NEAR_TIER_M ? 'full' : distanceM < FAR_TIER_M ? 'truncated' : 'mote'

      const occluded = isOccluded(terrainSpec, camPos.x, camPos.y, camPos.z, t.x, y, t.z)
      const opacity = fadeOpacity(age) * (occluded ? OCCLUDED_OPACITY : 1)

      out.push({
        id: t.id,
        text: tier === 'truncated' ? truncateForTier(t.text) : t.text,
        tier,
        screenX,
        screenY,
        opacity,
        distanceM,
      })
    }
    return out
  }

  /** Camera-free listing for Still mode's CSS-only lantern renderer — there's no 3D
   * scene to project through there, just the same decay/drift/calm-limiter state. */
  listLive(): LiveThoughtSummary[] {
    return this.#live.map((t) => {
      const age = this.#clock - t.bornAt
      return {
        id: t.id,
        text: t.text,
        opacity: fadeOpacity(age),
        ageFraction: Math.min(age / DECAY_S, 1),
      }
    })
  }

  /** How long until the author could post again and have it bloom immediately, for the
   * composer's refilling-hairline cooldown display — 0 once nothing would block it. */
  authorCooldownS(): number {
    const bloomGate = Math.max(0, BLOOM_GAP_S - (this.#clock - this.#lastBloomAt))
    const authorLive = this.#live.find((t) => t.authorId === LOCAL_AUTHOR_ID)
    const decayGate = authorLive ? DECAY_S - (this.#clock - authorLive.bornAt) : 0
    const localPending = this.#pending.some((t) => t.authorId === LOCAL_AUTHOR_ID)
    return Math.max(bloomGate, decayGate, localPending ? 1 : 0)
  }
}

function fadeOpacity(ageS: number): number {
  const fadeIn = Math.min(ageS / RISE_S, 1)
  const fadeOut = Math.min((DECAY_S - ageS) / FADE_OUT_S, 1)
  return Math.max(0, Math.min(fadeIn, fadeOut))
}

function riseOffset(ageS: number): number {
  const t = Math.min(ageS / RISE_S, 1)
  // Ease-out — a lantern that rises at constant speed reads as mechanical.
  return RISE_HEIGHT_M * (1 - Math.pow(1 - t, 2))
}

function terrainSpawnHeight(spec: HeightSpec, x: number, z: number): number {
  return sampleHeight(spec, x, z) + 1.1 // roughly chest height, not flush with the sand
}

function truncateForTier(text: string): string {
  return text.length > TRUNCATED_GRAPHEMES ? `${text.slice(0, TRUNCATED_GRAPHEMES)}…` : text
}

/** Cheap analytic occlusion, consistent with how every other height query in this engine
 * works (a pure function, no readback): sample the terrain along the camera→lantern line
 * and check whether the line ever dips below ground before reaching the lantern. Real
 * geometry (rocks, palms) isn't tested — dunes are what actually block a sightline here,
 * and the plan only asks for "dim," not a physically exact test. */
function isOccluded(
  spec: HeightSpec,
  camX: number,
  camY: number,
  camZ: number,
  x: number,
  y: number,
  z: number,
): boolean {
  for (let i = 1; i < OCCLUSION_SAMPLES; i++) {
    const t = i / OCCLUSION_SAMPLES
    const sx = camX + (x - camX) * t
    const sz = camZ + (z - camZ) * t
    const lineY = camY + (y - camY) * t
    if (lineY < sampleHeight(spec, sx, sz) - 0.1) return true
  }
  return false
}
