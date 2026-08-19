import * as THREE from 'three/webgpu'
import type { PlacedProp } from '@chill/protocol'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import { sampleHeight } from '@/engine/terrain/HeightFieldCpu'
import { VolleyballCourt } from './VolleyballCourt'

export type PropType =
  | 'campfire'
  | 'firework'
  | 'sign'
  | 'lantern'
  | 'bench'
  | 'tent'
  | 'tea_table'
  | 'sakura_pot'
  | 'radio'
  | 'zen_stones'
  | 'volleyball_court'
  | 'skeet_stand'
  | 'companion'
  | 'quote_billboard'

export type LocalPropPlacement = {
  type: PropType
  x: number
  y: number
  z: number
  yaw: number
  text?: string
  authorName?: string
}

// Particle for active fireworks
type FireworkRocket = {
  mesh: THREE.Mesh
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  flightTimeS: number
  maxFlightTimeS: number
  targetY: number
  color: THREE.Color
  trail: THREE.Points
  trailPositions: Float32Array
  trailCount: number
  dead: boolean
}

type SparkParticle = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  color: THREE.Color
  alpha: number
  lifeS: number
  maxLifeS: number
}

type ActiveFireworkBurst = {
  points: THREE.Points
  geometry: THREE.BufferGeometry
  particles: SparkParticle[]
  dead: boolean
}

type AmbientParticleEffect = {
  propId: string
  points: THREE.Points
  geometry: THREE.BufferGeometry
  positions: Float32Array
  velocities: Float32Array
  type: 'sakura' | 'steam' | 'music'
}

type PlacedPropInstance = {
  data: PlacedProp
  group: THREE.Group
  active: boolean
  flameMesh?: THREE.Mesh
  innerFlameMesh?: THREE.Mesh
  paperMesh?: THREE.Mesh
  radioMesh?: THREE.Mesh
  light?: THREE.PointLight
  canvasTex?: THREE.CanvasTexture
  effect?: AmbientParticleEffect
  volleyballCourt?: VolleyballCourt
  createdAtS: number
}

const MAX_ACTIVE_PROPS = 40

export class PropField {
  readonly group = new THREE.Group()

  #props = new Map<string, PlacedPropInstance>()
  #volleyballCourt: VolleyballCourt | null = null
  #rockets: FireworkRocket[] = []
  #bursts: ActiveFireworkBurst[] = []

  // Shared Geometries & Materials
  #stoneGeo = new THREE.DodecahedronGeometry(0.12, 0)
  #logGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.7, 6)
  #flameGeo = new THREE.ConeGeometry(0.22, 0.55, 7)
  #postGeo = new THREE.CylinderGeometry(0.04, 0.05, 1.1, 6)
  #signBoardGeo = new THREE.BoxGeometry(0.9, 0.42, 0.04)
  #lanternPostGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6)
  #lanternHeadGeo = new THREE.BoxGeometry(0.32, 0.38, 0.32)
  #benchLegGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.38, 6)
  #benchPlankGeo = new THREE.BoxGeometry(1.2, 0.09, 0.38)

  // Geometries for new props
  #tentFabricGeo = new THREE.ConeGeometry(1.3, 1.4, 4, 1, true)
  #tentPoleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5)
  #teaTableGeo = new THREE.CylinderGeometry(0.48, 0.52, 0.22, 16)
  #cushionGeo = new THREE.CylinderGeometry(0.24, 0.26, 0.08, 12)
  #teapotGeo = new THREE.SphereGeometry(0.08, 8, 8)
  #cupGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.06, 8)
  #potGeo = new THREE.CylinderGeometry(0.24, 0.18, 0.16, 12)
  #bonsaiTrunkGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.45, 6)
  #bonsaiFoliageGeo = new THREE.DodecahedronGeometry(0.28, 1)
  #radioBoxGeo = new THREE.BoxGeometry(0.38, 0.24, 0.18)

  #stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a544f, roughness: 0.9 })
  #woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1b, roughness: 0.85 })
  #darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x2e1a0e, roughness: 0.85 })
  #fireMat = new THREE.MeshBasicMaterial({ color: 0xff6600 })
  #lanternPaperMat = new THREE.MeshBasicMaterial({ color: 0xffe088 })
  #darkPaperMat = new THREE.MeshBasicMaterial({ color: 0x333333 })
  #mortarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 })

  #tentFabricMat = new THREE.MeshStandardMaterial({
    color: 0x4a5d4e,
    roughness: 0.8,
    side: THREE.DoubleSide,
  })
  #cushionMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 })
  #sakuraFoliageMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.6 })
  #radioMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5 })
  #ceramicMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3 })

  constructor(scene: THREE.Scene) {
    scene.add(this.group)
  }

  get volleyballCourt(): VolleyballCourt | null {
    return this.#volleyballCourt
  }

  addProp(data: PlacedProp, terrain?: HeightSpec): void {
    if (this.#props.has(data.id)) return

    // Limit checks: Volleyball court max 1, Tea table max 4
    if (data.type === 'volleyball_court' && this.#volleyballCourt) {
      this.removeProp(this.#volleyballCourt.id)
    }

    if (this.#props.size >= MAX_ACTIVE_PROPS) {
      const oldestId = this.#props.keys().next().value
      if (oldestId) this.removeProp(oldestId)
    }

    const groundY = terrain ? sampleHeight(terrain, data.x, data.z) : data.y
    const propGroup = new THREE.Group()
    propGroup.position.set(data.x, groundY, data.z)
    propGroup.rotation.y = data.yaw

    let flameMesh: THREE.Mesh | undefined
    let innerFlameMesh: THREE.Mesh | undefined
    let paperMesh: THREE.Mesh | undefined
    let radioMesh: THREE.Mesh | undefined
    let light: THREE.PointLight | undefined
    let canvasTex: THREE.CanvasTexture | undefined
    let effect: AmbientParticleEffect | undefined
    let volleyballCourt: VolleyballCourt | undefined
    const isActive = data.active !== undefined ? data.active : true

    switch (data.type) {
      case 'campfire': {
        const stoneCount = 9
        const radius = 0.38
        for (let i = 0; i < stoneCount; i++) {
          const angle = (i / stoneCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.2
          const stone = new THREE.Mesh(this.#stoneGeo, this.#stoneMat)
          stone.position.set(Math.cos(angle) * radius, 0.05, Math.sin(angle) * radius)
          stone.rotation.set(Math.random(), Math.random(), Math.random())
          const s = 0.8 + Math.random() * 0.4
          stone.scale.set(s, s * 0.7, s)
          stone.castShadow = true
          propGroup.add(stone)
        }

        const log1 = new THREE.Mesh(this.#logGeo, this.#woodMat)
        log1.position.set(0, 0.08, 0)
        log1.rotation.set(Math.PI / 2, 0, 0.5)
        log1.castShadow = true
        propGroup.add(log1)

        const log2 = new THREE.Mesh(this.#logGeo, this.#woodMat)
        log2.position.set(0, 0.1, 0)
        log2.rotation.set(Math.PI / 2, 0, -0.65)
        log2.castShadow = true
        propGroup.add(log2)

        const log3 = new THREE.Mesh(this.#logGeo, this.#woodMat)
        log3.position.set(0, 0.12, 0)
        log3.rotation.set(Math.PI / 2, 0, 1.6)
        log3.castShadow = true
        propGroup.add(log3)

        flameMesh = new THREE.Mesh(this.#flameGeo, this.#fireMat)
        flameMesh.position.set(0, 0.28, 0)
        flameMesh.visible = isActive
        propGroup.add(flameMesh)

        innerFlameMesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.12, 0.38, 6),
          new THREE.MeshBasicMaterial({ color: 0xffea77 }),
        )
        innerFlameMesh.position.set(0, 0.22, 0)
        innerFlameMesh.visible = isActive
        propGroup.add(innerFlameMesh)

        light = new THREE.PointLight(0xff6611, isActive ? 2.2 : 0, 7.5, 1.8)
        light.position.set(0, 0.45, 0)
        light.visible = isActive
        propGroup.add(light)
        break
      }

      case 'firework': {
        const mortarGroup = new THREE.Group()
        const mortar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.09, 0.45, 8),
          this.#mortarMat,
        )
        mortar.position.set(0, 0.225, 0)
        mortar.castShadow = true
        mortarGroup.add(mortar)
        // Tilt mortar 30 degrees forward from vertical (60 degrees elevation forward from ground)
        mortarGroup.rotation.x = Math.PI / 6
        propGroup.add(mortarGroup)

        const base = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.36), this.#mortarMat)
        base.position.set(0, 0.02, 0)
        propGroup.add(base)

        this.#launchRocket(data.x, groundY + 0.45, data.z, data.yaw)
        break
      }

      case 'sign': {
        const post = new THREE.Mesh(this.#postGeo, this.#darkWoodMat)
        post.position.set(0, 0.55, 0)
        post.castShadow = true
        propGroup.add(post)

        const canvas = document.createElement('canvas')
        canvas.width = 1024
        canvas.height = 512
        drawSignCanvas(canvas, data.text || 'Cozy Spot', data.authorName)

        canvasTex = new THREE.CanvasTexture(canvas)
        canvasTex.colorSpace = THREE.SRGBColorSpace
        canvasTex.generateMipmaps = true
        canvasTex.minFilter = THREE.LinearMipmapLinearFilter
        canvasTex.magFilter = THREE.LinearFilter
        canvasTex.anisotropy = 16

        const signMat = new THREE.MeshStandardMaterial({
          map: canvasTex,
          roughness: 0.8,
        })

        const board = new THREE.Mesh(this.#signBoardGeo, signMat)
        board.position.set(0, 0.82, 0.03)
        board.castShadow = true
        propGroup.add(board)
        break
      }

      case 'lantern': {
        const post = new THREE.Mesh(this.#lanternPostGeo, this.#darkWoodMat)
        post.position.set(0, 0.45, 0)
        post.castShadow = true
        propGroup.add(post)

        const frame = new THREE.Mesh(this.#lanternHeadGeo, this.#darkWoodMat)
        frame.position.set(0, 0.95, 0)
        frame.castShadow = true
        propGroup.add(frame)

        paperMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.28, 0.24),
          isActive ? this.#lanternPaperMat : this.#darkPaperMat,
        )
        paperMesh.position.set(0, 0.95, 0)
        propGroup.add(paperMesh)

        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.16, 4), this.#darkWoodMat)
        roof.position.set(0, 1.2, 0)
        roof.rotation.y = Math.PI / 4
        propGroup.add(roof)

        light = new THREE.PointLight(0xffb84d, isActive ? 1.8 : 0, 6.0, 1.5)
        light.position.set(0, 0.95, 0)
        light.visible = isActive
        propGroup.add(light)
        break
      }

      case 'bench': {
        const legLeft = new THREE.Mesh(this.#benchLegGeo, this.#woodMat)
        legLeft.position.set(-0.42, 0.19, 0)
        legLeft.castShadow = true
        propGroup.add(legLeft)

        const legRight = new THREE.Mesh(this.#benchLegGeo, this.#woodMat)
        legRight.position.set(0.42, 0.19, 0)
        legRight.castShadow = true
        propGroup.add(legRight)

        const plank = new THREE.Mesh(this.#benchPlankGeo, this.#woodMat)
        plank.position.set(0, 0.38, 0)
        plank.castShadow = true
        propGroup.add(plank)
        break
      }

      case 'tent': {
        const tent = new THREE.Mesh(this.#tentFabricGeo, this.#tentFabricMat)
        tent.position.set(0, 0.7, 0)
        tent.rotation.y = Math.PI / 4
        tent.scale.set(1.1, 1.0, 1.3)
        tent.castShadow = true
        propGroup.add(tent)

        const pole1 = new THREE.Mesh(this.#tentPoleGeo, this.#woodMat)
        pole1.position.set(-0.6, 0.7, 0.6)
        pole1.rotation.z = -0.3
        propGroup.add(pole1)

        const pole2 = new THREE.Mesh(this.#tentPoleGeo, this.#woodMat)
        pole2.position.set(0.6, 0.7, 0.6)
        pole2.rotation.z = 0.3
        propGroup.add(pole2)

        paperMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 0.18, 0.15),
          isActive ? this.#lanternPaperMat : this.#darkPaperMat,
        )
        paperMesh.position.set(0, 0.35, 0)
        propGroup.add(paperMesh)

        light = new THREE.PointLight(0xffa238, isActive ? 1.6 : 0, 5.0, 1.5)
        light.position.set(0, 0.4, 0)
        light.visible = isActive
        propGroup.add(light)
        break
      }

      case 'tea_table': {
        const table = new THREE.Mesh(this.#teaTableGeo, this.#darkWoodMat)
        table.position.set(0, 0.11, 0)
        table.castShadow = true
        propGroup.add(table)

        // 2 Cushions: Left (Seat 0) and Right (Seat 1)
        const c1 = new THREE.Mesh(this.#cushionGeo, this.#cushionMat)
        c1.position.set(-0.65, 0.04, 0)
        propGroup.add(c1)

        const c2 = new THREE.Mesh(this.#cushionGeo, this.#cushionMat)
        c2.position.set(0.65, 0.04, 0)
        propGroup.add(c2)

        const teapot = new THREE.Mesh(this.#teapotGeo, this.#ceramicMat)
        teapot.position.set(-0.12, 0.28, 0)
        propGroup.add(teapot)

        const cup1 = new THREE.Mesh(this.#cupGeo, this.#ceramicMat)
        cup1.position.set(-0.25, 0.25, 0)
        propGroup.add(cup1)

        const cup2 = new THREE.Mesh(this.#cupGeo, this.#ceramicMat)
        cup2.position.set(0.25, 0.25, 0)
        propGroup.add(cup2)

        effect = this.#createParticleEffect(data.id, 0, 0.32, 0, 'steam')
        if (effect) propGroup.add(effect.points)
        break
      }

      case 'sakura_pot': {
        const pot = new THREE.Mesh(this.#potGeo, this.#ceramicMat)
        pot.position.set(0, 0.08, 0)
        pot.castShadow = true
        propGroup.add(pot)

        const trunk = new THREE.Mesh(this.#bonsaiTrunkGeo, this.#woodMat)
        trunk.position.set(0, 0.32, 0)
        trunk.rotation.z = 0.15
        propGroup.add(trunk)

        const fol1 = new THREE.Mesh(this.#bonsaiFoliageGeo, this.#sakuraFoliageMat)
        fol1.position.set(0.08, 0.58, 0)
        propGroup.add(fol1)

        const fol2 = new THREE.Mesh(this.#bonsaiFoliageGeo, this.#sakuraFoliageMat)
        fol2.position.set(-0.12, 0.52, 0.08)
        fol2.scale.set(0.75, 0.75, 0.75)
        propGroup.add(fol2)

        effect = this.#createParticleEffect(data.id, 0, 0.6, 0, 'sakura')
        if (effect) propGroup.add(effect.points)
        break
      }

      case 'radio': {
        radioMesh = new THREE.Mesh(this.#radioBoxGeo, this.#radioMat)
        radioMesh.position.set(0, 0.16, 0)
        radioMesh.castShadow = true
        propGroup.add(radioMesh)

        const dial = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12),
          this.#ceramicMat,
        )
        dial.position.set(0.1, 0.16, 0.09)
        dial.rotation.x = Math.PI / 2
        propGroup.add(dial)

        const antenna = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4),
          this.#stoneMat,
        )
        antenna.position.set(-0.12, 0.42, -0.05)
        antenna.rotation.z = -0.3
        propGroup.add(antenna)

        if (isActive) {
          effect = this.#createParticleEffect(data.id, 0, 0.38, 0, 'music')
          if (effect) propGroup.add(effect.points)
        }
        break
      }

      case 'zen_stones': {
        const st1 = new THREE.Mesh(this.#stoneGeo, this.#stoneMat)
        st1.position.set(0, 0.1, 0)
        st1.scale.set(1.4, 0.7, 1.3)
        st1.castShadow = true
        propGroup.add(st1)

        const st2 = new THREE.Mesh(this.#stoneGeo, this.#stoneMat)
        st2.position.set(0, 0.24, 0)
        st2.scale.set(1.1, 0.6, 1.0)
        st2.rotation.y = 0.8
        st2.castShadow = true
        propGroup.add(st2)

        const st3 = new THREE.Mesh(this.#stoneGeo, this.#stoneMat)
        st3.position.set(0, 0.36, 0)
        st3.scale.set(0.8, 0.5, 0.75)
        st3.rotation.y = -0.4
        st3.castShadow = true
        propGroup.add(st3)
        break
      }

      case 'companion': {
        const companionGroup = new THREE.Group()
        const furMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.85 })
        const creamMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.9 })
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2e1a0e, roughness: 0.7 })
        const bandanaMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.6 })

        // Body (sitting upright)
        const bodyGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.42, 10)
        const bodyMesh = new THREE.Mesh(bodyGeo, furMat)
        bodyMesh.position.set(0, 0.22, 0)
        bodyMesh.castShadow = true
        companionGroup.add(bodyMesh)

        // Chest white patch
        const chestGeo = new THREE.BoxGeometry(0.18, 0.28, 0.12)
        const chestMesh = new THREE.Mesh(chestGeo, creamMat)
        chestMesh.position.set(0, 0.22, 0.14)
        companionGroup.add(chestMesh)

        // Red Scarf / Bandana
        const scarfGeo = new THREE.TorusGeometry(0.19, 0.035, 6, 12)
        const scarfMesh = new THREE.Mesh(scarfGeo, bandanaMat)
        scarfMesh.position.set(0, 0.4, 0)
        scarfMesh.rotation.x = Math.PI / 2
        companionGroup.add(scarfMesh)

        // Head
        const headGeo = new THREE.SphereGeometry(0.18, 10, 10)
        const headMesh = new THREE.Mesh(headGeo, furMat)
        headMesh.position.set(0, 0.52, 0.04)
        headMesh.castShadow = true
        companionGroup.add(headMesh)

        // Snout
        const snoutGeo = new THREE.CylinderGeometry(0.04, 0.08, 0.12, 8)
        const snoutMesh = new THREE.Mesh(snoutGeo, creamMat)
        snoutMesh.position.set(0, 0.49, 0.2)
        snoutMesh.rotation.x = Math.PI / 2
        companionGroup.add(snoutMesh)

        // Nose
        const noseGeo = new THREE.SphereGeometry(0.03, 6, 6)
        const noseMesh = new THREE.Mesh(noseGeo, darkMat)
        noseMesh.position.set(0, 0.51, 0.26)
        companionGroup.add(noseMesh)

        // Ears
        const earGeo = new THREE.ConeGeometry(0.065, 0.14, 4)
        const leftEar = new THREE.Mesh(earGeo, furMat)
        leftEar.position.set(-0.11, 0.68, 0.02)
        leftEar.rotation.z = 0.2
        companionGroup.add(leftEar)

        const rightEar = new THREE.Mesh(earGeo, furMat)
        rightEar.position.set(0.11, 0.68, 0.02)
        rightEar.rotation.z = -0.2
        companionGroup.add(rightEar)

        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.022, 6, 6)
        const leftEye = new THREE.Mesh(eyeGeo, darkMat)
        leftEye.position.set(-0.065, 0.54, 0.18)
        companionGroup.add(leftEye)

        const rightEye = new THREE.Mesh(eyeGeo, darkMat)
        rightEye.position.set(0.065, 0.54, 0.18)
        companionGroup.add(rightEye)

        // Tail (curled up)
        const tailGeo = new THREE.CylinderGeometry(0.04, 0.07, 0.32, 6)
        const tailMesh = new THREE.Mesh(tailGeo, furMat)
        tailMesh.position.set(0, 0.24, -0.22)
        tailMesh.rotation.x = -0.7
        companionGroup.add(tailMesh)

        // White tail tip
        const tailTipGeo = new THREE.SphereGeometry(0.055, 6, 6)
        const tailTipMesh = new THREE.Mesh(tailTipGeo, creamMat)
        tailTipMesh.position.set(0, 0.36, -0.3)
        companionGroup.add(tailTipMesh)

        // Little front paws
        const pawGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.12, 6)
        const leftPaw = new THREE.Mesh(pawGeo, creamMat)
        leftPaw.position.set(-0.09, 0.06, 0.16)
        companionGroup.add(leftPaw)

        const rightPaw = new THREE.Mesh(pawGeo, creamMat)
        rightPaw.position.set(0.09, 0.06, 0.16)
        companionGroup.add(rightPaw)

        propGroup.add(companionGroup)
        break
      }

      case 'quote_billboard': {
        // Large Panoramic Daily Quote Billboard Stand (Width 3.4m)
        // Left & Right Wooden Posts
        const pillarGeo = new THREE.CylinderGeometry(0.08, 0.1, 2.2, 8)
        const leftPost = new THREE.Mesh(pillarGeo, this.#darkWoodMat)
        leftPost.position.set(-1.6, 1.1, 0)
        leftPost.castShadow = true
        propGroup.add(leftPost)

        const rightPost = new THREE.Mesh(pillarGeo, this.#darkWoodMat)
        rightPost.position.set(1.6, 1.1, 0)
        rightPost.castShadow = true
        propGroup.add(rightPost)

        // Crossbeams
        const beamGeo = new THREE.BoxGeometry(3.6, 0.1, 0.12)
        const topBeam = new THREE.Mesh(beamGeo, this.#darkWoodMat)
        topBeam.position.set(0, 2.15, 0)
        propGroup.add(topBeam)

        const botBeam = new THREE.Mesh(beamGeo, this.#darkWoodMat)
        botBeam.position.set(0, 0.65, 0)
        propGroup.add(botBeam)

        // Top Roof / Canopy Shade
        const roofGeo = new THREE.BoxGeometry(3.7, 0.08, 0.45)
        const roof = new THREE.Mesh(roofGeo, this.#woodMat)
        roof.position.set(0, 2.25, 0.08)
        roof.rotation.x = 0.15
        roof.castShadow = true
        propGroup.add(roof)

        // Overhead Lantern Light
        light = new THREE.PointLight(0xffedd5, 1.8, 7.0, 1.8)
        light.position.set(0, 2.1, 0.35)
        propGroup.add(light)

        // 2D Dynamic Canvas Texture (Ultra Crisp 2560x1024)
        const canvas = document.createElement('canvas')
        canvas.width = 2560
        canvas.height = 1024
        drawBillboardCanvas(
          canvas,
          data.text || 'Work hard, rest well, and take a moment to breathe.',
          data.authorName,
        )

        canvasTex = new THREE.CanvasTexture(canvas)
        canvasTex.colorSpace = THREE.SRGBColorSpace
        canvasTex.generateMipmaps = true
        canvasTex.minFilter = THREE.LinearMipmapLinearFilter
        canvasTex.magFilter = THREE.LinearFilter
        canvasTex.anisotropy = 16

        const billboardMat = new THREE.MeshStandardMaterial({
          map: canvasTex,
          roughness: 0.75,
        })

        const boardGeo = new THREE.BoxGeometry(3.4, 1.45, 0.06)
        const boardMesh = new THREE.Mesh(boardGeo, billboardMat)
        boardMesh.position.set(0, 1.4, 0.04)
        boardMesh.castShadow = true
        propGroup.add(boardMesh)
        break
      }

      case 'volleyball_court': {
        volleyballCourt = new VolleyballCourt(data.id, data.x, groundY, data.z, data.yaw)
        this.#volleyballCourt = volleyballCourt
        this.group.add(volleyballCourt.group)
        break
      }
    }

    if (data.type !== 'volleyball_court') {
      this.group.add(propGroup)
    }

    this.#props.set(data.id, {
      data,
      group: propGroup,
      active: isActive,
      flameMesh,
      innerFlameMesh,
      paperMesh,
      radioMesh,
      light,
      canvasTex,
      effect,
      volleyballCourt,
      createdAtS: performance.now() / 1000,
    })
  }

  #createParticleEffect(
    propId: string,
    originX: number,
    originY: number,
    originZ: number,
    type: 'sakura' | 'steam' | 'music',
  ): AmbientParticleEffect {
    const count = type === 'sakura' ? 24 : type === 'steam' ? 14 : 8
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = originX + (Math.random() - 0.5) * (type === 'sakura' ? 0.6 : 0.2)
      positions[i * 3 + 1] = originY + Math.random() * (type === 'sakura' ? 0.4 : 0.25)
      positions[i * 3 + 2] = originZ + (Math.random() - 0.5) * (type === 'sakura' ? 0.6 : 0.2)

      velocities[i * 3] = (Math.random() - 0.5) * 0.05
      velocities[i * 3 + 1] =
        type === 'sakura' ? -(0.06 + Math.random() * 0.08) : 0.08 + Math.random() * 0.12
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const color = type === 'sakura' ? 0xf472b6 : type === 'steam' ? 0xffffff : 0x38bdf8

    const material = new THREE.PointsMaterial({
      color,
      size: type === 'sakura' ? 0.08 : type === 'music' ? 0.12 : 0.06,
      transparent: true,
      opacity: type === 'steam' ? 0.45 : 0.85,
      blending: type === 'music' ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    })

    const points = new THREE.Points(geometry, material)
    return {
      propId,
      points,
      geometry,
      positions,
      velocities,
      type,
    }
  }

  toggleActive(propId: string, forcedActive?: boolean): boolean {
    const instance = this.#props.get(propId)
    if (!instance) return false
    instance.active = forcedActive !== undefined ? forcedActive : !instance.active
    const active = instance.active

    if (instance.data.type === 'campfire') {
      if (instance.flameMesh) instance.flameMesh.visible = active
      if (instance.innerFlameMesh) instance.innerFlameMesh.visible = active
      if (instance.light) {
        instance.light.visible = active
        instance.light.intensity = active ? 2.2 : 0
      }
    } else if (instance.data.type === 'lantern' || instance.data.type === 'tent') {
      if (instance.paperMesh) {
        instance.paperMesh.material = active ? this.#lanternPaperMat : this.#darkPaperMat
      }
      if (instance.light) {
        instance.light.visible = active
        instance.light.intensity = active ? 1.8 : 0
      }
    } else if (instance.data.type === 'radio') {
      if (instance.effect) {
        instance.effect.points.visible = active
      }
    }
    return active
  }

  relaunchFirework(propId: string): void {
    const instance = this.#props.get(propId)
    if (!instance || instance.data.type !== 'firework') return
    this.#launchRocket(
      instance.data.x,
      instance.group.position.y + 0.45,
      instance.data.z,
      instance.data.yaw,
    )
  }

  getNearbyProp(
    playerX: number,
    playerZ: number,
    maxDist = 2.4,
  ): {
    id: string
    type: PropType
    x: number
    y: number
    z: number
    yaw: number
    active: boolean
    text?: string
    authorName?: string
    seatIndex?: 0 | 1
    teamSide?: 'red' | 'blue'
    matchState?: 'idle' | 'serving' | 'in_rally' | 'game_over'
    scoreRed?: number
    scoreBlue?: number
    winner?: 'red' | 'blue' | null
    dist: number
  } | null {
    let closest: {
      id: string
      type: PropType
      x: number
      y: number
      z: number
      yaw: number
      active: boolean
      text?: string
      authorName?: string
      seatIndex?: 0 | 1
      teamSide?: 'red' | 'blue'
      matchState?: 'idle' | 'serving' | 'in_rally' | 'game_over'
      scoreRed?: number
      scoreBlue?: number
      winner?: 'red' | 'blue' | null
      skeetWave?: number
      skeetTotalWaves?: number
      skeetHits?: number
      skeetTotal?: number
      dist: number
    } | null = null
    let minDist = maxDist

    for (const p of this.#props.values()) {
      if (p.data.type === 'volleyball_court' && p.volleyballCourt) {
        const cosY = Math.cos(-p.data.yaw)
        const sinY = Math.sin(-p.data.yaw)
        const dx = playerX - p.data.x
        const dz = playerZ - p.data.z
        const localX = cosY * dx - sinY * dz
        const localZ = sinY * dx + cosY * dz

        // Within court area + 2.5m apron margin
        if (Math.abs(localX) <= 9.0 && Math.abs(localZ) <= 6.0) {
          const scores = p.volleyballCourt.scores
          return {
            id: p.data.id,
            type: p.data.type,
            x: p.data.x,
            y: p.volleyballCourt.group.position.y,
            z: p.data.z,
            yaw: p.data.yaw,
            active: p.active,
            teamSide: localX <= 0 ? 'red' : 'blue',
            matchState: p.volleyballCourt.matchState,
            scoreRed: scores.red,
            scoreBlue: scores.blue,
            winner: scores.winner,
            dist: Math.hypot(dx, dz),
          }
        }
      }

      const dist = Math.hypot(p.data.x - playerX, p.data.z - playerZ)
      if (dist < maxDist && dist < minDist) {
        let seatIndex: 0 | 1 | undefined

        // Calculate closer seat for 2-seater tea table
        if (p.data.type === 'tea_table') {
          const cosY = Math.cos(p.data.yaw)
          const sinY = Math.sin(p.data.yaw)
          const seat0X = p.data.x - cosY * 0.65
          const seat0Z = p.data.z - sinY * 0.65
          const seat1X = p.data.x + cosY * 0.65
          const seat1Z = p.data.z + sinY * 0.65

          const dist0 = Math.hypot(seat0X - playerX, seat0Z - playerZ)
          const dist1 = Math.hypot(seat1X - playerX, seat1Z - playerZ)
          seatIndex = dist0 <= dist1 ? 0 : 1
        }

        minDist = dist
        closest = {
          id: p.data.id,
          type: p.data.type,
          x: p.data.x,
          y: p.group.position.y,
          z: p.data.z,
          yaw: p.data.yaw,
          active: p.active,
          text: p.data.text,
          authorName: p.data.authorName,
          seatIndex,
          dist,
        }
      }
    }
    return closest
  }

  getProp(propId: string): PlacedPropInstance | undefined {
    return this.#props.get(propId)
  }

  updatePropText(id: string, text: string, authorName?: string): void {
    const instance = this.#props.get(id)
    if (!instance) return
    instance.data.text = text
    if (authorName !== undefined) instance.data.authorName = authorName

    if (instance.canvasTex && instance.canvasTex.image instanceof HTMLCanvasElement) {
      const canvas = instance.canvasTex.image
      if (instance.data.type === 'quote_billboard') {
        drawBillboardCanvas(canvas, text, instance.data.authorName)
      } else {
        drawSignCanvas(canvas, text, instance.data.authorName)
      }
      instance.canvasTex.needsUpdate = true
    }
  }

  removeProp(id: string): void {
    const instance = this.#props.get(id)
    if (!instance) return
    if (instance.data.type === 'volleyball_court' && instance.volleyballCourt) {
      this.group.remove(instance.volleyballCourt.group)
      instance.volleyballCourt.dispose()
      if (this.#volleyballCourt?.id === id) this.#volleyballCourt = null
    } else {
      this.group.remove(instance.group)
      instance.canvasTex?.dispose()
      if (instance.effect) {
        instance.effect.geometry.dispose()
        ;(instance.effect.points.material as THREE.Material).dispose()
      }
    }
    this.#props.delete(id)
  }

  #launchRocket(x: number, startY: number, z: number, yaw = 0): void {
    const rocketGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6)
    const colors = [
      new THREE.Color(0xff3366),
      new THREE.Color(0x38bdf8),
      new THREE.Color(0xfacc15),
      new THREE.Color(0xa855f7),
      new THREE.Color(0x4ade80),
      new THREE.Color(0xfb923c),
      new THREE.Color(0xf43f5e),
      new THREE.Color(0xec4899),
    ]
    const color = colors[Math.floor(Math.random() * colors.length)]!

    const rocketMat = new THREE.MeshBasicMaterial({ color })
    const rocketMesh = new THREE.Mesh(rocketGeo, rocketMat)
    rocketMesh.position.set(x, startY, z)

    // Launch trajectory: Centered at 60° elevation with random 5° cone spread from center
    const SPREAD_RAD = (5 * Math.PI) / 180 // 5 degrees in radians
    const yawOffset = (Math.random() - 0.5) * 2 * SPREAD_RAD
    const elevationOffset = (Math.random() - 0.5) * 2 * SPREAD_RAD

    const actualYaw = yaw + yawOffset
    const elevation = Math.PI / 3 + elevationOffset
    const speed = 22.0 + Math.random() * 4.0

    const fx = Math.sin(actualYaw)
    const fz = Math.cos(actualYaw)
    const vx = speed * Math.cos(elevation) * fx
    const vy = speed * Math.sin(elevation)
    const vz = speed * Math.cos(elevation) * fz

    const launchDir = new THREE.Vector3(vx, vy, vz).normalize()
    rocketMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), launchDir)
    this.group.add(rocketMesh)

    const maxTrail = 32
    const trailPositions = new Float32Array(maxTrail * 3)
    const trailGeo = new THREE.BufferGeometry()
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3))
    const trailMat = new THREE.PointsMaterial({
      color: 0xffe088,
      size: 0.32,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    })
    const trail = new THREE.Points(trailGeo, trailMat)
    this.group.add(trail)

    // Explode closer to the ground & viewer (16m - 20m height for maximum visual impact)
    const targetHeight = startY + 16 + Math.random() * 4
    this.#rockets.push({
      mesh: rocketMesh,
      x,
      y: startY,
      z,
      vx,
      vy,
      vz,
      flightTimeS: 0,
      maxFlightTimeS: 0.92 + Math.random() * 0.2,
      targetY: targetHeight,
      color,
      trail,
      trailPositions,
      trailCount: 0,
      dead: false,
    })
  }

  #explodeFirework(x: number, y: number, z: number, color: THREE.Color): void {
    // 2x Bigger burst radius with 400 sparkling particles
    const particleCount = 400
    const particles: SparkParticle[] = []
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)

    const glitterPalette = [
      color,
      color,
      color,
      new THREE.Color(0xffd700), // Imperial Gold
      new THREE.Color(0xffffff), // Diamond Starlight White
      new THREE.Color(0x38bdf8), // Sky Cyan flare
      new THREE.Color(0xf472b6), // Sakura Pink flare
      new THREE.Color(0x34d399), // Emerald Sparkle
      new THREE.Color(0xfbbf24), // Warm Amber
    ]

    for (let i = 0; i < particleCount; i++) {
      // Golden Spiral Spherical Distribution for perfectly even, 2x grand spherical bloom
      const phi = Math.acos(1 - (2 * (i + 0.5)) / particleCount)
      const theta = Math.PI * (1 + 5 ** 0.5) * i

      // Outer Shell (70%) & Inner Core (30%) - 2x speed for 2x wider diameter
      const isOuter = i < particleCount * 0.7
      const speed = isOuter ? 32.0 + Math.random() * 36.0 : 14.0 + Math.random() * 18.0

      const vx = speed * Math.sin(phi) * Math.cos(theta)
      const vy = speed * Math.cos(phi) * 0.95 + (isOuter ? 2.5 : 1.2)
      const vz = speed * Math.sin(phi) * Math.sin(theta)

      const partColor = isOuter
        ? glitterPalette[Math.floor(Math.random() * glitterPalette.length)]!
        : Math.random() < 0.5
          ? new THREE.Color(0xffffff)
          : new THREE.Color(0xffd700)

      particles.push({
        x,
        y,
        z,
        vx,
        vy,
        vz,
        color: partColor,
        alpha: 1.0,
        lifeS: 0,
        maxLifeS: (isOuter ? 3.2 : 2.2) + Math.random() * 1.0,
      })

      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      colors[i * 3] = partColor.r
      colors[i * 3 + 1] = partColor.g
      colors[i * 3 + 2] = partColor.b
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 0.92,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    const points = new THREE.Points(geometry, material)
    this.group.add(points)

    this.#bursts.push({
      points,
      geometry,
      particles,
      dead: false,
    })
  }

  update(
    dt: number,
    time: number,
    onVolleyballScore?: (
      scoringTeam: 'red' | 'blue',
      scoreRed: number,
      scoreBlue: number,
      winner?: 'red' | 'blue',
    ) => void,
  ): void {
    // 1. Animate Campfires, Lanterns, and Ambient Effects
    for (const p of this.#props.values()) {
      if (p.data.type === 'campfire' && p.active) {
        if (p.flameMesh) {
          const s = 0.9 + Math.sin(time * 12.0) * 0.12 + Math.cos(time * 18.0) * 0.08
          const sx = 0.85 + Math.cos(time * 15.0) * 0.15
          p.flameMesh.scale.set(sx, s, sx)
          p.flameMesh.rotation.y = time * 2.5
        }
        if (p.light) {
          p.light.intensity = 2.0 + Math.sin(time * 16.0) * 0.45 + Math.cos(time * 24.0) * 0.35
        }
      } else if ((p.data.type === 'lantern' || p.data.type === 'tent') && p.active) {
        if (p.light) {
          p.light.intensity = 1.8 + Math.sin(time * 6.0) * 0.15
        }
      } else if (p.data.type === 'companion') {
        const breathe = 1.0 + Math.sin(time * 2.5) * 0.025
        p.group.scale.set(1.0, breathe, 1.0)
      }

      if (p.effect && (p.active || p.data.type !== 'radio')) {
        const eff = p.effect
        const count = eff.positions.length / 3
        for (let i = 0; i < count; i++) {
          const idx = i * 3
          const vx = eff.velocities[idx] ?? 0
          const vy = eff.velocities[idx + 1] ?? 0
          const vz = eff.velocities[idx + 2] ?? 0

          eff.positions[idx] = (eff.positions[idx] ?? 0) + vx * dt
          eff.positions[idx + 1] = (eff.positions[idx + 1] ?? 0) + vy * dt
          eff.positions[idx + 2] = (eff.positions[idx + 2] ?? 0) + vz * dt

          const py = eff.positions[idx + 1] ?? 0
          if (eff.type === 'sakura' && py < 0.05) {
            eff.positions[idx + 1] = 0.65 + Math.random() * 0.1
            eff.positions[idx] = (Math.random() - 0.5) * 0.6
            eff.positions[idx + 2] = (Math.random() - 0.5) * 0.6
          } else if (eff.type === 'steam' && py > 0.6) {
            eff.positions[idx + 1] = 0.3
            eff.positions[idx] = 0.14 + (Math.random() - 0.5) * 0.05
            eff.positions[idx + 2] = (Math.random() - 0.5) * 0.05
          } else if (eff.type === 'music' && py > 0.8) {
            eff.positions[idx + 1] = 0.35
            eff.positions[idx] = (Math.random() - 0.5) * 0.2
            eff.positions[idx + 2] = (Math.random() - 0.5) * 0.2
          }
        }
        eff.geometry.attributes['position']!.needsUpdate = true
      }
    }

    // 2. Animate Ascending Firework Rockets (forward 60° arc)
    for (let i = this.#rockets.length - 1; i >= 0; i--) {
      const r = this.#rockets[i]!
      r.flightTimeS += dt
      r.x += r.vx * dt
      r.y += r.vy * dt
      r.z += r.vz * dt
      r.vy -= 4.0 * dt // gentle arc gravity

      r.mesh.position.set(r.x, r.y, r.z)
      const currentDir = new THREE.Vector3(r.vx, r.vy, r.vz).normalize()
      r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), currentDir)

      if (r.trailCount < 32) {
        r.trailPositions[r.trailCount * 3] = r.x + (Math.random() - 0.5) * 0.15
        r.trailPositions[r.trailCount * 3 + 1] = r.y - 0.2
        r.trailPositions[r.trailCount * 3 + 2] = r.z + (Math.random() - 0.5) * 0.15
        r.trailCount++
      } else {
        for (let t = 0; t < 31; t++) {
          r.trailPositions[t * 3] = r.trailPositions[(t + 1) * 3]!
          r.trailPositions[t * 3 + 1] = r.trailPositions[(t + 1) * 3 + 1]!
          r.trailPositions[t * 3 + 2] = r.trailPositions[(t + 1) * 3 + 2]!
        }
        r.trailPositions[93] = r.x
        r.trailPositions[94] = r.y - 0.2
        r.trailPositions[95] = r.z
      }
      r.trail.geometry.attributes['position']!.needsUpdate = true

      if (r.flightTimeS >= r.maxFlightTimeS || r.y >= r.targetY) {
        this.#explodeFirework(r.x, r.y, r.z, r.color)
        this.group.remove(r.mesh)
        this.group.remove(r.trail)
        r.mesh.geometry.dispose()
        r.trail.geometry.dispose()
        this.#rockets.splice(i, 1)
      }
    }

    // 3. Animate Burst Particles (Grand Spherical Cascade)
    for (let b = this.#bursts.length - 1; b >= 0; b--) {
      const burst = this.#bursts[b]!
      const posAttr = burst.geometry.attributes['position'] as THREE.BufferAttribute
      const posArr = posAttr.array as Float32Array
      let allDead = true

      for (let p = 0; p < burst.particles.length; p++) {
        const part = burst.particles[p]!
        part.lifeS += dt
        if (part.lifeS < part.maxLifeS) {
          allDead = false
          part.vy -= 3.2 * dt // graceful float gravity
          part.vx *= 0.965 // air drag for expanding spherical canopy
          part.vz *= 0.965
          part.x += part.vx * dt
          part.y += part.vy * dt
          part.z += part.vz * dt

          posArr[p * 3] = part.x
          posArr[p * 3 + 1] = part.y
          posArr[p * 3 + 2] = part.z
        }
      }
      posAttr.needsUpdate = true

      const mat = burst.points.material as THREE.PointsMaterial
      mat.opacity = Math.max(0, mat.opacity - dt * 0.32)

      if (allDead || mat.opacity <= 0.02) {
        this.group.remove(burst.points)
        burst.geometry.dispose()
        ;(burst.points.material as THREE.Material).dispose()
        this.#bursts.splice(b, 1)
      }
    }

    // 4. Update Volleyball Court Physics & Game rules
    this.#volleyballCourt?.update(dt, onVolleyballScore)
  }

  dispose(): void {
    for (const p of this.#props.values()) {
      this.group.remove(p.group)
      p.canvasTex?.dispose()
      if (p.effect) {
        p.effect.geometry.dispose()
        ;(p.effect.points.material as THREE.Material).dispose()
      }
      p.volleyballCourt?.dispose()
    }
    this.#props.clear()
    this.#volleyballCourt = null

    for (const r of this.#rockets) {
      this.group.remove(r.mesh)
      this.group.remove(r.trail)
    }
    this.#rockets = []

    for (const b of this.#bursts) {
      this.group.remove(b.points)
      b.geometry.dispose()
    }
    this.#bursts = []

    this.#stoneGeo.dispose()
    this.#logGeo.dispose()
    this.#flameGeo.dispose()
    this.#postGeo.dispose()
    this.#signBoardGeo.dispose()
    this.#lanternPostGeo.dispose()
    this.#lanternHeadGeo.dispose()
    this.#benchLegGeo.dispose()
    this.#benchPlankGeo.dispose()
    this.#tentFabricGeo.dispose()
    this.#tentPoleGeo.dispose()
    this.#teaTableGeo.dispose()
    this.#cushionGeo.dispose()
    this.#teapotGeo.dispose()
    this.#cupGeo.dispose()
    this.#potGeo.dispose()
    this.#bonsaiTrunkGeo.dispose()
    this.#bonsaiFoliageGeo.dispose()
    this.#radioBoxGeo.dispose()

    this.#stoneMat.dispose()
    this.#woodMat.dispose()
    this.#darkWoodMat.dispose()
    this.#fireMat.dispose()
    this.#lanternPaperMat.dispose()
    this.#darkPaperMat.dispose()
    this.#mortarMat.dispose()
    this.#tentFabricMat.dispose()
    this.#cushionMat.dispose()
    this.#sakuraFoliageMat.dispose()
    this.#radioMat.dispose()
    this.#ceramicMat.dispose()
  }
}

export function drawSignCanvas(canvas: HTMLCanvasElement, text: string, authorName?: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 1024 x 512 Crisp Signboard Canvas
  ctx.fillStyle = '#261911'
  ctx.fillRect(0, 0, 1024, 512)

  ctx.strokeStyle = '#140c08'
  ctx.lineWidth = 20
  ctx.strokeRect(10, 10, 1004, 492)

  ctx.strokeStyle = '#b45309'
  ctx.lineWidth = 6
  ctx.strokeRect(30, 30, 964, 452)

  ctx.fillStyle = '#fef3c7'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 52px system-ui, -apple-system, sans-serif'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
  ctx.shadowBlur = 10

  const content = text?.trim() || 'Cozy Spot'
  const words = content.split(' ')
  let line = ''
  const lines: string[] = []
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' '
    const metrics = ctx.measureText(testLine)
    if (metrics.width > 860 && n > 0) {
      lines.push(line)
      line = words[n] + ' '
    } else {
      line = testLine
    }
  }
  lines.push(line)

  const startY = 220 - ((lines.length - 1) * 60) / 2
  lines.forEach((l, idx) => {
    ctx.fillText(l.trim(), 512, startY + idx * 64)
  })

  if (authorName) {
    ctx.shadowBlur = 0
    ctx.font = 'italic 32px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = '#fbbf24'
    ctx.fillText(`— ${authorName}`, 512, 430)
  }
}

export function drawBillboardCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  authorName?: string,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 2560 x 1024 Ultra-Crisp Panoramic Slate Canvas
  ctx.fillStyle = '#0e0d0c'
  ctx.fillRect(0, 0, 2560, 1024)

  // Outer frame
  ctx.strokeStyle = '#261b12'
  ctx.lineWidth = 36
  ctx.strokeRect(18, 18, 2524, 988)

  // Gold luxury inner hairline border
  ctx.strokeStyle = '#d97706'
  ctx.lineWidth = 8
  ctx.strokeRect(44, 44, 2472, 936)

  // Top Title Banner
  ctx.fillStyle = 'rgba(217, 119, 6, 0.12)'
  ctx.fillRect(52, 52, 2456, 120)

  ctx.fillStyle = '#fbbf24'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 48px system-ui, -apple-system, sans-serif'
  ctx.fillText('DAILY INSPIRATION', 1280, 112)

  // Main Quote Text (Large Bold High-DPI Font)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 96px system-ui, -apple-system, sans-serif'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'
  ctx.shadowBlur = 14

  const quote = text?.trim() || 'Work hard, rest well, and take a moment to breathe.'
  const words = quote.split(' ')
  let line = ''
  const lines: string[] = []
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' '
    const metrics = ctx.measureText(testLine)
    if (metrics.width > 2250 && n > 0) {
      lines.push(line)
      line = words[n] + ' '
    } else {
      line = testLine
    }
  }
  lines.push(line)

  const startY = 500 - ((lines.length - 1) * 115) / 2
  lines.forEach((l, idx) => {
    ctx.fillText(l.trim(), 1280, startY + idx * 122)
  })

  // Footer Attribution
  ctx.shadowBlur = 0
  ctx.font = 'italic 44px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#f59e0b'
  const author = authorName ? `— ${authorName}` : '— Chill In-Browser AI'
  ctx.fillText(author, 1280, 890)
}
