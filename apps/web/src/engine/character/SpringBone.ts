import * as THREE from 'three/webgpu'

export interface SpringBoneOptions {
  stiffness?: number // Spring return force (e.g. 120 - 240)
  damping?: number   // Resistance / settling (e.g. 10 - 20)
  maxAngle?: number  // Maximum angular deflection in radians (e.g. 0.6)
  gravity?: number   // Downward sag force
}

/**
 * A lightweight, stable rotational spring-damper joint for secondary character physics
 * (Hair ponytails, loose strands, scarf tails, wings, and animal ears).
 */
export class SpringBone {
  readonly object: THREE.Object3D

  #stiffness: number
  #damping: number
  #maxAngle: number
  #gravity: number

  #currentRot = new THREE.Vector3()
  #velocity = new THREE.Vector3()
  #targetRot = new THREE.Vector3()

  constructor(object: THREE.Object3D, options: SpringBoneOptions = {}) {
    this.object = object
    this.#stiffness = options.stiffness ?? 160.0
    this.#damping = options.damping ?? 14.0
    this.#maxAngle = options.maxAngle ?? 0.75
    this.#gravity = options.gravity ?? 0.0

    this.#targetRot.copy(object.rotation as unknown as THREE.Vector3)
    this.#currentRot.copy(this.#targetRot)
  }

  setTargetRotation(rx: number, ry: number, rz: number): void {
    this.#targetRot.set(rx, ry, rz)
  }

  /**
   * Update spring physics given delta time and inertial forces (character movement / acceleration / wind)
   */
  update(
    dt: number,
    externalForce: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  ): void {
    // Clamp dt to avoid instability on frame spikes
    const safeDt = Math.min(dt, 0.05)

    // Spring displacement = current - (target + external)
    const dispX = this.#currentRot.x - (this.#targetRot.x + externalForce.x)
    const dispY = this.#currentRot.y - (this.#targetRot.y + externalForce.y)
    const dispZ = this.#currentRot.z - (this.#targetRot.z + externalForce.z)

    // Spring force = -k * x - c * v + gravity
    const forceX = -this.#stiffness * dispX - this.#damping * this.#velocity.x
    const forceY = -this.#stiffness * dispY - this.#damping * this.#velocity.y
    const forceZ = -this.#stiffness * dispZ - this.#damping * this.#velocity.z + this.#gravity

    // Integrate velocity and position
    this.#velocity.x += forceX * safeDt
    this.#velocity.y += forceY * safeDt
    this.#velocity.z += forceZ * safeDt

    this.#currentRot.x += this.#velocity.x * safeDt
    this.#currentRot.y += this.#velocity.y * safeDt
    this.#currentRot.z += this.#velocity.z * safeDt

    // Clamp maximum deflection
    this.#currentRot.x = THREE.MathUtils.clamp(
      this.#currentRot.x,
      this.#targetRot.x - this.#maxAngle,
      this.#targetRot.x + this.#maxAngle,
    )
    this.#currentRot.y = THREE.MathUtils.clamp(
      this.#currentRot.y,
      this.#targetRot.y - this.#maxAngle,
      this.#currentRot.y + this.#maxAngle,
    )
    this.#currentRot.z = THREE.MathUtils.clamp(
      this.#currentRot.z,
      this.#targetRot.z - this.#maxAngle,
      this.#targetRot.z + this.#maxAngle,
    )

    this.object.rotation.set(this.#currentRot.x, this.#currentRot.y, this.#currentRot.z)
  }

  reset(): void {
    this.#currentRot.copy(this.#targetRot)
    this.#velocity.set(0, 0, 0)
    this.object.rotation.set(this.#targetRot.x, this.#targetRot.y, this.#targetRot.z)
  }
}
