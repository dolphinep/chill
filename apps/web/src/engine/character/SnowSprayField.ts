import * as THREE from 'three/webgpu'

const MAX_PARTICLES = 1000
const PARTICLE_LIFETIME_S = 0.7
const PARTICLE_GEOMETRY = new THREE.DodecahedronGeometry(0.12, 0)
const PARTICLE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.9,
  metalness: 0,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
})

type Particle = {
  active: boolean
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  rotX: number
  rotY: number
  rotZ: number
  rotSpeedX: number
  rotSpeedY: number
  scale: number
  maxScale: number
  ageS: number
  maxAgeS: number
}

const DUMMY_MATRIX = new THREE.Matrix4()
const DUMMY_POSITION = new THREE.Vector3()
const DUMMY_QUATERNION = new THREE.Quaternion()
const DUMMY_EULER = new THREE.Euler()
const DUMMY_SCALE = new THREE.Vector3()

export class SnowSprayField {
  readonly group = new THREE.Group()
  #mesh: THREE.InstancedMesh
  #particles: Particle[] = []
  #head = 0
  #emitAccum = 0

  constructor(scene: THREE.Scene) {
    this.#mesh = new THREE.InstancedMesh(PARTICLE_GEOMETRY, PARTICLE_MATERIAL, MAX_PARTICLES)
    this.#mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // CRITICAL: Disable frustum culling so particles never disappear/flicker when camera rotates
    this.#mesh.frustumCulled = false
    this.#mesh.castShadow = false
    this.#mesh.receiveShadow = false

    // Initialize all instances off-screen / zero scale
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.#particles.push({
        active: false,
        x: 0,
        y: -1000,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        rotSpeedX: 0,
        rotSpeedY: 0,
        scale: 0,
        maxScale: 1,
        ageS: 0,
        maxAgeS: PARTICLE_LIFETIME_S,
      })
      DUMMY_MATRIX.makeScale(0, 0, 0)
      this.#mesh.setMatrixAt(i, DUMMY_MATRIX)
    }

    this.#mesh.instanceMatrix.needsUpdate = true
    this.group.add(this.#mesh)
    scene.add(this.group)
  }

  /**
   * Emit directly behind the left & right ski boards whenever movement is detected.
   * Continuous, steady powder spray without choppy gaps.
   */
  emitFromSkis(
    leftX: number,
    leftY: number,
    leftZ: number,
    rightX: number,
    rightY: number,
    rightZ: number,
    moveDeltaX: number,
    moveDeltaZ: number,
    speed: number,
    dt: number,
  ): void {
    if (speed < 0.15) return

    this.#emitAccum += dt
    const isBoosted = speed > 4.5
    const emitInterval = isBoosted ? 0.012 : 0.018
    if (this.#emitAccum < emitInterval) return
    this.#emitAccum = 0

    // Backward direction derived from movement delta, fallback to current velocity
    let backX = -moveDeltaX
    let backZ = -moveDeltaZ
    const backLen = Math.hypot(backX, backZ)
    if (backLen > 1e-4) {
      backX /= backLen
      backZ /= backLen
    } else {
      backX = 0
      backZ = -1
    }

    const rightDirX = -backZ
    const rightDirZ = backX

    const skis = [
      { x: leftX, y: leftY, z: leftZ, outward: -0.35 },
      { x: rightX, y: rightY, z: rightZ, outward: 0.35 },
    ]

    const burstsPerSki = isBoosted ? 3 : 2

    for (const ski of skis) {
      for (let b = 0; b < burstsPerSki; b++) {
        const jitterBack = 0.04 + Math.random() * 0.1
        const jitterSide = (Math.random() - 0.5) * 0.06
        const spawnX = ski.x + backX * jitterBack + rightDirX * jitterSide
        const spawnY = ski.y + 0.02 + Math.random() * 0.04
        const spawnZ = ski.z + backZ * jitterBack + rightDirZ * jitterSide

        const sprayPower = Math.max(speed * 0.35, 0.9)
        const vx = backX * sprayPower + rightDirX * (ski.outward + (Math.random() - 0.5) * 0.4)
        const vy = 0.5 + Math.random() * 0.9 + speed * 0.12
        const vz = backZ * sprayPower + rightDirZ * (ski.outward + (Math.random() - 0.5) * 0.4)

        const scaleMultiplier = isBoosted ? 1.8 + Math.random() * 0.6 : Math.max(speed / 2.5, 1.0)
        this.#spawnParticle(spawnX, spawnY, spawnZ, vx, vy, vz, scaleMultiplier)
      }
    }
  }

  /** Legacy emit support */
  emit(
    x: number,
    y: number,
    z: number,
    yaw: number,
    speed: number,
    _yawRate: number,
    dt: number,
  ): void {
    const sinY = Math.sin(yaw)
    const cosY = Math.cos(yaw)
    const forwardX = sinY
    const forwardZ = cosY
    const rightX = cosY
    const rightZ = -sinY

    const leftX = x - rightX * 0.12
    const leftY = y
    const leftZ = z - rightZ * 0.12

    const rightSkiX = x + rightX * 0.12
    const rightSkiY = y
    const rightSkiZ = z + rightZ * 0.12

    this.emitFromSkis(
      leftX,
      leftY,
      leftZ,
      rightSkiX,
      rightSkiY,
      rightSkiZ,
      forwardX * speed * dt,
      forwardZ * speed * dt,
      speed,
      dt,
    )
  }

  #spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    scaleMultiplier: number,
  ): void {
    // Ring buffer cursor: continuously cycles through all slots endlessly
    const slot = this.#head
    this.#head = (this.#head + 1) % MAX_PARTICLES

    const p = this.#particles[slot]!
    p.active = true
    p.x = x
    p.y = y
    p.z = z
    p.vx = vx
    p.vy = vy
    p.vz = vz
    p.rotX = Math.random() * Math.PI * 2
    p.rotY = Math.random() * Math.PI * 2
    p.rotZ = Math.random() * Math.PI * 2
    p.rotSpeedX = (Math.random() - 0.5) * 5
    p.rotSpeedY = (Math.random() - 0.5) * 5
    p.ageS = 0
    p.maxAgeS = PARTICLE_LIFETIME_S * (0.85 + Math.random() * 0.35)
    p.maxScale = (0.7 + Math.random() * 0.7) * scaleMultiplier
    p.scale = 0.25
  }

  update(dt: number): void {
    let hasActive = false

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.#particles[i]!
      if (!p.active) continue

      p.ageS += dt
      if (p.ageS >= p.maxAgeS) {
        p.active = false
        DUMMY_MATRIX.makeScale(0, 0, 0)
        this.#mesh.setMatrixAt(i, DUMMY_MATRIX)
        continue
      }

      // Physics: gentle drag + soft gravity + rotation
      p.vx *= Math.exp(-dt * 2.2)
      p.vz *= Math.exp(-dt * 2.2)
      p.vy -= 2.6 * dt

      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt

      p.rotX += p.rotSpeedX * dt
      p.rotY += p.rotSpeedY * dt

      // Growth then gentle shrink
      const progress = p.ageS / p.maxAgeS
      const scaleCurve =
        progress < 0.22
          ? (progress / 0.22) * p.maxScale
          : Math.max(0, 1 - (progress - 0.22) / 0.78) * p.maxScale

      DUMMY_POSITION.set(p.x, p.y, p.z)
      DUMMY_EULER.set(p.rotX, p.rotY, p.rotZ)
      DUMMY_QUATERNION.setFromEuler(DUMMY_EULER)
      DUMMY_SCALE.set(scaleCurve, scaleCurve, scaleCurve)
      DUMMY_MATRIX.compose(DUMMY_POSITION, DUMMY_QUATERNION, DUMMY_SCALE)
      this.#mesh.setMatrixAt(i, DUMMY_MATRIX)
      hasActive = true
    }

    if (hasActive || this.#mesh.instanceMatrix.needsUpdate) {
      this.#mesh.instanceMatrix.needsUpdate = true
    }
  }

  dispose(): void {
    this.group.remove(this.#mesh)
    PARTICLE_GEOMETRY.dispose()
    PARTICLE_MATERIAL.dispose()
    this.#mesh.dispose()
  }
}
