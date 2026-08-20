import * as THREE from 'three/webgpu'
import { sampleHeight } from '@/engine/terrain/HeightFieldCpu'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import { NameTag } from '@/engine/character/NameTag'

export type CompanionSpecies = 'fox' | 'cat' | 'shiba' | 'bunny' | 'penguin' | 'dragon' | 'none'
export const DEFAULT_COMPANION_SPECIES: CompanionSpecies = 'cat'
export const DEFAULT_COMPANION_NAMES: Record<CompanionSpecies, string> = {
  cat: 'Neko',
  shiba: 'Shiba',
  bunny: 'Marshmallow',
  penguin: 'Penpen',
  dragon: 'Ryuu',
  fox: 'Foxy',
  none: '',
}

export interface CompanionState {
  species: CompanionSpecies
  x: number
  y: number
  z: number
  yaw: number
  isMoving: boolean
  isHappy: boolean
}

export class CompanionPet {
  #group = new THREE.Group()
  #species: CompanionSpecies = DEFAULT_COMPANION_SPECIES
  #scene: THREE.Scene
  #terrainSpec: HeightSpec | null = null

  // Transform / Movement
  #x = 0
  #y = 0
  #z = 0
  #yaw = 0
  #targetX = 0
  #targetZ = 0
  #targetYaw = 0

  // Nametag above head
  #nameTag: NameTag | null = null
  #name = ''

  // Animation nodes
  #modelContainer = new THREE.Group()
  #headMesh: THREE.Object3D | null = null
  #tailMesh: THREE.Object3D | null = null
  #leftEar: THREE.Object3D | null = null
  #rightEar: THREE.Object3D | null = null
  #wingLeft: THREE.Object3D | null = null
  #wingRight: THREE.Object3D | null = null

  // State
  #animTime = 0
  #walkCycle = 0
  #moveIntensity = 0
  #happyTimer = 0
  #hopOffset = 0
  #isMoving = false

  constructor(scene: THREE.Scene, terrainSpec: HeightSpec) {
    this.#scene = scene
    this.#terrainSpec = terrainSpec
    this.#group.name = 'CompanionPet'
    this.#group.add(this.#modelContainer)
    this.#scene.add(this.#group)

    // Load saved species or default to cat
    let saved: CompanionSpecies = DEFAULT_COMPANION_SPECIES
    if (typeof window !== 'undefined') {
      try {
        const s = localStorage.getItem('chill_companion_species') as CompanionSpecies | null
        if (s && ['fox', 'cat', 'shiba', 'bunny', 'penguin', 'dragon', 'none'].includes(s)) {
          saved = s
        }
      } catch {}
    }
    this.setSpecies(saved)
  }

  get species(): CompanionSpecies {
    return this.#species
  }

  get name(): string {
    return this.#name
  }

  get position(): { x: number; y: number; z: number } {
    return { x: this.#x, y: this.#y, z: this.#z }
  }

  setTerrain(spec: HeightSpec): void {
    this.#terrainSpec = spec
  }

  setName(name: string): void {
    this.#name = name
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`chill_companion_name_${this.#species}`, name)
      } catch {}
    }

    if (this.#species === 'none') {
      if (this.#nameTag) this.#nameTag.sprite.visible = false
      return
    }

    if (!this.#nameTag) {
      this.#nameTag = new NameTag(name, {
        worldHeightM: 0.13,
        fontPx: 30,
        paddingXPx: 18,
        bgColor: 'rgba(15, 20, 32, 0.45)',
      })
      this.#nameTag.sprite.position.set(0, 0.86, 0)
      this.#group.add(this.#nameTag.sprite)
    } else {
      this.#nameTag.setName(name)
      this.#nameTag.sprite.position.set(0, 0.86, 0)
      this.#nameTag.sprite.visible = true
    }
  }

  setSpecies(species: CompanionSpecies): void {
    this.#species = species
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('chill_companion_species', species)
      } catch {}
    }

    // Clear existing model
    while (this.#modelContainer.children.length > 0) {
      const child = this.#modelContainer.children[0]!
      this.#modelContainer.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose()
      }
    }

    this.#headMesh = null
    this.#tailMesh = null
    this.#leftEar = null
    this.#rightEar = null
    this.#wingLeft = null
    this.#wingRight = null

    if (species === 'none') {
      this.#group.visible = false
      if (this.#nameTag) this.#nameTag.sprite.visible = false
      return
    }

    this.#group.visible = true
    this.#buildSpeciesMesh(species)

    // Load or initialize pet name
    let petName = DEFAULT_COMPANION_NAMES[species] || ''
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`chill_companion_name_${species}`)
        if (saved && saved.trim().length > 0) {
          petName = saved.trim()
        }
      } catch {}
    }
    this.setName(petName)
  }

  petReaction(): void {
    this.#happyTimer = 1.6 // 1.6 seconds of gentle happy spin & hop
  }

  teleportNear(playerX: number, playerZ: number, playerYaw: number): void {
    const angle = playerYaw + 0.7
    this.#x = playerX - Math.sin(angle) * 0.95
    this.#z = playerZ - Math.cos(angle) * 0.95
    if (this.#terrainSpec) {
      this.#y = sampleHeight(this.#terrainSpec, this.#x, this.#z)
    }
    this.#yaw = playerYaw
    this.#group.position.set(this.#x, this.#y, this.#z)
    this.#group.rotation.y = this.#yaw
  }

  update(
    dt: number,
    playerX: number,
    playerY: number,
    playerZ: number,
    playerYaw: number,
    playerMoving: boolean,
  ): void {
    if (this.#species === 'none' || !this.#terrainSpec) return

    this.#animTime += dt

    // 1. Calculate desired follower position (0.95m to player's rear-left)
    const followAngle = playerYaw + 0.65
    const followDist = 0.95
    this.#targetX = playerX - Math.sin(followAngle) * followDist
    this.#targetZ = playerZ - Math.cos(followAngle) * followDist

    const dx = this.#targetX - this.#x
    const dz = this.#targetZ - this.#z
    const distSq = dx * dx + dz * dz
    const dist = Math.sqrt(distSq)

    // If player is super far (e.g. teleported), snap closer
    if (dist > 12) {
      this.teleportNear(playerX, playerZ, playerYaw)
      return
    }

    // Follow spring physics
    const stopRadius = 0.35
    if (dist > stopRadius) {
      this.#isMoving = true
      const targetSpeed = Math.min((dist - stopRadius) * 3.5 + (playerMoving ? 3.0 : 1.2), 6.5)
      const moveStep = Math.min(targetSpeed * dt, dist)
      this.#x += (dx / dist) * moveStep
      this.#z += (dz / dist) * moveStep

      // Smooth move intensity ramp
      this.#moveIntensity += (1.0 - this.#moveIntensity) * Math.min(dt * 6, 1)

      // Step walk cycle smoothly according to actual travel speed
      const strideRate = 5.0
      this.#walkCycle += dt * strideRate

      // Face direction of travel
      const moveAngle = Math.atan2(dx, dz)
      this.#targetYaw = moveAngle
    } else {
      this.#isMoving = false
      this.#moveIntensity += (0.0 - this.#moveIntensity) * Math.min(dt * 6, 1)

      // When stopped, face slightly towards player
      const toPlayerX = playerX - this.#x
      const toPlayerZ = playerZ - this.#z
      this.#targetYaw = Math.atan2(toPlayerX, toPlayerZ)
    }

    // Smooth rotation lerp
    let diffYaw = this.#targetYaw - this.#yaw
    while (diffYaw > Math.PI) diffYaw -= Math.PI * 2
    while (diffYaw < -Math.PI) diffYaw += Math.PI * 2
    this.#yaw += diffYaw * Math.min(dt * 7, 1)

    // Ground elevation from terrain
    const groundY = sampleHeight(this.#terrainSpec, this.#x, this.#z)
    this.#y += (groundY - this.#y) * Math.min(dt * 10, 1)

    // Natural stride animation per species
    let bodyRoll = 0
    let bodyPitch = 0
    if (this.#species === 'bunny') {
      // Bunny: gentle rhythmic bunny hops
      const hopPhase = Math.sin(this.#walkCycle)
      this.#hopOffset = Math.max(0, hopPhase * hopPhase) * 0.04 * this.#moveIntensity
      bodyPitch = hopPhase * 0.04 * this.#moveIntensity
    } else if (this.#species === 'penguin') {
      // Penguin: cute waddling motion side to side
      this.#hopOffset = Math.abs(Math.sin(this.#walkCycle)) * 0.02 * this.#moveIntensity
      bodyRoll = Math.sin(this.#walkCycle) * 0.14 * this.#moveIntensity
    } else {
      // Cat / Fox / Shiba: smooth, subtle 4-legged trot (not jittery)
      this.#hopOffset = Math.abs(Math.sin(this.#walkCycle)) * 0.02 * this.#moveIntensity
      bodyRoll = Math.sin(this.#walkCycle * 0.5) * 0.03 * this.#moveIntensity
    }

    // Happy reaction (gentle spin + soft hop)
    let happyRotation = 0
    if (this.#happyTimer > 0) {
      this.#happyTimer -= dt
      const tNorm = 1.0 - this.#happyTimer / 1.6
      happyRotation = tNorm * Math.PI * 2
      this.#hopOffset += Math.sin(tNorm * Math.PI) * 0.08
    }

    // Apply transforms
    this.#group.position.set(this.#x, this.#y + this.#hopOffset, this.#z)
    this.#group.rotation.set(bodyPitch, this.#yaw + happyRotation, bodyRoll)

    // Dynamic procedural body animations
    this.#animateModelParts()
  }

  #animateModelParts(): void {
    const t = this.#animTime

    // Tail wagging
    if (this.#tailMesh) {
      const wagSpeed = this.#isMoving || this.#happyTimer > 0 ? 8.0 : 3.0
      const wagAngle = this.#isMoving ? 0.22 : 0.1
      this.#tailMesh.rotation.y = Math.sin(t * wagSpeed) * wagAngle
      this.#tailMesh.rotation.x = -0.5 + Math.sin(t * 2) * 0.05
    }

    // Head breathing & tilt
    if (this.#headMesh) {
      this.#headMesh.position.y = 0.48 + Math.sin(t * 2) * 0.008
      this.#headMesh.rotation.z = Math.sin(t * 1.2) * 0.04
      if (this.#happyTimer > 0) {
        this.#headMesh.rotation.x = -0.15 + Math.sin(t * 6) * 0.05
      } else {
        this.#headMesh.rotation.x = this.#isMoving ? 0.04 : -0.02
      }
    }

    // Ears twitching
    if (this.#leftEar && this.#rightEar) {
      const twitch = Math.sin(t * 1.5) > 0.9 ? Math.sin(t * 15) * 0.08 : 0
      this.#leftEar.rotation.x = twitch
      this.#rightEar.rotation.x = -twitch
    }

    // Penguin flippers
    if (this.#wingLeft && this.#wingRight) {
      const flap = this.#isMoving || this.#happyTimer > 0 ? Math.sin(t * 8) * 0.25 : 0.05
      this.#wingLeft.rotation.z = 0.2 + flap
      this.#wingRight.rotation.z = -0.2 - flap
    }
  }

  #buildSpeciesMesh(species: CompanionSpecies): void {
    switch (species) {
      case 'dragon':
        this.#buildDragon()
        break
      case 'fox':
        this.#buildFox()
        break
      case 'cat':
        this.#buildCat()
        break
      case 'shiba':
        this.#buildShiba()
        break
      case 'bunny':
        this.#buildBunny()
        break
      case 'penguin':
        this.#buildPenguin()
        break
    }
  }

  // ---------------------------------------------------------------------------
  // 0. Baby Dragon (Ryuu)
  // ---------------------------------------------------------------------------
  #buildDragon(): void {
    const dragonMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.7 })
    const bellyMat = new THREE.MeshStandardMaterial({ color: 0xa7f3d0, roughness: 0.85 })
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 })
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.3 })
    const eyeHighlightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 })
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      roughness: 0.6,
      side: THREE.DoubleSide,
    })

    // Body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), dragonMat)
    body.position.set(0, 0.22, 0)
    body.scale.set(0.95, 1.1, 0.95)
    body.castShadow = true
    this.#modelContainer.add(body)

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), bellyMat)
    belly.position.set(0, 0.2, 0.08)
    belly.scale.set(0.85, 1.0, 0.5)
    this.#modelContainer.add(belly)

    // Head
    const head = new THREE.Group()
    head.position.set(0, 0.44, 0.04)

    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), dragonMat)
    head.add(headSphere)

    // Cute Snout
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), dragonMat)
    snout.position.set(0, -0.03, 0.1)
    snout.scale.set(1.0, 0.75, 1.1)
    head.add(snout)

    // Cute Little Golden Horns
    const hornGeo = new THREE.ConeGeometry(0.025, 0.08, 5)
    const hornL = new THREE.Mesh(hornGeo, hornMat)
    hornL.position.set(-0.07, 0.14, -0.03)
    hornL.rotation.z = 0.25
    hornL.rotation.x = -0.3
    const hornR = hornL.clone()
    hornR.position.set(0.07, 0.14, -0.03)
    hornR.rotation.z = -0.25
    hornR.rotation.x = -0.3
    head.add(hornL)
    head.add(hornR)

    // Eyes with highlights
    const eyeGeo = new THREE.SphereGeometry(0.022, 8, 8)
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
    eyeL.position.set(-0.06, 0.02, 0.12)
    const eyeR = eyeL.clone()
    eyeR.position.set(0.06, 0.02, 0.12)
    const hiL = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), eyeHighlightMat)
    hiL.position.set(-0.052, 0.028, 0.135)
    const hiR = hiL.clone()
    hiR.position.set(0.068, 0.028, 0.135)

    head.add(eyeL)
    head.add(eyeR)
    head.add(hiL)
    head.add(hiR)

    this.#headMesh = head
    this.#modelContainer.add(head)

    // Wings
    const wingGeo = new THREE.PlaneGeometry(0.18, 0.14)
    this.#wingLeft = new THREE.Mesh(wingGeo, wingMat)
    this.#wingLeft.position.set(-0.14, 0.28, -0.08)
    this.#wingLeft.rotation.y = 0.5
    this.#wingRight = new THREE.Mesh(wingGeo, wingMat)
    this.#wingRight.position.set(0.14, 0.28, -0.08)
    this.#wingRight.rotation.y = -0.5
    this.#modelContainer.add(this.#wingLeft)
    this.#modelContainer.add(this.#wingRight)

    // Tail
    const tailGroup = new THREE.Group()
    tailGroup.position.set(0, 0.16, -0.16)
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.2, 6), dragonMat)
    tail.rotation.x = -Math.PI / 3
    tailGroup.add(tail)
    const spade = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 3), hornMat)
    spade.position.set(0, 0.1, -0.16)
    spade.rotation.x = -Math.PI / 3
    tailGroup.add(spade)
    this.#tailMesh = tailGroup
    this.#modelContainer.add(tailGroup)
  }

  // ---------------------------------------------------------------------------
  // 1. Kitsune / Golden Fox
  // ---------------------------------------------------------------------------
  #buildFox(): void {
    const furMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.85 })
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.9 })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1f1610, roughness: 0.7 })
    const bandanaMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.6 })

    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.38, 10), furMat)
    body.position.set(0, 0.2, 0)
    body.castShadow = true
    this.#modelContainer.add(body)

    // Chest patch
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.1), creamMat)
    chest.position.set(0, 0.2, 0.13)
    this.#modelContainer.add(chest)

    // Bandana
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 6, 12), bandanaMat)
    scarf.position.set(0, 0.37, 0)
    scarf.rotation.x = Math.PI / 2
    this.#modelContainer.add(scarf)

    // Head
    const head = new THREE.Group()
    head.position.set(0, 0.48, 0.04)
    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), furMat)
    headSphere.castShadow = true
    head.add(headSphere)

    // Snout & Nose
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.075, 0.11, 8), creamMat)
    snout.position.set(0, -0.03, 0.16)
    snout.rotation.x = Math.PI / 2
    head.add(snout)

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 6), darkMat)
    nose.position.set(0, -0.01, 0.22)
    head.add(nose)

    // Eyes
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), darkMat)
    leftEye.position.set(-0.06, 0.02, 0.14)
    const rightEye = leftEye.clone()
    rightEye.position.set(0.06, 0.02, 0.14)
    head.add(leftEye)
    head.add(rightEye)

    // Pointy Fox Ears
    const earGeo = new THREE.ConeGeometry(0.06, 0.13, 4)
    this.#leftEar = new THREE.Mesh(earGeo, furMat)
    this.#leftEar.position.set(-0.09, 0.16, 0)
    this.#leftEar.rotation.z = 0.25

    this.#rightEar = new THREE.Mesh(earGeo, furMat)
    this.#rightEar.position.set(0.09, 0.16, 0)
    this.#rightEar.rotation.z = -0.25

    head.add(this.#leftEar)
    head.add(this.#rightEar)

    this.#headMesh = head
    this.#modelContainer.add(head)

    // Fluffy Tail
    const tailGroup = new THREE.Group()
    tailGroup.position.set(0, 0.16, -0.16)
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), furMat)
    tail.scale.set(0.8, 1.4, 0.8)
    tail.rotation.x = -Math.PI / 3
    tailGroup.add(tail)

    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), creamMat)
    tailTip.position.set(0, 0.12, -0.08)
    tailGroup.add(tailTip)

    this.#tailMesh = tailGroup
    this.#modelContainer.add(tailGroup)
  }

  // ---------------------------------------------------------------------------
  // 2. Calico / Kawaii Neko
  // ---------------------------------------------------------------------------
  #buildCat(): void {
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.85 })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
    const collarMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.5 })
    const bellMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.8,
      roughness: 0.3,
    })

    // Round Plump Body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 10), whiteMat)
    body.position.set(0, 0.2, 0)
    body.scale.set(0.9, 1.1, 0.9)
    body.castShadow = true
    this.#modelContainer.add(body)

    // Calico Patch on Back
    const patch = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), orangeMat)
    patch.position.set(-0.06, 0.24, -0.08)
    this.#modelContainer.add(patch)

    const darkPatch = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), darkMat)
    darkPatch.position.set(0.07, 0.18, -0.07)
    this.#modelContainer.add(darkPatch)

    // Collar + Golden Bell
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 12), collarMat)
    collar.position.set(0, 0.35, 0)
    collar.rotation.x = Math.PI / 2
    this.#modelContainer.add(collar)

    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), bellMat)
    bell.position.set(0, 0.33, 0.16)
    this.#modelContainer.add(bell)

    // Head
    const head = new THREE.Group()
    head.position.set(0, 0.46, 0.04)
    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), whiteMat)
    head.add(headSphere)

    // Orange patch over one eye
    const headPatch = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), orangeMat)
    headPatch.position.set(0.06, 0.05, 0.08)
    head.add(headPatch)

    // Cute Triangle Cat Ears
    const earGeo = new THREE.ConeGeometry(0.05, 0.09, 4)
    this.#leftEar = new THREE.Mesh(earGeo, whiteMat)
    this.#leftEar.position.set(-0.08, 0.13, 0)
    this.#leftEar.rotation.z = 0.2

    this.#rightEar = new THREE.Mesh(earGeo, orangeMat)
    this.#rightEar.position.set(0.08, 0.13, 0)
    this.#rightEar.rotation.z = -0.2
    head.add(this.#leftEar)
    head.add(this.#rightEar)

    // Tiny pink nose & eyes
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.6 })
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.02, 3), noseMat)
    nose.position.set(0, -0.02, 0.15)
    nose.rotation.x = Math.PI / 2
    head.add(nose)

    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), darkMat)
    leftEye.position.set(-0.055, 0.01, 0.14)
    const rightEye = leftEye.clone()
    rightEye.position.set(0.055, 0.01, 0.14)
    head.add(leftEye)
    head.add(rightEye)

    this.#headMesh = head
    this.#modelContainer.add(head)

    // Slender Curled Tail
    const tailGroup = new THREE.Group()
    tailGroup.position.set(0, 0.16, -0.16)
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI * 0.9), darkMat)
    tail.rotation.y = Math.PI / 2
    tail.rotation.z = 0.5
    tailGroup.add(tail)

    this.#tailMesh = tailGroup
    this.#modelContainer.add(tailGroup)
  }

  // ---------------------------------------------------------------------------
  // 3. Shiba Inu
  // ---------------------------------------------------------------------------
  #buildShiba(): void {
    const shibaMat = new THREE.MeshStandardMaterial({ color: 0xc2782b, roughness: 0.85 })
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xffedd5, roughness: 0.9 })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1f1610, roughness: 0.7 })

    // Sturdy Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.38, 10), shibaMat)
    body.position.set(0, 0.2, 0)
    body.castShadow = true
    this.#modelContainer.add(body)

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.12), creamMat)
    chest.position.set(0, 0.2, 0.12)
    this.#modelContainer.add(chest)

    // Head
    const head = new THREE.Group()
    head.position.set(0, 0.48, 0.04)
    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), shibaMat)
    head.add(headSphere)

    // Shiba Chubby Cheeks
    const cheeks = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), creamMat)
    cheeks.position.set(0, -0.04, 0.08)
    cheeks.scale.set(1.2, 0.8, 1.0)
    head.add(cheeks)

    // Shiba White Eyebrow Dots
    const dotL = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), creamMat)
    dotL.position.set(-0.06, 0.09, 0.13)
    const dotR = dotL.clone()
    dotR.position.set(0.06, 0.09, 0.13)
    head.add(dotL)
    head.add(dotR)

    // Snout & Dark Nose
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), creamMat)
    snout.position.set(0, -0.03, 0.16)
    head.add(snout)

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), darkMat)
    nose.position.set(0, -0.01, 0.22)
    head.add(nose)

    // Eyes
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), darkMat)
    leftEye.position.set(-0.06, 0.03, 0.15)
    const rightEye = leftEye.clone()
    rightEye.position.set(0.06, 0.03, 0.15)
    head.add(leftEye)
    head.add(rightEye)

    // Perky Triangle Ears
    const earGeo = new THREE.ConeGeometry(0.05, 0.1, 4)
    this.#leftEar = new THREE.Mesh(earGeo, shibaMat)
    this.#leftEar.position.set(-0.09, 0.14, 0)
    this.#leftEar.rotation.z = 0.2

    this.#rightEar = new THREE.Mesh(earGeo, shibaMat)
    this.#rightEar.position.set(0.09, 0.14, 0)
    this.#rightEar.rotation.z = -0.2

    head.add(this.#leftEar)
    head.add(this.#rightEar)

    this.#headMesh = head
    this.#modelContainer.add(head)

    // Donut Curled Tail
    const tailGroup = new THREE.Group()
    tailGroup.position.set(0, 0.22, -0.16)
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.04, 8, 12), shibaMat)
    tail.rotation.y = Math.PI / 2
    tail.rotation.x = 0.3
    tailGroup.add(tail)

    this.#tailMesh = tailGroup
    this.#modelContainer.add(tailGroup)
  }

  // ---------------------------------------------------------------------------
  // 4. Marshmallow Bunny
  // ---------------------------------------------------------------------------
  #buildBunny(): void {
    const furMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.95 })
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xfda4af, roughness: 0.8 })
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.4 })

    // Round Fluffy Body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), furMat)
    body.position.set(0, 0.18, 0)
    body.scale.set(0.9, 0.9, 1.1)
    body.castShadow = true
    this.#modelContainer.add(body)

    // Head
    const head = new THREE.Group()
    head.position.set(0, 0.44, 0.04)
    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), furMat)
    head.add(headSphere)

    // Long Bunny Ears
    const earGeo = new THREE.CylinderGeometry(0.03, 0.045, 0.24, 8)
    earGeo.scale(0.6, 1.0, 1.0)
    this.#leftEar = new THREE.Mesh(earGeo, furMat)
    this.#leftEar.position.set(-0.06, 0.2, -0.02)
    this.#leftEar.rotation.z = 0.12

    const innerEarL = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.18), pinkMat)
    innerEarL.position.set(-0.06, 0.2, 0.015)
    head.add(innerEarL)

    this.#rightEar = new THREE.Mesh(earGeo, furMat)
    this.#rightEar.position.set(0.06, 0.2, -0.02)
    this.#rightEar.rotation.z = -0.12

    const innerEarR = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.18), pinkMat)
    innerEarR.position.set(0.06, 0.2, 0.015)
    head.add(innerEarR)

    head.add(this.#leftEar)
    head.add(this.#rightEar)

    // Ruby Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), eyeMat)
    eyeL.position.set(-0.07, 0.01, 0.12)
    const eyeR = eyeL.clone()
    eyeR.position.set(0.07, 0.01, 0.12)
    head.add(eyeL)
    head.add(eyeR)

    // Tiny pink nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), pinkMat)
    nose.position.set(0, -0.03, 0.15)
    head.add(nose)

    this.#headMesh = head
    this.#modelContainer.add(head)

    // Cotton Ball Tail
    const tailGroup = new THREE.Group()
    tailGroup.position.set(0, 0.16, -0.18)
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), furMat)
    tailGroup.add(tail)
    this.#tailMesh = tailGroup
    this.#modelContainer.add(tailGroup)
  }

  // ---------------------------------------------------------------------------
  // 5. Chibi Penguin (Redesigned & Super Cute)
  // ---------------------------------------------------------------------------
  #buildPenguin(): void {
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 })
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.2 })
    const eyeHighlightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 })
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.6 })

    // 1. Plump Oval Body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), darkMat)
    body.position.set(0, 0.22, 0)
    body.scale.set(0.95, 1.15, 0.9)
    body.castShadow = true
    this.#modelContainer.add(body)

    // 2. Clean White Belly Patch
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), whiteMat)
    belly.position.set(0, 0.21, 0.07)
    belly.scale.set(0.82, 1.05, 0.5)
    this.#modelContainer.add(belly)

    // 3. Cyan Cozy Winter Scarf
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 16), scarfMat)
    scarf.position.set(0, 0.35, 0)
    scarf.rotation.x = Math.PI / 2
    this.#modelContainer.add(scarf)

    // Scarf tail
    const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.02), scarfMat)
    scarfTail.position.set(0.08, 0.28, 0.14)
    scarfTail.rotation.z = -0.2
    this.#modelContainer.add(scarfTail)

    // 4. Distinct Round Chibi Head
    const head = new THREE.Group()
    head.position.set(0, 0.44, 0.02)

    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 14), darkMat)
    headSphere.castShadow = true
    head.add(headSphere)

    // White Face Mask
    const faceMask = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 12), whiteMat)
    faceMask.position.set(0, -0.015, 0.05)
    faceMask.scale.set(0.85, 0.8, 0.6)
    head.add(faceMask)

    // Big Cute Eyes
    const eyeGeo = new THREE.SphereGeometry(0.022, 8, 8)
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
    eyeL.position.set(-0.045, 0.01, 0.115)
    const eyeR = eyeL.clone()
    eyeR.position.set(0.045, 0.01, 0.115)

    // White Specular Highlights
    const hiGeo = new THREE.SphereGeometry(0.008, 6, 6)
    const hiL = new THREE.Mesh(hiGeo, eyeHighlightMat)
    hiL.position.set(-0.04, 0.018, 0.13)
    const hiR = hiL.clone()
    hiR.position.set(0.05, 0.018, 0.13)

    head.add(eyeL)
    head.add(eyeR)
    head.add(hiL)
    head.add(hiR)

    // Cute Orange Triangular Beak
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.065, 4), orangeMat)
    beak.position.set(0, -0.02, 0.145)
    beak.rotation.x = Math.PI / 2
    head.add(beak)

    this.#headMesh = head
    this.#modelContainer.add(head)

    // 5. Side Flippers
    const flipperGeo = new THREE.BoxGeometry(0.03, 0.16, 0.08)
    this.#wingLeft = new THREE.Mesh(flipperGeo, darkMat)
    this.#wingLeft.position.set(-0.17, 0.22, 0)
    this.#wingLeft.rotation.z = 0.25

    this.#wingRight = new THREE.Mesh(flipperGeo, darkMat)
    this.#wingRight.position.set(0.17, 0.22, 0)
    this.#wingRight.rotation.z = -0.25

    this.#modelContainer.add(this.#wingLeft)
    this.#modelContainer.add(this.#wingRight)

    // 6. Cute Webbed Feet
    const footGeo = new THREE.BoxGeometry(0.07, 0.025, 0.11)
    const footL = new THREE.Mesh(footGeo, orangeMat)
    footL.position.set(-0.07, 0.02, 0.06)
    const footR = footL.clone()
    footR.position.set(0.07, 0.02, 0.06)
    this.#modelContainer.add(footL)
    this.#modelContainer.add(footR)
  }

  dispose(): void {
    this.#nameTag?.dispose()
    if (this.#group.parent) {
      this.#group.parent.remove(this.#group)
    }
  }
}
