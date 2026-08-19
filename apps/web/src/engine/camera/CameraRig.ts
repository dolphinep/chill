import * as THREE from 'three/webgpu'
import type { InputFrame } from '@/engine/input/InputMap'
import { FIXED_STEP } from '@/engine/core/Clock'
import { DEFAULT_DAMPING, DEFAULT_FOV, MAX_DAMPING, MAX_FOV, MIN_FOV } from '@/lib/comfort/limits'

/**
 * The one spring-arm camera the plan calls for: first person is not a separate mode, it
 * is `armLength -> 0` on the same rig. Orbits a pivot (the character's eye point) at
 * `armLength` along the reverse of the view direction — the camera looks the way the
 * mouse points, it does not track-and-stare at the character, which is what every
 * third-person game actually does and what feels correct when the player is also
 * steering the look direction independently of movement.
 *
 * No camera-vs-terrain collision yet (the plan's `CameraCollision`) — on Kamakura Bay's
 * gentle dunes the arm rarely clips anything, and it is a separable addition later, not a
 * redesign of this rig.
 */

const LOOK_SENSITIVITY = 0.0022
const MAX_PITCH = Math.PI / 2 - 0.05
const MIN_PITCH = -Math.PI / 3
/** Exported so callers can retarget back to the standing 3rd-person distance, e.g. after
 * a state transition, without duplicating the tuned value. */
export const ARM_LENGTH_3P = 3.4
const ARM_LENGTH_1P = 0
const ARM_APPROACH_TIME = 0.22

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera

  /** The camera's actual (damped) orientation — what's on screen, and what movement is
   * relative to. Raw mouse input accumulates into `#targetYaw`/`#targetPitch` instead;
   * these chase that target at `#damping`'s rate. Undamped (`damping=0`) makes the two
   * identical every step, so this is a strict superset of the old instant-response rig. */
  yaw = 0
  pitch = -0.08
  firstPerson = false

  #targetYaw = 0
  #targetPitch = -0.08
  #damping = DEFAULT_DAMPING
  #armLength: number
  #targetArmLength: number
  #euler = new THREE.Euler(0, 0, 0, 'YXZ')
  #forward = new THREE.Vector3()
  #pivot = new THREE.Vector3()

  constructor(aspect: number, initialArmLength = ARM_LENGTH_3P) {
    this.camera = new THREE.PerspectiveCamera(DEFAULT_FOV, aspect, 0.4, 6000)
    this.#armLength = initialArmLength
    this.#targetArmLength = initialArmLength
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  setFov(fov: number): void {
    this.camera.fov = clamp(fov, MIN_FOV, MAX_FOV)
    this.camera.updateProjectionMatrix()
  }

  /** Time constant, seconds — 0 disables smoothing entirely (each step snaps straight to
   * the raw input target, the pre-comfort-settings behaviour). */
  setDamping(timeConstant: number): void {
    this.#damping = clamp(timeConstant, 0, MAX_DAMPING)
  }

  /** Snap yaw/pitch immediately — no smoothing, for scene entry or a mode switch. Snaps
   * BOTH the target and the damped value, or the rig would glide from the old orientation
   * toward this one over the next `#damping` seconds instead of landing on it now. */
  setOrientation(yaw: number, pitch: number): void {
    this.#targetYaw = yaw
    this.#targetPitch = clamp(pitch, MIN_PITCH, MAX_PITCH)
    this.yaw = this.#targetYaw
    this.pitch = this.#targetPitch
  }

  /** Smoothly glide yaw/pitch towards target orientation using camera damping */
  setTargetOrientation(yaw: number, pitch: number): void {
    this.#targetYaw = yaw
    this.#targetPitch = clamp(pitch, MIN_PITCH, MAX_PITCH)
  }

  /**
   * Retarget the arm length — the rig eases toward it over `ARM_APPROACH_TIME`, same as
   * the 1st/3rd-person toggle. Lets a caller give sitting and standing genuinely
   * different framing distances without either state needing to know about the other's.
   */
  setArmLength(length: number, immediate = false): void {
    this.#targetArmLength = length
    if (immediate) this.#armLength = length
  }

  toggleFirstPerson(): void {
    this.firstPerson = !this.firstPerson
    this.setArmLength(this.firstPerson ? ARM_LENGTH_1P : ARM_LENGTH_3P)
  }

  /** One fixed step. `pivotX/Y/Z` is the character's current eye position. */
  step(input: InputFrame, pivotX: number, pivotY: number, pivotZ: number): void {
    this.#targetYaw -= input.lookDX * LOOK_SENSITIVITY
    this.#targetPitch = clamp(this.#targetPitch - input.lookDY * LOOK_SENSITIVITY, MIN_PITCH, MAX_PITCH)

    if (this.#damping <= 0) {
      this.yaw = this.#targetYaw
      this.pitch = this.#targetPitch
    } else {
      const lookT = 1 - Math.exp(-FIXED_STEP / this.#damping)
      // Shortest angular distance — same reasoning as the character's turn-to-face: a
      // damped absolute lerp across the -PI/PI seam would spin the camera the long way
      // round instead of easing straight to the target.
      let delta = this.#targetYaw - this.yaw
      delta = Math.atan2(Math.sin(delta), Math.cos(delta))
      this.yaw += delta * lookT
      this.pitch += (this.#targetPitch - this.pitch) * lookT
    }

    const t = 1 - Math.exp(-FIXED_STEP / ARM_APPROACH_TIME)
    this.#armLength += (this.#targetArmLength - this.#armLength) * t

    this.#euler.set(this.pitch, this.yaw, 0, 'YXZ')
    this.camera.quaternion.setFromEuler(this.#euler)
    this.#forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion)

    this.#pivot.set(pivotX, pivotY, pivotZ)
    this.camera.position.copy(this.#pivot).addScaledVector(this.#forward, -this.#armLength)
    // A slight lift as the arm extends — a camera level with the eye at 3rd-person
    // distance stares at the back of the head; a little height sells "behind and above"
    // without needing a second tunable. It fades to zero with the arm, so 1st person
    // still sits exactly at the eye.
    this.camera.position.y += this.#armLength * 0.1
  }
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
