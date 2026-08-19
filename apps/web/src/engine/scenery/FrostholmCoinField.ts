import * as THREE from 'three/webgpu'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import { sampleHeight } from '@/engine/terrain/HeightFieldCpu'
import { coinStore } from '@/lib/coins/coinStore'

export const TARGET_FROSTHOLM_COINS = 30
export const TOTAL_FROSTHOLM_COINS = 450

interface CoinData {
  id: string
  x: number
  z: number
  baseY: number
  floatPhase: number
  rotSpeed: number
  collected: boolean
}

interface Sparkle {
  active: boolean
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  scale: number
  age: number
  maxAge: number
}

const SPARKLE_COUNT = 120
const DUMMY_MATRIX = new THREE.Matrix4()
const DUMMY_POS = new THREE.Vector3()
const DUMMY_QUAT = new THREE.Quaternion()
const DUMMY_SCALE = new THREE.Vector3()
const Y_AXIS = new THREE.Vector3(0, 1, 0)

export class FrostholmCoinField {
  readonly group = new THREE.Group()
  #coins: CoinData[] = []
  #coinMesh: THREE.InstancedMesh
  #beaconMesh: THREE.InstancedMesh
  #sparkleMesh: THREE.InstancedMesh
  #sparkles: Sparkle[] = []
  #audioCtx: AudioContext | null = null
  #scene: THREE.Scene
  #giftBox: {
    group: THREE.Group
    x: number
    y: number
    z: number
    targetY: number
    vy: number
    landed: boolean
  } | null = null

  constructor(
    scene: THREE.Scene,
    terrain: HeightSpec,
    spawn?: { x: number; y: number; z: number; yaw: number },
  ) {
    this.#scene = scene

    // 1. Generate 450 Alpine Coins ("ล้นๆ ทั่วทั้งภูเขา")
    const coinPositions: [number, number][] = []

    const spawnX = spawn?.x ?? 0
    const spawnZ = spawn?.z ?? 0
    const spawnYaw = spawn?.yaw ?? 0
    const forwardX = Math.sin(spawnYaw)
    const forwardZ = Math.cos(spawnYaw)
    const rightX = forwardZ
    const rightZ = -forwardX

    // Stream 1: Direct Main Center Golden Highway from Spawn (70 coins continuous)
    for (let i = 1; i <= 70; i++) {
      const dist = i * 4.2
      const weave = Math.sin(i * 0.7) * 3.5
      coinPositions.push([
        spawnX + forwardX * dist + rightX * weave,
        spawnZ + forwardZ * dist + rightZ * weave,
      ])
    }

    // Stream 2: Left Flank Slalom Stream from Spawn (60 coins)
    for (let i = 1; i <= 60; i++) {
      const dist = i * 4.5
      const weave = -5.5 + Math.sin(i * 0.8) * 3.0
      coinPositions.push([
        spawnX + forwardX * dist + rightX * weave,
        spawnZ + forwardZ * dist + rightZ * weave,
      ])
    }

    // Stream 3: Right Flank Slalom Stream from Spawn (60 coins)
    for (let i = 1; i <= 60; i++) {
      const dist = i * 4.5
      const weave = 5.5 + Math.cos(i * 0.8) * 3.0
      coinPositions.push([
        spawnX + forwardX * dist + rightX * weave,
        spawnZ + forwardZ * dist + rightZ * weave,
      ])
    }

    // Stream 4: Central Slalom Gates & Valley Descent (60 coins)
    for (let i = 0; i < 60; i++) {
      const z = -20 + i * 4.5
      const x = Math.sin(i * 0.5) * 18.0 + (i % 2 === 0 ? 3.5 : -3.5)
      coinPositions.push([x, z])
    }

    // Stream 5: West High Ridge & Half-Pipe Chute (50 coins)
    for (let i = 0; i < 50; i++) {
      const z = -15 + i * 5.0
      const x = -30 - Math.sin(i * 0.4) * 22.0
      coinPositions.push([x, z])
    }

    // Stream 6: East Alpine Leap Trail & Meadow (50 coins)
    for (let i = 0; i < 50; i++) {
      const z = -15 + i * 5.0
      const x = 30 + Math.cos(i * 0.4) * 22.0
      coinPositions.push([x, z])
    }

    // Stream 7: Summit Double Altitude Rings & Crests (50 coins)
    for (let i = 0; i < 25; i++) {
      const angle = (i / 25) * Math.PI * 2
      const rad = 24 + Math.sin(i * 2) * 6
      coinPositions.push([Math.cos(angle) * rad, -30 + Math.sin(angle) * rad])
    }
    for (let i = 0; i < 25; i++) {
      const angle = (i / 25) * Math.PI * 2
      const rad = 52 + Math.cos(i * 2) * 8
      coinPositions.push([Math.cos(angle) * rad, -20 + Math.sin(angle) * rad])
    }

    // Stream 8: Grand Valley Floor Ocean of Coins (50 coins)
    for (let i = 0; i < 50; i++) {
      const z = 140 + i * 2.4
      const x = Math.sin(i * 0.35) * 40.0
      coinPositions.push([x, z])
    }

    const collected = coinStore.getSnapshot().collectedIds

    // 2. Setup Instanced Meshes for Maximum Performance (Only 3 draw calls for all 450 coins!)
    const coinGeometry = new THREE.CylinderGeometry(0.52, 0.52, 0.11, 20)
    coinGeometry.rotateX(Math.PI / 2) // Orient coin vertically

    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xff9900,
      emissiveIntensity: 0.75,
      roughness: 0.2,
      metalness: 0.88,
    })

    this.#coinMesh = new THREE.InstancedMesh(coinGeometry, goldMaterial, TOTAL_FROSTHOLM_COINS)
    this.#coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.#coinMesh.frustumCulled = false
    this.group.add(this.#coinMesh)

    // Vertical Golden Beacon Light Beam
    const beamGeometry = new THREE.CylinderGeometry(0.06, 0.34, 3.6, 8, 1, true)
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe680,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    })

    this.#beaconMesh = new THREE.InstancedMesh(beamGeometry, beamMaterial, TOTAL_FROSTHOLM_COINS)
    this.#beaconMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.#beaconMesh.frustumCulled = false
    this.group.add(this.#beaconMesh)

    // Sparkle Particle Pool
    const sparkleGeo = new THREE.OctahedronGeometry(0.2, 0)
    const sparkleMat = new THREE.MeshBasicMaterial({
      color: 0xfff599,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })
    this.#sparkleMesh = new THREE.InstancedMesh(sparkleGeo, sparkleMat, SPARKLE_COUNT)
    this.#sparkleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.#sparkleMesh.frustumCulled = false
    this.group.add(this.#sparkleMesh)

    for (let i = 0; i < SPARKLE_COUNT; i++) {
      this.#sparkles.push({
        active: false,
        x: 0,
        y: -1000,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 0,
        age: 0,
        maxAge: 0.5,
      })
      DUMMY_MATRIX.makeScale(0, 0, 0)
      this.#sparkleMesh.setMatrixAt(i, DUMMY_MATRIX)
    }
    this.#sparkleMesh.instanceMatrix.needsUpdate = true

    // Initialize Coin Instances
    for (let i = 0; i < TOTAL_FROSTHOLM_COINS; i++) {
      const [x, z] = coinPositions[i] ?? [0, 0]
      const id = `coin_fh_${i + 1}`
      const baseY = sampleHeight(terrain, x, z)
      const isCollected = collected.includes(id)

      this.#coins.push({
        id,
        x,
        z,
        baseY,
        floatPhase: i * 0.25,
        rotSpeed: 2.5 + (i % 4) * 0.3,
        collected: isCollected,
      })

      if (isCollected) {
        DUMMY_MATRIX.makeScale(0, 0, 0)
        this.#coinMesh.setMatrixAt(i, DUMMY_MATRIX)
        this.#beaconMesh.setMatrixAt(i, DUMMY_MATRIX)
      } else {
        DUMMY_POS.set(x, baseY + 0.85, z)
        DUMMY_QUAT.setFromAxisAngle(Y_AXIS, 0)
        DUMMY_SCALE.set(1, 1, 1)
        DUMMY_MATRIX.compose(DUMMY_POS, DUMMY_QUAT, DUMMY_SCALE)
        this.#coinMesh.setMatrixAt(i, DUMMY_MATRIX)

        DUMMY_POS.set(x, baseY + 2.2, z)
        DUMMY_MATRIX.compose(DUMMY_POS, DUMMY_QUAT, DUMMY_SCALE)
        this.#beaconMesh.setMatrixAt(i, DUMMY_MATRIX)
      }
    }

    this.#coinMesh.instanceMatrix.needsUpdate = true
    this.#beaconMesh.instanceMatrix.needsUpdate = true
    scene.add(this.group)
  }

  get totalCoins(): number {
    return this.#coins.length
  }

  /** Advance coin spin, floating animation, player collection check & sparkle physics */
  update(time: number, dt: number, playerX: number, playerY: number, playerZ: number): void {
    let coinsNeedUpdate = false

    // 1. Update Coins & Collision
    for (let i = 0; i < this.#coins.length; i++) {
      const coin = this.#coins[i]!
      if (coin.collected) continue

      // Animate floating & spinning
      const floatY = coin.baseY + 0.85 + Math.sin(time * 3.2 + coin.floatPhase) * 0.16
      const rotAngle = time * coin.rotSpeed + coin.floatPhase

      DUMMY_POS.set(coin.x, floatY, coin.z)
      DUMMY_QUAT.setFromAxisAngle(Y_AXIS, rotAngle)
      DUMMY_SCALE.set(1, 1, 1)
      DUMMY_MATRIX.compose(DUMMY_POS, DUMMY_QUAT, DUMMY_SCALE)
      this.#coinMesh.setMatrixAt(i, DUMMY_MATRIX)

      // Beacon beam floats and pulses gently
      const beaconScale = 1.0 + Math.sin(time * 2.0 + coin.floatPhase) * 0.1
      DUMMY_POS.set(coin.x, floatY + 1.4, coin.z)
      DUMMY_SCALE.set(beaconScale, 1.0, beaconScale)
      DUMMY_MATRIX.compose(DUMMY_POS, DUMMY_QUAT, DUMMY_SCALE)
      this.#beaconMesh.setMatrixAt(i, DUMMY_MATRIX)
      coinsNeedUpdate = true

      // Generous distance check to player (radius ~ 2.8m for high speed skiing pickups)
      const dx = playerX - coin.x
      const dy = playerY - floatY
      const dz = playerZ - coin.z
      const distSq = dx * dx + dz * dz

      if (distSq < 2.8 * 2.8 && Math.abs(dy) < 3.8) {
        this.#collect(i, coin, floatY)
      }
    }

    if (coinsNeedUpdate) {
      this.#coinMesh.instanceMatrix.needsUpdate = true
      this.#beaconMesh.instanceMatrix.needsUpdate = true
    }

    // 2. Update Sparkle Particles
    let activeSparkles = 0
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const s = this.#sparkles[i]!
      if (!s.active) continue

      s.age += dt
      if (s.age >= s.maxAge) {
        s.active = false
        DUMMY_MATRIX.makeScale(0, 0, 0)
        this.#sparkleMesh.setMatrixAt(i, DUMMY_MATRIX)
        continue
      }

      s.x += s.vx * dt
      s.y += s.vy * dt
      s.z += s.vz * dt
      s.vy -= 3.8 * dt // Gravity

      const progress = s.age / s.maxAge
      const scale = Math.max(0, (1 - progress) * s.scale)

      DUMMY_POS.set(s.x, s.y, s.z)
      DUMMY_QUAT.setFromAxisAngle(Y_AXIS, s.age * 8)
      DUMMY_SCALE.set(scale, scale, scale)
      DUMMY_MATRIX.compose(DUMMY_POS, DUMMY_QUAT, DUMMY_SCALE)
      this.#sparkleMesh.setMatrixAt(i, DUMMY_MATRIX)
      activeSparkles++
    }

    if (activeSparkles > 0 || this.#sparkleMesh.instanceMatrix.needsUpdate) {
      this.#sparkleMesh.instanceMatrix.needsUpdate = true
    }

    // 3. Animate 3D Falling Victory Gift Box
    if (this.#giftBox) {
      const gb = this.#giftBox
      if (!gb.landed) {
        gb.vy -= 18.0 * dt
        gb.y += gb.vy * dt
        if (gb.y <= gb.targetY) {
          gb.y = gb.targetY
          if (Math.abs(gb.vy) > 2.5) {
            gb.vy = -gb.vy * 0.35 // bounce
            this.#burstSparkles(gb.x, gb.y + 0.3, gb.z)
          } else {
            gb.vy = 0
            gb.landed = true
            this.#burstSparkles(gb.x, gb.y + 0.3, gb.z)
            this.#burstSparkles(gb.x, gb.y + 0.8, gb.z)
          }
        }
      }
      gb.group.rotation.y += 1.2 * dt
      gb.group.position.set(gb.x, gb.y + Math.sin(time * 3.0) * 0.04, gb.z)
    }
  }

  #collect(index: number, coin: CoinData, floatY: number): void {
    coin.collected = true

    // Hide instanced coin and beacon
    DUMMY_MATRIX.makeScale(0, 0, 0)
    this.#coinMesh.setMatrixAt(index, DUMMY_MATRIX)
    this.#beaconMesh.setMatrixAt(index, DUMMY_MATRIX)
    this.#coinMesh.instanceMatrix.needsUpdate = true
    this.#beaconMesh.instanceMatrix.needsUpdate = true

    coinStore.collectCoin(coin.id, TARGET_FROSTHOLM_COINS, 100)

    // Spawn Sparkle Burst
    this.#burstSparkles(coin.x, floatY, coin.z)

    // Play Crystal Coin Chime
    this.#playCoinChime()

    // If reached 30 coins target, spawn the grand Falling Gift Box!
    const totalCollected = coinStore.getSnapshot().collectedIds.length
    if (totalCollected === TARGET_FROSTHOLM_COINS) {
      this.#spawnGiftBox(coin.x, floatY, coin.z)
    }
  }

  #spawnGiftBox(x: number, y: number, z: number): void {
    if (this.#giftBox) {
      this.group.remove(this.#giftBox.group)
      this.#giftBox = null
    }

    const giftGroup = new THREE.Group()

    // 1. Box Cube (Festive Ruby Red)
    const boxGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7)
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.35,
      metalness: 0.15,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.3,
    })
    const boxMesh = new THREE.Mesh(boxGeo, boxMat)
    boxMesh.castShadow = true
    giftGroup.add(boxMesh)

    // 2. Gold Ribbon Bands (Cross)
    const ribbonMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.25,
      metalness: 0.45,
      emissive: 0xd97706,
      emissiveIntensity: 0.4,
    })
    const ribbonHoriz = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.72), ribbonMat)
    giftGroup.add(ribbonHoriz)

    const ribbonVert1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.72), ribbonMat)
    giftGroup.add(ribbonVert1)

    // 3. Gold Bow on Top
    const bowLeft = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 16), ribbonMat)
    bowLeft.position.set(-0.12, 0.42, 0)
    bowLeft.rotation.z = Math.PI / 4
    giftGroup.add(bowLeft)

    const bowRight = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 16), ribbonMat)
    bowRight.position.set(0.12, 0.42, 0)
    bowRight.rotation.z = -Math.PI / 4
    giftGroup.add(bowRight)

    const startY = y + 8.5
    giftGroup.position.set(x, startY, z)
    this.group.add(giftGroup)

    this.#giftBox = {
      group: giftGroup,
      x,
      y: startY,
      z,
      targetY: y + 0.38,
      vy: -1.0,
      landed: false,
    }

    // Burst celebration sparkles in advance
    this.#burstSparkles(x, y + 2.0, z)
  }

  #burstSparkles(x: number, y: number, z: number): void {
    const burstCount = 18
    for (let i = 0; i < burstCount; i++) {
      let slot = this.#sparkles.findIndex((s) => !s.active)
      if (slot === -1) slot = Math.floor(Math.random() * SPARKLE_COUNT)

      const s = this.#sparkles[slot]!
      s.active = true
      s.x = x
      s.y = y
      s.z = z
      const angle = (i / burstCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
      const spd = 2.4 + Math.random() * 3.0
      s.vx = Math.cos(angle) * spd
      s.vy = 2.6 + Math.random() * 2.2
      s.vz = Math.sin(angle) * spd
      s.scale = 1.2 + Math.random() * 0.8
      s.age = 0
      s.maxAge = 0.5 + Math.random() * 0.25
    }
  }

  #playCoinChime(): void {
    try {
      if (!this.#audioCtx) {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (AudioCtxClass) this.#audioCtx = new AudioCtxClass()
      }
      if (!this.#audioCtx) return

      if (this.#audioCtx.state === 'suspended') {
        void this.#audioCtx.resume()
      }

      const now = this.#audioCtx.currentTime

      // Two-tone bell harmonic chime (B5 -> E6)
      const osc1 = this.#audioCtx.createOscillator()
      const osc2 = this.#audioCtx.createOscillator()
      const gain = this.#audioCtx.createGain()

      osc1.type = 'triangle'
      osc2.type = 'sine'

      osc1.frequency.setValueAtTime(987.77, now) // B5
      osc1.frequency.setValueAtTime(1318.51, now + 0.08) // E6

      osc2.frequency.setValueAtTime(1975.53, now) // B6 harmonic
      osc2.frequency.setValueAtTime(2637.02, now + 0.08) // E7 harmonic

      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.25, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(this.#audioCtx.destination)

      osc1.start(now)
      osc2.start(now)
      osc1.stop(now + 0.52)
      osc2.stop(now + 0.52)
    } catch {}
  }

  /** Reset all coins to visible & uncollected for a fresh run */
  resetAll(): void {
    coinStore.resetRun()
    if (this.#giftBox) {
      this.group.remove(this.#giftBox.group)
      this.#giftBox = null
    }

    for (let i = 0; i < this.#coins.length; i++) {
      const coin = this.#coins[i]!
      coin.collected = false

      DUMMY_POS.set(coin.x, coin.baseY + 0.85, coin.z)
      DUMMY_QUAT.setFromAxisAngle(Y_AXIS, 0)
      DUMMY_SCALE.set(1, 1, 1)
      DUMMY_MATRIX.compose(DUMMY_POS, DUMMY_QUAT, DUMMY_SCALE)
      this.#coinMesh.setMatrixAt(i, DUMMY_MATRIX)

      DUMMY_POS.set(coin.x, coin.baseY + 2.2, coin.z)
      DUMMY_MATRIX.compose(DUMMY_POS, DUMMY_QUAT, DUMMY_SCALE)
      this.#beaconMesh.setMatrixAt(i, DUMMY_MATRIX)
    }

    this.#coinMesh.instanceMatrix.needsUpdate = true
    this.#beaconMesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    if (this.#giftBox) {
      this.group.remove(this.#giftBox.group)
      this.#giftBox = null
    }
    this.#scene.remove(this.group)
    this.#coinMesh.geometry.dispose()
    if (Array.isArray(this.#coinMesh.material)) {
      this.#coinMesh.material.forEach((m) => m.dispose())
    } else {
      this.#coinMesh.material.dispose()
    }
    this.#beaconMesh.geometry.dispose()
    if (Array.isArray(this.#beaconMesh.material)) {
      this.#beaconMesh.material.forEach((m) => m.dispose())
    } else {
      this.#beaconMesh.material.dispose()
    }
    this.#sparkleMesh.geometry.dispose()
    if (Array.isArray(this.#sparkleMesh.material)) {
      this.#sparkleMesh.material.forEach((m) => m.dispose())
    } else {
      this.#sparkleMesh.material.dispose()
    }
    this.#audioCtx?.close().catch(() => {})
  }
}
