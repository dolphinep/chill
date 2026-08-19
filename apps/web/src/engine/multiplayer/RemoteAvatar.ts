import * as THREE from 'three/webgpu'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import { sampleHeight } from '@/engine/terrain/HeightFieldCpu'
import { ChibiAvatarMesh } from '@/engine/character/ChibiAvatarMesh'
import { ChibiAnimator } from '@/engine/character/ChibiAnimator'
import { FootfallTracker } from '@/engine/character/FootfallTracker'
import { SkiTrackTracker } from '@/engine/character/SkiTrackTracker'
import { createStandingFigure, STANDING_EYE_HEIGHT } from '@/engine/character/StandingFigure'
import { SEATED_EYE_HEIGHT } from '@/engine/character/SeatedFigure'
import { NameTag } from '@/engine/character/NameTag'
import { createSkiPair, attachSkis, type SkiPair } from '@/engine/character/SkiRig'
import type { ChibiAvatarConfig } from '@/lib/avatar/avatarConfig'
import type { AnimState } from '@chill/protocol'

/**
 * One LAN peer's avatar — driven by network snapshots instead of
 * `CharacterController`/`InputMap`. Two render tiers, chosen by `Engine.ts` (nearest
 * `TIER_SETTINGS[tier].maxFullAvatars` peers to the camera, re-ranked periodically):
 *
 * - `'full'`: `ChibiAvatarMesh` + `ChibiAnimator` + `FootfallTracker`, ~16 draw calls,
 *   fully customized, animated, and leaves footprints — same as before this cap
 *   existed.
 * - `'cheap'`: `StandingFigure`'s existing merged placeholder geometry (previously
 *   dead code — built for `CharacterController` before `ChibiAvatarMesh` replaced it,
 *   never removed), tinted with the peer's `outfitColor`. One draw call, no
 *   animation, no footprints, no shadow-casting. A full 20-person party would blow
 *   the draw-call budget without this tier existing — see `QualityTier.ts`'s
 *   `maxFullAvatars` doc comment.
 *
 * All three per-character state machines (`ChibiAnimator`/`FootfallTracker`/the mesh
 * itself) can't be shared with the local player's own instances
 * (`Engine.ts`'s `#chibiAvatar`/`#chibiAnimator`), and don't exist at all in `'cheap'`
 * mode — there's nothing to animate on a static placeholder.
 *
 * `y` is never networked — computed locally every frame via `sampleHeight`, exactly
 * like `CharacterController.y` — so a peer always stands on whatever terrain the
 * *local viewer* renders, even for the one frame right after a scenery switch where a
 * stale `y` would otherwise show them floating or buried.
 *
 * Target/current split follows the same damping idiom `CameraRig` and
 * `CharacterController` already use (`1 - exp(-dt/tau)`, shortest-angle yaw wrap) —
 * not a buffered snapshot-interpolation scheme. A little lag reads as "someone else
 * walking," not as network jitter, which is all a relaxation app needs here.
 */

export type RemoteAvatarDetail = 'full' | 'cheap'

const POSITION_DAMPING_S = 0.15
const YAW_DAMPING_S = 0.12
/** Below this much time since the last snapshot, just damp toward the last known
 * target — above it, dead-reckon the target forward from the last velocity estimate,
 * capped so a genuinely stalled peer freezes instead of sliding indefinitely. */
const EXTRAPOLATE_AFTER_S = 0.15
const FREEZE_AFTER_S = 0.3
const CHEAP_FALLBACK_COLOR = '#8a8a8a'
/** Gap above the head the name tag floats at, added to whichever eye-height constant
 * matches the peer's current pose — reusing `STANDING_EYE_HEIGHT`/`SEATED_EYE_HEIGHT`
 * (rather than a fresh guessed height) keeps the tag consistent with camera framing
 * that already uses those same constants elsewhere in `Engine.ts`. */
const NAMETAG_HEAD_CLEARANCE_M = 0.22
const NAMETAG_STAND_HEIGHT_M = STANDING_EYE_HEIGHT + NAMETAG_HEAD_CLEARANCE_M
const NAMETAG_SIT_HEIGHT_M = SEATED_EYE_HEIGHT + NAMETAG_HEAD_CLEARANCE_M

export class RemoteAvatar {
  readonly group: THREE.Group
  readonly detail: RemoteAvatarDetail
  /** Smoothed, rendered position — also what a remote thought's lantern anchors to. */
  x: number
  y: number
  z: number

  #fullMesh: ChibiAvatarMesh | null = null
  #animator: ChibiAnimator | null = null
  #footfalls: FootfallTracker | null = null
  #skiTracks: SkiTrackTracker | null = null
  #cheapGeometry: THREE.BufferGeometry | null = null
  #cheapMaterial: THREE.MeshStandardMaterial | null = null
  #nameTag: NameTag
  #skis: SkiPair | null = null

  #targetX: number
  #targetY: number
  #targetZ: number
  #targetYaw: number
  #targetAnim: AnimState = 'idle'
  #velocityX = 0
  #velocityY = 0
  #velocityZ = 0
  #timeSinceSnapshot = 0
  #hasTarget = false

  #yaw: number

  constructor(
    avatarConfig: ChibiAvatarConfig,
    initial: { x: number; y?: number; z: number; yaw: number },
    detail: RemoteAvatarDetail = 'full',
    name = 'Friend',
    skiMode = false,
  ) {
    this.detail = detail
    this.x = initial.x
    this.y = initial.y ?? 0
    this.z = initial.z
    this.#yaw = initial.yaw
    this.#targetX = initial.x
    this.#targetY = initial.y ?? 0
    this.#targetZ = initial.z
    this.#targetYaw = initial.yaw

    if (detail === 'full') {
      this.#fullMesh = new ChibiAvatarMesh(avatarConfig)
      this.#animator = new ChibiAnimator()
      this.#footfalls = new FootfallTracker()
      this.#skiTracks = new SkiTrackTracker()
      this.group = this.#fullMesh.group
      if (skiMode) {
        this.#skis = createSkiPair()
        attachSkis(this.#fullMesh.rig, this.#skis)
      }
    } else {
      this.#cheapGeometry = createStandingFigure()
      this.#cheapMaterial = new THREE.MeshStandardMaterial({
        color: avatarConfig.outfitColor || CHEAP_FALLBACK_COLOR,
        roughness: 0.85,
      })
      const mesh = new THREE.Mesh(this.#cheapGeometry, this.#cheapMaterial)
      // Distance-culled/capped-out avatars skip shadows immediately — nobody is
      // scrutinizing a peer far enough away to have been demoted to this tier.
      mesh.castShadow = false
      mesh.receiveShadow = false
      this.group = new THREE.Group()
      this.group.add(mesh)
    }
    this.group.position.set(initial.x, initial.y ?? 0, initial.z)
    this.group.rotation.y = initial.yaw

    // A pure vertical local offset (0, h, 0) is unaffected by `group.rotation.y`, so
    // adding it directly as a child of `group` (rather than a sibling tracked
    // separately) is enough to keep it centred above the head through any yaw turn.
    this.#nameTag = new NameTag(name)
    this.#nameTag.sprite.position.set(0, NAMETAG_STAND_HEIGHT_M, 0)
    this.group.add(this.#nameTag.sprite)
  }

  /** Called when a peer's roster entry renames them (an `'update'` roster event with
   * an unchanged `avatarConfig` still carries whatever their name currently is). */
  setName(name: string): void {
    this.#nameTag.setName(name)
  }

  updateConfig(config: Partial<ChibiAvatarConfig>): void {
    if (this.#fullMesh) {
      this.#fullMesh.updateConfig(config)
      // `updateConfig` may have fully rebuilt the rig (new leg pivots) — re-parenting
      // the same two ski meshes is a harmless no-op otherwise.
      if (this.#skis) attachSkis(this.#fullMesh.rig, this.#skis)
    } else if (this.#cheapMaterial && config.outfitColor) {
      this.#cheapMaterial.color.set(config.outfitColor)
    }
  }

  /** Plays the throw arm-swing on a peer who just threw something over the network —
   * a no-op in `'cheap'` mode, which has no `ChibiAnimator` to trigger. Losing the
   * gesture on a demoted-to-cheap/far-away peer is an acceptable tradeoff for the
   * same reason `'cheap'` skips footprints: nobody's scrutinizing them that closely
   * from that far away anyway. */
  triggerThrow(): void {
    this.#animator?.triggerThrow()
  }

  /** Smoothed, rendered facing — the minimap/teleport-to-peer feature reads this to
   * place the local player beside where a peer is actually facing, same as the
   * initial `spawnNearPeer` placement does at join time. */
  get yaw(): number {
    return this.#yaw
  }

  get speed(): number {
    return Math.hypot(this.#velocityX, this.#velocityZ)
  }

  /** Called whenever a new network snapshot names this peer. Never touches rendered
   * state directly — `update()` damps toward whatever this last set. */
  setTarget(x: number, y: number, z: number, yaw: number, anim: AnimState): void {
    if (!this.#hasTarget) {
      this.x = x
      this.y = y
      this.z = z
      this.#yaw = yaw
      this.#targetX = x
      this.#targetY = y
      this.#targetZ = z
      this.#targetYaw = yaw
      this.#targetAnim = anim
      this.#hasTarget = true
      this.#timeSinceSnapshot = 0
      this.group.position.set(x, y, z)
      this.group.rotation.y = yaw
      this.#footfalls?.reset()
      this.#skiTracks?.reset()
      return
    }
    const dt = Math.max(this.#timeSinceSnapshot, 1e-3)
    this.#velocityX = (x - this.#targetX) / dt
    this.#velocityY = (y - this.#targetY) / dt
    this.#velocityZ = (z - this.#targetZ) / dt
    this.#targetX = x
    this.#targetY = y
    this.#targetZ = z
    this.#targetYaw = yaw
    this.#targetAnim = anim
    this.#timeSinceSnapshot = 0
  }

  /** Advances smoothing/animation every render frame regardless of network tick rate.
   * Returns zero or more footprint stamps — a single walking footfall, both ski-track
   * grooves, or nothing — so it composes with the existing "footprints is a list" call
   * site in `Engine.ts`'s `#frame()`; always empty in `'cheap'` mode, which has no
   * `FootfallTracker`/`SkiTrackTracker` to step. */
  update(
    dt: number,
    terrain: HeightSpec,
    wallTime: number,
    skiMode = false,
  ): { x: number; z: number; pressure: number }[] {
    this.#timeSinceSnapshot += dt

    let targetX = this.#targetX
    let targetY = this.#targetY
    let targetZ = this.#targetZ
    if (this.#timeSinceSnapshot > EXTRAPOLATE_AFTER_S) {
      const extrapolateS = Math.min(this.#timeSinceSnapshot, FREEZE_AFTER_S) - EXTRAPOLATE_AFTER_S
      targetX += this.#velocityX * extrapolateS
      targetY += this.#velocityY * extrapolateS
      targetZ += this.#velocityZ * extrapolateS
    }

    const posT = 1 - Math.exp(-dt / POSITION_DAMPING_S)
    const prevX = this.x
    const prevZ = this.z
    this.x += (targetX - this.x) * posT
    this.y += (targetY - this.y) * posT
    this.z += (targetZ - this.z) * posT

    const yawT = 1 - Math.exp(-dt / YAW_DAMPING_S)
    const yawDelta = Math.atan2(
      Math.sin(this.#targetYaw - this.#yaw),
      Math.cos(this.#targetYaw - this.#yaw),
    )
    const appliedYawDelta = yawDelta * yawT
    this.#yaw += appliedYawDelta
    const turnRate = dt > 0 ? appliedYawDelta / dt : 0

    const groundY = sampleHeight(terrain, this.x, this.z)
    const effectiveY = Math.max(groundY, this.y)
    this.group.position.set(this.x, effectiveY, this.z)
    this.group.rotation.y = this.#yaw

    this.#nameTag.sprite.position.y =
      this.#targetAnim === 'sit' ? NAMETAG_SIT_HEIGHT_M : NAMETAG_STAND_HEIGHT_M

    if (!this.#fullMesh || !this.#animator || !this.#footfalls || !this.#skiTracks) return []

    const distThisFrame = Math.hypot(this.x - prevX, this.z - prevZ)
    const speed = dt > 0 ? distThisFrame / dt : 0
    // Trust the network `anim` field only for 'sit' — idle-standing and idle-sitting
    // both read as ~0 velocity and aren't distinguishable from position alone; walk/run
    // are derived locally from smoothed velocity instead, the same signal
    // `ChibiAnimator` already keys off for the local player.
    const state: 'sit' | 'stand' = this.#targetAnim === 'sit' ? 'sit' : 'stand'
    const isSkiing = state === 'stand' && skiMode
    this.#animator.update(this.#fullMesh.rig, state, speed, dt, wallTime, true, isSkiing, turnRate)

    if (state !== 'stand') return []
    if (isSkiing) {
      return this.#skiTracks.step(this.x, this.z, this.#yaw, speed, distThisFrame)
    }
    const footfall = this.#footfalls.step(this.x, this.z, this.#yaw, speed, distThisFrame)
    return footfall ? [footfall] : []
  }

  dispose(): void {
    this.#fullMesh?.dispose()
    this.#cheapGeometry?.dispose()
    this.#cheapMaterial?.dispose()
    this.#skis?.dispose()
    this.#nameTag.dispose()
  }
}
