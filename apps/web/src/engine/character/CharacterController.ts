import * as THREE from 'three/webgpu'
import type { InputFrame } from '@/engine/input/InputMap'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import { sampleHeight } from '@/engine/terrain/HeightFieldCpu'
import { FIXED_STEP } from '@/engine/core/Clock'
import type { Collider } from '@/engine/terrain/Scatter'

/**
 * Kinematic capsule, grounded on `sampleHeight` every step — the same function the
 * terrain mesh displaces by, so the character always stands exactly on the surface it
 * appears to stand on, with no readback and no separate collision mesh.
 *
 * Prop collision (`#colliders`) is a flat circle-vs-circle push-out in the ground plane,
 * not a real capsule sweep — cheap, and enough to stop walking through a rock rather than
 * needing to look correct from every angle.
 */

const WALK_SPEED = 2.2
const RUN_MULTIPLIER = 2.4
const ACCEL_TIME = 0.12
/** Turn rate toward the movement direction — a tank-turn reads as broken, not relaxed. */
const TURN_TIME = 0.16
/** Roughly shoulder-width — matches `StandingFigure`'s silhouette, not a real capsule. */
const CHARACTER_RADIUS = 0.32

/**
 * Ski mode (Frostholm Ridge exclusive).
 * Simple, responsive gliding faster than normal walking, with Shift boost for high speed.
 */
const SKI_GLIDE_SPEED = 4.6
const SKI_BOOST_MULTIPLIER = 1.85 // 4.6 * 1.85 = ~8.5 m/s
const SKI_ACCEL_TIME = 0.16
const SKI_TURN_TIME = 0.2

export class CharacterController {
  x: number
  z: number
  y: number
  /** Facing, radians. Matches the `spawn.yaw` convention: 0 faces +Z. */
  yaw: number
  verticalVelocity = 0
  isGrounded = true

  #velocity = new THREE.Vector2()
  #desired = new THREE.Vector2()
  #colliders: Collider[] = []
  #yawRate = 0

  constructor(spec: HeightSpec, x: number, z: number, yaw: number) {
    this.x = x
    this.z = z
    this.yaw = yaw
    this.y = sampleHeight(spec, x, z)
  }

  /** Static obstacles (rocks, palms) to push out of. Scatter is placed once at scene
   * build and never moves, so this is set once too, not re-collected per step. */
  setColliders(colliders: Collider[]): void {
    this.#colliders = colliders
  }

  /**
   * Advance the character by `FIXED_STEP` (1/60s).
   *
   * Input arrives in camera-relative coordinates; this transforms it onto the terrain
   * plane using `cameraYaw`, integrates velocity, and clamps to ground height.
   */
  step(
    spec: HeightSpec,
    input: InputFrame,
    cameraYaw: number,
    skiMode = false,
  ): void {
    const sinY = Math.sin(cameraYaw)
    const cosY = Math.cos(cameraYaw)
    const forwardX = -sinY
    const forwardZ = -cosY
    const rightX = cosY
    const rightZ = -sinY

    this.#desired.set(0, 0)
    this.#desired.x += forwardX * -input.moveZ + rightX * input.moveX
    this.#desired.y += forwardZ * -input.moveZ + rightZ * input.moveX
    if (this.#desired.lengthSq() > 0) this.#desired.normalize()

    const baseSpeed = skiMode ? SKI_GLIDE_SPEED : WALK_SPEED
    const boostMultiplier = skiMode ? SKI_BOOST_MULTIPLIER : RUN_MULTIPLIER
    const speed = baseSpeed * (input.run ? boostMultiplier : 1)
    this.#desired.multiplyScalar(speed)

    const accelTime = skiMode ? SKI_ACCEL_TIME : ACCEL_TIME
    const t = 1 - Math.exp(-FIXED_STEP / accelTime)
    this.#velocity.lerp(this.#desired, t)

    this.x += this.#velocity.x * FIXED_STEP
    this.z += this.#velocity.y * FIXED_STEP
    this.#resolveCollisions()

    const groundY = sampleHeight(spec, this.x, this.z)

    // Jump trigger
    if (input.jump && this.isGrounded) {
      this.verticalVelocity = skiMode ? 6.2 : 5.4
      this.isGrounded = false
    }

    // Apply vertical gravity & velocity
    this.verticalVelocity -= 14.0 * FIXED_STEP
    this.y += this.verticalVelocity * FIXED_STEP

    if (this.y <= groundY) {
      this.y = groundY
      this.verticalVelocity = 0
      this.isGrounded = true
    } else {
      this.isGrounded = false
    }

    if (this.#velocity.lengthSq() > 0.04) {
      const targetYaw = Math.atan2(this.#velocity.x, this.#velocity.y)
      // Shortest angular distance — without this, crossing the -PI/PI seam spins the
      // figure the long way round instead of snapping straight to facing.
      let delta = targetYaw - this.yaw
      delta = Math.atan2(Math.sin(delta), Math.cos(delta))
      const turnT = 1 - Math.exp(-FIXED_STEP / (skiMode ? SKI_TURN_TIME : TURN_TIME))
      const yawDelta = delta * turnT
      this.yaw += yawDelta
      const currentRate = yawDelta / FIXED_STEP
      this.#yawRate = this.#yawRate * 0.7 + currentRate * 0.3
    } else {
      this.#yawRate = 0
    }
  }

  get speed(): number {
    return this.#velocity.length()
  }

  /** Per-step yaw change rate (rad/s) from the last `step()` call — the ski pose
   * reads this to bank into turns; zero when not turning. */
  get yawRate(): number {
    return this.#yawRate
  }

  /** An instant reposition (teleport-to-friend), not movement — resets velocity too,
   * so the character doesn't keep drifting in whatever direction it was walking right
   * before the jump. */
  teleportTo(spec: HeightSpec, x: number, z: number, yaw: number): void {
    this.x = x
    this.z = z
    this.yaw = yaw
    this.y = sampleHeight(spec, x, z)
    this.#velocity.set(0, 0)
    this.#yawRate = 0
  }

  /**
   * Push out of any overlapping collider. Brute-force over every rock/palm — a few
   * hundred circle checks is nothing at 60Hz, and Kamakura Bay's scatter is small enough
   * that a spatial grid would be solving a problem that does not exist yet.
   */
  #resolveCollisions(): void {
    for (const c of this.#colliders) {
      const dx = this.x - c.x
      const dz = this.z - c.z
      const minDist = CHARACTER_RADIUS + c.radius
      const distSq = dx * dx + dz * dz
      if (distSq >= minDist * minDist || distSq < 1e-8) continue
      const dist = Math.sqrt(distSq)
      const push = (minDist - dist) / dist
      this.x += dx * push
      this.z += dz * push
    }
  }
}
