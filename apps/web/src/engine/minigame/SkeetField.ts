import * as THREE from 'three/webgpu'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import { sampleHeight } from '@/engine/terrain/HeightFieldCpu'

export type FlyingTarget = {
  id: number
  active: boolean
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  spin: number
  mesh: THREE.Mesh
}

type ShatterParticle = {
  active: boolean
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
  mesh: THREE.Mesh
}

export type SkeetMatchState = 'idle' | 'in_progress' | 'completed'

/** Shared with `ProjectileField`'s own hit check (imported there, not duplicated) so
 * the two can never drift apart — widened alongside the clay's visual mesh radius
 * (see the disc geometry below) specifically so the game reads as easier, not just
 * looks like it should be. */
export const SKEET_HIT_RADIUS = 0.95

export class SkeetField {
  readonly group = new THREE.Group()
  readonly originX: number
  readonly originZ: number
  readonly standY: number

  #spec: HeightSpec
  #targets: FlyingTarget[] = []
  #particles: ShatterParticle[] = []
  #nextTargetId = 1

  #matchState: SkeetMatchState = 'idle'
  #currentWave = 0
  #totalWaves = 10
  #waveTimer = 0
  #hits = 0
  #totalLaunched = 0

  // 3D Scoreboard
  #scoreCanvas: HTMLCanvasElement
  #scoreTexture: THREE.CanvasTexture
  #scoreboardMesh: THREE.Mesh

  // Shared Materials
  #discMat: THREE.MeshStandardMaterial
  #boxMat: THREE.MeshStandardMaterial
  #standMat: THREE.MeshStandardMaterial
  #particleMat: THREE.MeshStandardMaterial

  constructor(spec: HeightSpec, originX = -24, originZ = 0) {
    this.#spec = spec
    this.originX = originX
    this.originZ = originZ
    this.standY = sampleHeight(spec, originX, originZ)

    this.group.position.set(originX, this.standY, originZ)

    // Materials
    this.#discMat = new THREE.MeshStandardMaterial({
      color: 0xff5500, // Vibrant neon orange
      roughness: 0.35,
      metalness: 0.1,
      emissive: 0xaa2200,
      emissiveIntensity: 0.4,
    })
    this.#boxMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.7,
      metalness: 0.2,
    })
    this.#standMat = new THREE.MeshStandardMaterial({
      color: 0x15803d, // Green turf shooting mat
      roughness: 0.85,
    })
    this.#particleMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      roughness: 0.4,
      emissive: 0xff3300,
      emissiveIntensity: 0.5,
    })

    // 1. Shooting Stand (Green Mat & Wood Border)
    const matGeo = new THREE.BoxGeometry(4.0, 0.12, 3.2)
    const matMesh = new THREE.Mesh(matGeo, this.#standMat)
    matMesh.position.set(0, 0.06, 0)
    matMesh.receiveShadow = true
    this.group.add(matMesh)

    // 2. Trap Launcher Box
    const trapGeo = new THREE.BoxGeometry(1.2, 0.85, 1.2)
    const trapMesh = new THREE.Mesh(trapGeo, this.#boxMat)
    trapMesh.position.set(0, 0.42, -5.5)
    trapMesh.castShadow = true
    trapMesh.receiveShadow = true
    this.group.add(trapMesh)

    // Trap Launcher Tube
    const tubeGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.9, 12)
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.8,
      roughness: 0.2,
    })
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat)
    tubeMesh.position.set(0, 0.85, -5.5)
    tubeMesh.rotation.x = -Math.PI / 4 // Angled up toward the sky
    this.group.add(tubeMesh)

    // 3. 3D Scoreboard Canvas
    this.#scoreCanvas = document.createElement('canvas')
    this.#scoreCanvas.width = 512
    this.#scoreCanvas.height = 160
    this.#scoreTexture = new THREE.CanvasTexture(this.#scoreCanvas)
    this.#updateScoreboardTexture()

    const scoreGeo = new THREE.PlaneGeometry(2.4, 0.75)
    const scoreMat = new THREE.MeshBasicMaterial({
      map: this.#scoreTexture,
      side: THREE.DoubleSide,
    })
    this.#scoreboardMesh = new THREE.Mesh(scoreGeo, scoreMat)
    this.#scoreboardMesh.position.set(0, 2.2, -6.5)
    this.group.add(this.#scoreboardMesh)

    // 4. Target Pool (up to 8 flying discs) — sized up from an original 0.26-0.28
    // radius so the clay reads clearly against the sky while it's crossing the view;
    // `HIT_RADIUS` below is widened to match, not just the visual mesh, so "looks
    // bigger" also means "is actually easier to hit."
    const discGeo = new THREE.CylinderGeometry(0.42, 0.45, 0.08, 16)
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(discGeo, this.#discMat)
      mesh.visible = false
      mesh.castShadow = true
      this.group.add(mesh)
      this.#targets.push({
        id: 0,
        active: false,
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        spin: 0,
        mesh,
      })
    }

    // 5. Shatter Particles Pool (48 particles)
    const partGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08)
    for (let i = 0; i < 48; i++) {
      const pMesh = new THREE.Mesh(partGeo, this.#particleMat)
      pMesh.visible = false
      this.group.add(pMesh)
      this.#particles.push({
        active: false,
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1.0,
        mesh: pMesh,
      })
    }
  }

  get matchState(): SkeetMatchState {
    return this.#matchState
  }

  get stats(): { currentWave: number; totalWaves: number; hits: number; total: number } {
    return {
      currentWave: this.#currentWave,
      totalWaves: this.#totalWaves,
      hits: this.#hits,
      total: this.#totalLaunched,
    }
  }

  get activeTargets(): { id: number; x: number; y: number; z: number }[] {
    return this.#targets
      .filter((t) => t.active)
      .map((t) => ({
        id: t.id,
        x: this.originX + t.x,
        y: this.standY + t.y,
        z: this.originZ + t.z,
      }))
  }

  startRound(): {
    wave: number
    targets: { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }[]
  } {
    this.#matchState = 'in_progress'
    this.#currentWave = 1
    this.#waveTimer = 0
    this.#hits = 0
    this.#totalLaunched = 0
    const launched = this.#spawnWave()
    this.#updateScoreboardTexture()
    return { wave: 1, targets: launched }
  }

  resetRound(): void {
    this.#matchState = 'idle'
    this.#currentWave = 0
    this.#waveTimer = 0
    this.#hits = 0
    this.#totalLaunched = 0
    for (const t of this.#targets) {
      t.active = false
      t.mesh.visible = false
      t.mesh.position.set(0, -10, 0)
    }
    for (const p of this.#particles) {
      p.active = false
      p.mesh.visible = false
    }
    this.#updateScoreboardTexture()
  }

  #spawnWave(): {
    id: number
    x: number
    y: number
    z: number
    vx: number
    vy: number
    vz: number
  }[] {
    const count = this.#currentWave >= 6 && Math.random() > 0.4 ? 2 : 1 // double clays in later waves
    const results: {
      id: number
      x: number
      y: number
      z: number
      vx: number
      vy: number
      vz: number
    }[] = []

    // Crosses laterally in front of the shooter (classic arcade "clay pigeon" read)
    // rather than launching mostly straight away from the trap — a target flying
    // toward/past the camera is much harder to judge distance/lead on than one
    // sweeping left-to-right across a stable depth, which is also just easier to see
    // coming and track. A double launch alternates direction per disc for a crossing
    // "X" pair, matching real trap-shooting "true pairs"; a single clay picks a
    // random direction each time.
    const CROSS_HALF_WIDTH = 13
    for (let i = 0; i < count; i++) {
      const free = this.#targets.find((t) => !t.active)
      if (!free) break

      const id = this.#nextTargetId++
      const dir = count > 1 ? (i === 0 ? 1 : -1) : Math.random() < 0.5 ? 1 : -1

      // Tuned together, not independently: at the low end of a naive random range,
      // gravity (8.5 m/s²) would pull the clay to the ground before it finished
      // crossing the field, cutting the sweep short — verified by simulating the
      // actual trajectory, not assumed. This range keeps ~1.9-2.6s of airtime, enough
      // for `speed` to cover well past the shooter's own position at x=0 regardless
      // of which end of the random range it lands on.
      const speed = 10.0 + Math.random() * 4.0
      const vx = dir * speed
      const vy = 7.5 + Math.random() * 3.0
      const vz = 1.0 + Math.random() * 1.5 // slow drift toward the shooter, not away

      free.id = id
      free.active = true
      free.x = -dir * CROSS_HALF_WIDTH // starts on the side it's flying away from
      free.y = 0.9
      free.z = -8
      free.vx = vx
      free.vy = vy
      free.vz = vz
      free.spin = (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 10)
      free.mesh.position.set(free.x, free.y, free.z)
      free.mesh.visible = true

      this.#totalLaunched++
      results.push({ id, x: free.x, y: free.y, z: free.z, vx, vy, vz })
    }

    return results
  }

  applyRemoteLaunch(
    targets: { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }[],
    wave?: number,
  ): void {
    this.#matchState = 'in_progress'
    if (wave !== undefined) this.#currentWave = wave

    for (const tData of targets) {
      let target = this.#targets.find((t) => t.id === tData.id)
      if (!target) {
        target = this.#targets.find((t) => !t.active)
      }
      if (!target) continue

      target.id = tData.id
      target.active = true
      target.x = tData.x
      target.y = tData.y
      target.z = tData.z
      target.vx = tData.vx
      target.vy = tData.vy
      target.vz = tData.vz
      target.spin = 18
      target.mesh.position.set(target.x, target.y, target.z)
      target.mesh.visible = true
    }
    this.#updateScoreboardTexture()
  }

  checkHit(
    worldProjX: number,
    worldProjY: number,
    worldProjZ: number,
    hitRadius = SKEET_HIT_RADIUS,
  ): { hit: boolean; targetId: number; pos: { x: number; y: number; z: number } } | null {
    for (const target of this.#targets) {
      if (!target.active) continue

      const worldTargetX = this.originX + target.x
      const worldTargetY = this.standY + target.y
      const worldTargetZ = this.originZ + target.z

      const dist = Math.hypot(
        worldProjX - worldTargetX,
        worldProjY - worldTargetY,
        worldProjZ - worldTargetZ,
      )

      if (dist <= hitRadius) {
        this.shatterTarget(target.id)
        this.#hits++
        this.#updateScoreboardTexture()
        return {
          hit: true,
          targetId: target.id,
          pos: { x: worldTargetX, y: worldTargetY, z: worldTargetZ },
        }
      }
    }
    return null
  }

  shatterTarget(targetId: number): void {
    const target = this.#targets.find((t) => t.id === targetId && t.active)
    if (!target) return

    target.active = false
    target.mesh.visible = false
    target.mesh.position.set(0, -10, 0)

    // Spawn 12 particles
    let spawned = 0
    for (const p of this.#particles) {
      if (p.active) continue
      p.active = true
      p.x = target.x
      p.y = target.y
      p.z = target.z
      const angle = (spawned / 12) * Math.PI * 2 + Math.random() * 0.5
      const pSpeed = 3.5 + Math.random() * 4.0
      p.vx = target.vx * 0.3 + Math.cos(angle) * pSpeed
      p.vy = target.vy * 0.3 + Math.sin(angle) * pSpeed + (Math.random() - 0.2) * 3.0
      p.vz = target.vz * 0.3 + (Math.random() - 0.5) * pSpeed
      p.life = 0
      p.maxLife = 0.6 + Math.random() * 0.4
      p.mesh.position.set(p.x, p.y, p.z)
      p.mesh.visible = true

      spawned++
      if (spawned >= 12) break
    }
  }

  update(dt: number): {
    waveComplete?: boolean
    newWave?: {
      wave: number
      targets: { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }[]
    }
  } {
    const gravity = 8.5 // m/s^2

    // Update active flying targets
    for (const target of this.#targets) {
      if (!target.active) continue

      target.x += target.vx * dt
      target.y += target.vy * dt
      target.z += target.vz * dt
      target.vy -= gravity * dt
      target.mesh.rotation.y += target.spin * dt
      target.mesh.rotation.x = Math.sin(target.mesh.rotation.y) * 0.2
      target.mesh.position.set(target.x, target.y, target.z)

      // Ground collision
      const worldX = this.originX + target.x
      const worldZ = this.originZ + target.z
      const groundY = sampleHeight(this.#spec, worldX, worldZ)

      if (this.standY + target.y <= groundY + 0.1) {
        // Clay hit the ground - broken on ground
        target.active = false
        target.mesh.visible = false
        target.mesh.position.set(0, -10, 0)
      }
    }

    // Update shatter particles
    for (const p of this.#particles) {
      if (!p.active) continue
      p.life += dt
      if (p.life >= p.maxLife) {
        p.active = false
        p.mesh.visible = false
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.vy -= 9.8 * dt
      p.mesh.position.set(p.x, p.y, p.z)
      const scale = Math.max(0.1, 1.0 - p.life / p.maxLife)
      p.mesh.scale.set(scale, scale, scale)
    }

    // Match round wave progression
    if (this.#matchState === 'in_progress') {
      this.#waveTimer += dt
      if (this.#waveTimer >= 3.4) {
        this.#waveTimer = 0
        if (this.#currentWave < this.#totalWaves) {
          this.#currentWave++
          const launched = this.#spawnWave()
          this.#updateScoreboardTexture()
          return { newWave: { wave: this.#currentWave, targets: launched } }
        } else {
          // Completed all waves
          this.#matchState = 'completed'
          this.#updateScoreboardTexture()
          return { waveComplete: true }
        }
      }
    }

    return {}
  }

  #updateScoreboardTexture(): void {
    const ctx = this.#scoreCanvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#090d16'
    ctx.fillRect(0, 0, 512, 160)

    ctx.strokeStyle = '#f97316' // Orange border
    ctx.lineWidth = 6
    ctx.strokeRect(4, 4, 504, 152)

    ctx.font = 'bold 26px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (this.#matchState === 'idle') {
      ctx.fillStyle = '#fb923c'
      ctx.fillText('🎯 SKEET SHOOTING RANGE 🎯', 256, 45)
      ctx.fillStyle = '#94a3b8'
      ctx.font = '20px sans-serif'
      ctx.fillText('Press [G] to Start 10-Wave Shootout', 256, 105)
    } else if (this.#matchState === 'in_progress') {
      ctx.fillStyle = '#f97316'
      ctx.fillText(`🎯 WAVE ${this.#currentWave} / ${this.#totalWaves}`, 256, 42)

      const acc = this.#totalLaunched > 0 ? Math.round((this.#hits / this.#totalLaunched) * 100) : 0
      ctx.fillStyle = '#22c55e'
      ctx.font = 'bold 28px sans-serif'
      ctx.fillText(`HITS: ${this.#hits} / ${this.#totalLaunched} (${acc}%)`, 256, 105)
    } else {
      const acc = this.#totalLaunched > 0 ? Math.round((this.#hits / this.#totalLaunched) * 100) : 0
      ctx.fillStyle = '#eab308'
      ctx.fillText('🏆 ROUND COMPLETE! 🏆', 256, 42)

      ctx.fillStyle = '#38bdf8'
      ctx.font = 'bold 28px sans-serif'
      ctx.fillText(`FINAL SCORE: ${this.#hits} / ${this.#totalLaunched} (${acc}%)`, 256, 105)
    }

    this.#scoreTexture.needsUpdate = true
  }

  dispose(): void {
    this.group.clear()
    this.#discMat.dispose()
    this.#boxMat.dispose()
    this.#standMat.dispose()
    this.#particleMat.dispose()
    this.#scoreTexture.dispose()
  }
}
