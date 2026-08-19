import * as THREE from 'three/webgpu'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import { sampleHeight } from '@/engine/terrain/HeightFieldCpu'
import { SKEET_HIT_RADIUS } from '@/engine/minigame/SkeetField'

export type ProjectileMaterialType = 'snow' | 'sand' | 'soil'

export function getTerrainProjectileType(sceneryId: string): ProjectileMaterialType {
  if (sceneryId.includes('frostholm') || sceneryId.includes('snow') || sceneryId.includes('ice')) {
    return 'snow'
  }
  if (
    sceneryId.includes('kamakura') ||
    sceneryId.includes('beach') ||
    sceneryId.includes('sand') ||
    sceneryId.includes('coast') ||
    sceneryId.includes('sports') ||
    sceneryId.includes('arena')
  ) {
    return 'sand'
  }
  return 'soil' // default for Aki Highlands / grass / loam earth
}

type Projectile = {
  mesh: THREE.Mesh
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  spinX: number
  spinY: number
  spinZ: number
  type: ProjectileMaterialType
  lifeS: number
}

type DebrisParticle = {
  mesh: THREE.Mesh
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  scale: number
  ageS: number
  maxAgeS: number
}

/** A target-practice prop or a peer avatar to check in-flight projectiles against —
 * plain XZ + a hit radius, index/sid-tagged so the caller (`Engine.ts`) knows which
 * one got hit. Deliberately generic (not importing `TargetField`'s own types) so
 * `ProjectileField` doesn't need to know the mini-game exists — it just checks
 * whatever circles it's handed. */
export type ProjectileHitTarget = { x: number; z: number; radius: number }
export type ProjectileHitPeer = { sid: number; x: number; z: number; radius: number }

const GRAVITY = -9.81
const MAX_LIFETIME_S = 4.0
/** Generous vertical margin above a target/peer's own ground point — without this, a
 * ball arcing high overhead would register as "hit" the instant it merely passes
 * over that XZ point, regardless of how far above it actually is.
 *
 * 1.4m, not a smaller "just above target height" guess: `spawn()`'s mandatory
 * `+3.8` upward lob (`vy = max(direction.y * speed, 0) + 3.8`, applied regardless of
 * how level the aim is) means a dead-level throw is still arcing at ~0.4-1.07m above
 * ground across the target cluster's actual 6-10m placement range (`TargetField.ts`)
 * — verified by simulating the real trajectory, not assumed. A tighter threshold
 * (an earlier version used 0.8m) meant a correctly-aimed shot at a target 6-8m away
 * would sail over the hit window and never register at all. */
const TARGET_HIT_HEIGHT_M = 1.4
const PEER_HIT_HEIGHT_M = 1.8
const PROJECTILE_GEOMETRY = new THREE.DodecahedronGeometry(0.1, 0)
const DEBRIS_GEOMETRY = new THREE.TetrahedronGeometry(0.038, 0)

const MATERIALS: Record<ProjectileMaterialType, THREE.MeshStandardMaterial> = {
  snow: new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.65,
    metalness: 0,
  }),
  sand: new THREE.MeshStandardMaterial({
    color: 0xe2a866,
    roughness: 0.88,
    metalness: 0,
  }),
  soil: new THREE.MeshStandardMaterial({
    color: 0x543823,
    roughness: 0.95,
    metalness: 0,
  }),
}

export type ProjectileFieldCallbacks = {
  onImpact?: (type: ProjectileMaterialType, x: number, y: number, z: number) => void
  /** Fires instead of `onImpact` when a projectile lands inside a target's hit
   * radius/height (see `update`'s `targets` param) — the projectile is consumed
   * either way, just attributed differently. */
  onTargetHit?: (index: number, type: ProjectileMaterialType) => void
  /** The "friendly bonk" — fires instead of `onImpact` when a projectile lands
   * inside a peer's hit radius/height (see `update`'s `peers` param). Purely a
   * reaction; nothing about game state changes from this. */
  onPeerHit?: (sid: number, type: ProjectileMaterialType) => void
  /** Fires when a projectile hits a flying clay skeet target in mid-air */
  onSkeetHit?: (
    targetId: number,
    x: number,
    y: number,
    z: number,
    type: ProjectileMaterialType,
  ) => void
}

export class ProjectileField {
  #scene: THREE.Scene
  #projectiles: Projectile[] = []
  #debris: DebrisParticle[] = []
  #group = new THREE.Group()
  #onImpact?: (type: ProjectileMaterialType, x: number, y: number, z: number) => void
  #onTargetHit?: (index: number, type: ProjectileMaterialType) => void
  #onPeerHit?: (sid: number, type: ProjectileMaterialType) => void
  #onSkeetHit?: (
    targetId: number,
    x: number,
    y: number,
    z: number,
    type: ProjectileMaterialType,
  ) => void

  constructor(scene: THREE.Scene, callbacks: ProjectileFieldCallbacks = {}) {
    this.#scene = scene
    this.#onImpact = callbacks.onImpact
    this.#onTargetHit = callbacks.onTargetHit
    this.#onPeerHit = callbacks.onPeerHit
    this.#onSkeetHit = callbacks.onSkeetHit
    this.#scene.add(this.#group)
  }

  /**
   * Spawns a thrown projectile from the character's hand facing outward in trajectory.
   */
  spawn(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    type: ProjectileMaterialType,
    speed = 13.5,
  ): void {
    const mat = MATERIALS[type]
    const mesh = new THREE.Mesh(PROJECTILE_GEOMETRY, mat)
    mesh.castShadow = true
    mesh.receiveShadow = false
    mesh.position.set(origin.x, origin.y, origin.z)

    // Direction vector with a pleasant parabolic upward arc
    const dirLen = Math.hypot(direction.x, direction.z) || 1
    const nx = direction.x / dirLen
    const nz = direction.z / dirLen

    const vx = nx * speed
    const vy = Math.max(direction.y * speed, 0) + 3.8 // upward lob
    const vz = nz * speed

    const projectile: Projectile = {
      mesh,
      x: origin.x,
      y: origin.y,
      z: origin.z,
      vx,
      vy,
      vz,
      spinX: (Math.random() - 0.5) * 12,
      spinY: (Math.random() - 0.5) * 12,
      spinZ: (Math.random() - 0.5) * 12,
      type,
      lifeS: 0,
    }

    this.#group.add(mesh)
    this.#projectiles.push(projectile)
  }

  update(
    dt: number,
    terrain: HeightSpec,
    targets: ProjectileHitTarget[] = [],
    peers: ProjectileHitPeer[] = [],
    skeetTargets: { id: number; x: number; y: number; z: number }[] = [],
  ): void {
    const remainingProjectiles: Projectile[] = []

    for (const p of this.#projectiles) {
      p.lifeS += dt
      p.vy += GRAVITY * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt

      p.mesh.position.set(p.x, p.y, p.z)
      p.mesh.rotation.x += p.spinX * dt
      p.mesh.rotation.y += p.spinY * dt
      p.mesh.rotation.z += p.spinZ * dt

      // Flying Skeet Clay Target hit check (3D sphere collision in mid-air)
      let hitSkeetId: number | null = null
      for (const st of skeetTargets) {
        const dx = p.x - st.x
        const dy = p.y - st.y
        const dz = p.z - st.z
        if (dx * dx + dy * dy + dz * dz <= SKEET_HIT_RADIUS * SKEET_HIT_RADIUS) {
          hitSkeetId = st.id
          break
        }
      }
      if (hitSkeetId !== null) {
        this.#group.remove(p.mesh)
        this.#spawnImpactDebris(p.x, p.y, p.z, p.type)
        this.#onSkeetHit?.(hitSkeetId, p.x, p.y, p.z, p.type)
        continue
      }

      // Target hit check — before ground impact, since a target physically sits
      // between the thrower and the ground it would otherwise land on.
      let hitTargetIndex = -1
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]!
        const dx = p.x - t.x
        const dz = p.z - t.z
        if (dx * dx + dz * dz > t.radius * t.radius) continue
        const targetGroundY = sampleHeight(terrain, t.x, t.z)
        if (p.y < targetGroundY || p.y > targetGroundY + TARGET_HIT_HEIGHT_M) continue
        hitTargetIndex = i
        break
      }
      if (hitTargetIndex >= 0) {
        const groundY = sampleHeight(terrain, p.x, p.z)
        this.#group.remove(p.mesh)
        this.#spawnImpactDebris(p.x, groundY, p.z, p.type)
        this.#onTargetHit?.(hitTargetIndex, p.type)
        continue
      }

      // Peer hit check — the "friendly bonk," no state change either way.
      let hitPeerSid: number | null = null
      for (const peer of peers) {
        const dx = p.x - peer.x
        const dz = p.z - peer.z
        if (dx * dx + dz * dz > peer.radius * peer.radius) continue
        const peerGroundY = sampleHeight(terrain, peer.x, peer.z)
        if (p.y < peerGroundY || p.y > peerGroundY + PEER_HIT_HEIGHT_M) continue
        hitPeerSid = peer.sid
        break
      }
      if (hitPeerSid !== null) {
        const groundY = sampleHeight(terrain, p.x, p.z)
        this.#group.remove(p.mesh)
        this.#spawnImpactDebris(p.x, groundY, p.z, p.type)
        this.#onPeerHit?.(hitPeerSid, p.type)
        continue
      }

      // Ground collision detection
      const groundY = sampleHeight(terrain, p.x, p.z)
      if (p.y <= groundY || p.lifeS >= MAX_LIFETIME_S) {
        // Impact!
        this.#group.remove(p.mesh)
        this.#spawnImpactDebris(p.x, groundY, p.z, p.type)
        this.#onImpact?.(p.type, p.x, groundY, p.z)
      } else {
        remainingProjectiles.push(p)
      }
    }
    this.#projectiles = remainingProjectiles

    // Update impact debris particles
    const remainingDebris: DebrisParticle[] = []
    for (const d of this.#debris) {
      d.ageS += dt
      if (d.ageS >= d.maxAgeS) {
        this.#group.remove(d.mesh)
        continue
      }
      d.vy += GRAVITY * 0.8 * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.z += d.vz * dt

      const progress = d.ageS / d.maxAgeS
      const scale = d.scale * (1 - progress * 0.8)
      d.mesh.scale.set(scale, scale, scale)
      d.mesh.position.set(d.x, d.y, d.z)
      d.mesh.rotation.x += 4 * dt
      d.mesh.rotation.y += 6 * dt

      remainingDebris.push(d)
    }
    this.#debris = remainingDebris
  }

  #spawnImpactDebris(x: number, y: number, z: number, type: ProjectileMaterialType): void {
    const mat = MATERIALS[type]
    const count = 14

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(DEBRIS_GEOMETRY, mat)
      mesh.position.set(x, y + 0.05, z)
      mesh.castShadow = false

      // Random burst velocity in hemisphere
      const theta = Math.random() * Math.PI * 2
      const spread = 1.2 + Math.random() * 2.8
      const vx = Math.cos(theta) * spread
      const vz = Math.sin(theta) * spread
      const vy = 1.5 + Math.random() * 3.2

      this.#group.add(mesh)
      this.#debris.push({
        mesh,
        x,
        y: y + 0.05,
        z,
        vx,
        vy,
        vz,
        scale: 0.8 + Math.random() * 0.6,
        ageS: 0,
        maxAgeS: 0.45 + Math.random() * 0.25,
      })
    }
  }

  dispose(): void {
    for (const p of this.#projectiles) this.#group.remove(p.mesh)
    for (const d of this.#debris) this.#group.remove(d.mesh)
    this.#projectiles = []
    this.#debris = []
    this.#scene.remove(this.#group)
  }
}
