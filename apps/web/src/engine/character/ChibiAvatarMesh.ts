import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ChibiAvatarConfig } from '@/lib/avatar/avatarConfig'
import { ChibiFaceTexture } from './ChibiFaceTexture'
import { SpringBone } from './SpringBone'

export interface ChibiRigParts {
  rootGroup: THREE.Group
  headPivot: THREE.Group
  torsoPivot: THREE.Group
  leftArmPivot: THREE.Group
  rightArmPivot: THREE.Group
  leftLegPivot: THREE.Group
  rightLegPivot: THREE.Group
  faceTexture: ChibiFaceTexture
  springBones: SpringBone[]
  // Roblox-Style Attachment Sockets
  sockets: {
    hat: THREE.Group
    face: THREE.Group
    neck: THREE.Group
    back: THREE.Group
    waist: THREE.Group
  }
  materials: {
    skin: THREE.MeshStandardMaterial
    hair: THREE.MeshStandardMaterial
    eye: THREE.MeshStandardMaterial
    outfit: THREE.MeshStandardMaterial
    pants: THREE.MeshStandardMaterial
    shoes: THREE.MeshStandardMaterial
    accessory: THREE.MeshStandardMaterial
    blush: THREE.MeshStandardMaterial
    face: THREE.MeshStandardMaterial
  }
}

export class ChibiAvatarMesh {
  group: THREE.Group = new THREE.Group()
  rig: ChibiRigParts
  faceTexture: ChibiFaceTexture
  springBones: SpringBone[] = []
  #config: ChibiAvatarConfig

  constructor(config: ChibiAvatarConfig) {
    this.#config = { ...config }
    this.faceTexture = new ChibiFaceTexture({
      eyeStyle: config.eyeStyle,
      eyeColor: config.eyeColor,
      skinTone: config.skinTone,
    })
    this.rig = this.#buildRig(config)
    this.springBones = this.rig.springBones
    this.group.add(this.rig.rootGroup)
  }

  /** The full merged config after any `updateConfig` calls — read by `Engine.ts` so
   * it can broadcast the complete config over the network after a local customization
   * change, without `engine/` needing to import the app-layer `avatarStore` itself
   * (see `Engine.ts`'s own doc comments on why `engine/` stays framework-agnostic). */
  get config(): ChibiAvatarConfig {
    return this.#config
  }

  updateConfig(newConfig: Partial<ChibiAvatarConfig>): void {
    this.#config = { ...this.#config, ...newConfig }

    // Update material colors in real time
    if (newConfig.skinTone) this.rig.materials.skin.color.set(newConfig.skinTone)
    if (newConfig.hairColor) this.rig.materials.hair.color.set(newConfig.hairColor)
    if (newConfig.eyeColor) this.rig.materials.eye.color.set(newConfig.eyeColor)
    if (newConfig.outfitColor) this.rig.materials.outfit.color.set(newConfig.outfitColor)
    if (newConfig.pantsColor) this.rig.materials.pants.color.set(newConfig.pantsColor)
    if (newConfig.shoesColor) this.rig.materials.shoes.color.set(newConfig.shoesColor)
    if (newConfig.accessoryColor) this.rig.materials.accessory.color.set(newConfig.accessoryColor)

    // Update dynamic face canvas texture
    this.faceTexture.setStyle({
      eyeStyle: this.#config.eyeStyle,
      eyeColor: this.#config.eyeColor,
      skinTone: this.#config.skinTone,
    })

    // If geometry styles changed, rebuild sockets/hair/outfit
    if (
      newConfig.hairStyle !== undefined ||
      newConfig.outfitStyle !== undefined ||
      newConfig.accessory !== undefined
    ) {
      this.group.remove(this.rig.rootGroup)
      this.disposeGeometries()
      this.rig = this.#buildRig(this.#config)
      this.springBones = this.rig.springBones
      this.group.add(this.rig.rootGroup)
    }
  }

  #buildRig(config: ChibiAvatarConfig): ChibiRigParts {
    const rootGroup = new THREE.Group()
    const springBones: SpringBone[] = []

    // --- Anime / Chibi Soft Shaded Materials ---
    const skin = new THREE.MeshStandardMaterial({
      color: config.skinTone,
      roughness: 0.72,
      metalness: 0.02,
    })
    const hair = new THREE.MeshStandardMaterial({
      color: config.hairColor,
      roughness: 0.65,
      metalness: 0.04,
    })
    const eye = new THREE.MeshStandardMaterial({
      color: config.eyeColor,
      roughness: 0.3,
      metalness: 0.1,
    })
    const outfit = new THREE.MeshStandardMaterial({
      color: config.outfitColor,
      roughness: 0.75,
      metalness: 0.05,
    })
    const pants = new THREE.MeshStandardMaterial({
      color: config.pantsColor,
      roughness: 0.8,
      metalness: 0.05,
    })
    const shoes = new THREE.MeshStandardMaterial({
      color: config.shoesColor,
      roughness: 0.5,
      metalness: 0.1,
    })
    const accessory = new THREE.MeshStandardMaterial({
      color: config.accessoryColor,
      roughness: 0.6,
      metalness: 0.05,
    })
    const blush = new THREE.MeshStandardMaterial({
      color: '#ff9ebb',
      roughness: 0.9,
      transparent: true,
      opacity: 0.85,
    })

    // Dynamic Face Canvas Material
    const faceMat = new THREE.MeshStandardMaterial({
      map: this.faceTexture.texture,
      transparent: true,
      roughness: 0.75,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })

    const materials = { skin, hair, eye, outfit, pants, shoes, accessory, blush, face: faceMat }

    // --- Torso Pivot (Center of hips) ---
    const torsoPivot = new THREE.Group()
    torsoPivot.position.set(0, 0.28, 0)
    rootGroup.add(torsoPivot)

    // --- Head Pivot (Base of neck) ---
    const headPivot = new THREE.Group()
    headPivot.position.set(0, 0.34, 0)
    torsoPivot.add(headPivot)

    // --- Attachment Sockets ---
    const hatSocket = new THREE.Group()
    hatSocket.position.set(0, 0.44, 0)
    headPivot.add(hatSocket)

    const faceSocket = new THREE.Group()
    faceSocket.position.set(0, 0.22, 0.235)
    headPivot.add(faceSocket)

    const neckSocket = new THREE.Group()
    neckSocket.position.set(0, 0.04, 0)
    headPivot.add(neckSocket)

    const backSocket = new THREE.Group()
    backSocket.position.set(0, 0.18, -0.16)
    torsoPivot.add(backSocket)

    const waistSocket = new THREE.Group()
    waistSocket.position.set(0, 0.02, 0)
    torsoPivot.add(waistSocket)

    const sockets = { hat: hatSocket, face: faceSocket, neck: neckSocket, back: backSocket, waist: waistSocket }

    // --- Torso & Outfit ---
    this.#addOutfit(torsoPivot, config.outfitStyle, outfit, accessory)

    // Head Base with Seamless Dynamic Face Texture (Zero Decal/Patch Artifacts)
    const headGeo = new THREE.SphereGeometry(0.24, 32, 24)
    headGeo.scale(1.0, 1.06, 0.95)
    const headMesh = new THREE.Mesh(headGeo, faceMat)
    headMesh.position.set(0, 0.22, 0)
    headMesh.castShadow = true
    headMesh.receiveShadow = true
    headPivot.add(headMesh)

    // Hair (with Spring Physics where applicable)
    this.#addHair(headPivot, config.hairStyle, hair, springBones)

    // Accessories (with Spring Physics where applicable)
    this.#addAccessory(sockets, config.accessory, accessory, springBones)

    // --- Left Arm Pivot ---
    const leftArmPivot = new THREE.Group()
    leftArmPivot.position.set(-0.20, 0.27, 0)
    const armGeo = new THREE.CapsuleGeometry(0.045, 0.18, 4, 8)
    const leftArm = new THREE.Mesh(armGeo, outfit)
    leftArm.position.set(0, -0.09, 0)
    leftArm.castShadow = true
    const handGeo = new THREE.SphereGeometry(0.04, 10, 8)
    const leftHand = new THREE.Mesh(handGeo, skin)
    leftHand.position.set(0, -0.20, 0)
    leftArmPivot.add(leftArm, leftHand)
    torsoPivot.add(leftArmPivot)

    // --- Right Arm Pivot ---
    const rightArmPivot = new THREE.Group()
    rightArmPivot.position.set(0.20, 0.27, 0)
    const rightArm = new THREE.Mesh(armGeo, outfit)
    rightArm.position.set(0, -0.09, 0)
    rightArm.castShadow = true
    const rightHand = new THREE.Mesh(handGeo, skin)
    rightHand.position.set(0, -0.20, 0)
    rightArmPivot.add(rightArm, rightHand)
    torsoPivot.add(rightArmPivot)

    // --- Left Leg Pivot ---
    const leftLegPivot = new THREE.Group()
    leftLegPivot.position.set(-0.09, -0.02, 0)
    const legGeo = new THREE.CapsuleGeometry(0.045, 0.14, 4, 8)
    const leftLeg = new THREE.Mesh(legGeo, pants)
    leftLeg.position.set(0, -0.07, 0)
    leftLeg.castShadow = true
    const shoeGeo = new THREE.BoxGeometry(0.08, 0.05, 0.12)
    const leftShoe = new THREE.Mesh(shoeGeo, shoes)
    leftShoe.position.set(0, -0.18, 0.02)
    leftLegPivot.add(leftLeg, leftShoe)
    torsoPivot.add(leftLegPivot)

    // --- Right Leg Pivot ---
    const rightLegPivot = new THREE.Group()
    rightLegPivot.position.set(0.09, -0.02, 0)
    const rightLeg = new THREE.Mesh(legGeo, pants)
    rightLeg.position.set(0, -0.07, 0)
    rightLeg.castShadow = true
    const rightShoe = new THREE.Mesh(shoeGeo, shoes)
    rightShoe.position.set(0, -0.18, 0.02)
    rightLegPivot.add(rightLeg, rightShoe)
    torsoPivot.add(rightLegPivot)

    // Merge static children per pivot to minimize draw calls
    this.#mergePivotChildren(torsoPivot)
    this.#mergePivotChildren(leftArmPivot)
    this.#mergePivotChildren(rightArmPivot)
    this.#mergePivotChildren(leftLegPivot)
    this.#mergePivotChildren(rightLegPivot)

    return {
      rootGroup,
      headPivot,
      torsoPivot,
      leftArmPivot,
      rightArmPivot,
      leftLegPivot,
      rightLegPivot,
      faceTexture: this.faceTexture,
      springBones,
      sockets,
      materials,
    }
  }

  #mergePivotChildren(pivot: THREE.Group): void {
    const meshes = pivot.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh)
    if (meshes.length === 0) return

    const byMaterial = new Map<THREE.Material, THREE.Mesh[]>()
    for (const mesh of meshes) {
      const material = mesh.material as THREE.Material
      const group = byMaterial.get(material)
      if (group) group.push(mesh)
      else byMaterial.set(material, [mesh])
    }

    for (const [material, group] of byMaterial) {
      if (group.length < 2) continue

      const baked: THREE.BufferGeometry[] = []
      let castShadow = false
      let receiveShadow = false
      for (const mesh of group) {
        mesh.updateMatrix()
        const geo = mesh.geometry.clone()
        geo.applyMatrix4(mesh.matrix)
        baked.push(geo)
        castShadow ||= mesh.castShadow
        receiveShadow ||= mesh.receiveShadow
      }

      const merged = mergeGeometries(baked)
      baked.forEach((g) => g.dispose())
      if (!merged) continue

      for (const mesh of group) {
        pivot.remove(mesh)
        mesh.geometry.dispose()
      }
      const mergedMesh = new THREE.Mesh(merged, material)
      mergedMesh.castShadow = castShadow
      mergedMesh.receiveShadow = receiveShadow
      pivot.add(mergedMesh)
    }
  }

  #addOutfit(torsoPivot: THREE.Group, style: ChibiAvatarConfig['outfitStyle'], outfitMat: THREE.Material, accMat: THREE.Material): void {
    if (style === 'cozy-hoodie') {
      const hoodieGeo = new THREE.CylinderGeometry(0.14, 0.17, 0.32, 16)
      const hoodieMesh = new THREE.Mesh(hoodieGeo, outfitMat)
      hoodieMesh.position.set(0, 0.16, 0)
      hoodieMesh.castShadow = true
      torsoPivot.add(hoodieMesh)

      const pocketGeo = new THREE.BoxGeometry(0.18, 0.09, 0.03)
      const pocket = new THREE.Mesh(pocketGeo, outfitMat)
      pocket.position.set(0, 0.10, 0.15)
      torsoPivot.add(pocket)

      const hoodBackGeo = new THREE.SphereGeometry(0.12, 12, 12)
      hoodBackGeo.scale(1.1, 0.8, 0.6)
      const hoodBack = new THREE.Mesh(hoodBackGeo, outfitMat)
      hoodBack.position.set(0, 0.30, -0.12)
      torsoPivot.add(hoodBack)
    } else if (style === 'beach-robe') {
      const robeGeo = new THREE.CylinderGeometry(0.13, 0.18, 0.34, 16)
      const robeMesh = new THREE.Mesh(robeGeo, outfitMat)
      robeMesh.position.set(0, 0.16, 0)
      robeMesh.castShadow = true
      torsoPivot.add(robeMesh)

      const sashGeo = new THREE.TorusGeometry(0.16, 0.02, 8, 16)
      const sash = new THREE.Mesh(sashGeo, accMat)
      sash.position.set(0, 0.14, 0)
      sash.rotation.x = Math.PI / 2
      torsoPivot.add(sash)
    } else if (style === 'sailor-tee') {
      const teeGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.30, 16)
      const teeMesh = new THREE.Mesh(teeGeo, outfitMat)
      teeMesh.position.set(0, 0.15, 0)
      teeMesh.castShadow = true
      torsoPivot.add(teeMesh)

      const collarGeo = new THREE.BoxGeometry(0.34, 0.02, 0.20)
      const collar = new THREE.Mesh(collarGeo, accMat)
      collar.position.set(0, 0.29, -0.06)
      collar.rotation.x = -0.15
      torsoPivot.add(collar)

      const tieGeo = new THREE.ConeGeometry(0.045, 0.12, 4)
      const tie = new THREE.Mesh(tieGeo, accMat)
      tie.position.set(0, 0.20, 0.14)
      tie.rotation.x = Math.PI
      torsoPivot.add(tie)
    } else if (style === 'winter-coat') {
      const coatGeo = new THREE.CylinderGeometry(0.16, 0.20, 0.34, 16)
      const coatMesh = new THREE.Mesh(coatGeo, outfitMat)
      coatMesh.position.set(0, 0.16, 0)
      coatMesh.castShadow = true
      torsoPivot.add(coatMesh)

      const furGeo = new THREE.TorusGeometry(0.18, 0.06, 12, 20)
      const fur = new THREE.Mesh(furGeo, accMat)
      fur.position.set(0, 0.30, 0)
      fur.rotation.x = Math.PI / 2
      torsoPivot.add(fur)

      const buttonGeo = new THREE.SphereGeometry(0.015, 8, 8)
      for (let i = 0; i < 3; i++) {
        const b1 = new THREE.Mesh(buttonGeo, accMat)
        b1.position.set(-0.05, 0.22 - i * 0.07, 0.16)
        const b2 = new THREE.Mesh(buttonGeo, accMat)
        b2.position.set(0.05, 0.22 - i * 0.07, 0.16)
        torsoPivot.add(b1, b2)
      }
    } else if (style === 'monk-robe') {
      const robeGeo = new THREE.CylinderGeometry(0.14, 0.19, 0.34, 16)
      const robeMesh = new THREE.Mesh(robeGeo, outfitMat)
      robeMesh.position.set(0, 0.16, 0)
      robeMesh.castShadow = true
      torsoPivot.add(robeMesh)

      const kesaGeo = new THREE.BoxGeometry(0.06, 0.36, 0.04)
      const kesa = new THREE.Mesh(kesaGeo, accMat)
      kesa.position.set(0.02, 0.18, 0.15)
      kesa.rotation.z = -0.45
      torsoPivot.add(kesa)

      const necklaceGeo = new THREE.TorusGeometry(0.16, 0.02, 10, 20)
      const malaMat = new THREE.MeshStandardMaterial({ color: '#5c3a21', roughness: 0.8 })
      const necklace = new THREE.Mesh(necklaceGeo, malaMat)
      necklace.position.set(0, 0.30, 0)
      necklace.rotation.x = Math.PI / 2
      torsoPivot.add(necklace)

      const beadGeo = new THREE.SphereGeometry(0.025, 8, 8)
      const pendant = new THREE.Mesh(beadGeo, malaMat)
      pendant.position.set(0, 0.16, 0.17)
      torsoPivot.add(pendant)
    }
  }

  #addHair(
    headPivot: THREE.Group,
    style: ChibiAvatarConfig['hairStyle'],
    hairMat: THREE.Material,
    springBones: SpringBone[],
  ): void {
    if (style === 'bald') {
      return
    }

    // Hair Cap Base
    const capGeo = new THREE.SphereGeometry(0.264, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.39)
    const capMesh = new THREE.Mesh(capGeo, hairMat)
    capMesh.position.set(0, 0.22, 0)
    headPivot.add(capMesh)

    if (style === 'bob') {
      const bobCurtainGeo = new THREE.SphereGeometry(0.266, 28, 20, Math.PI * 0.60, Math.PI * 1.80, 0.25, Math.PI * 0.45)
      const bobCurtain = new THREE.Mesh(bobCurtainGeo, hairMat)
      bobCurtain.position.set(0, 0.22, -0.01)
      headPivot.add(bobCurtain)

      const lockGeo = new THREE.CapsuleGeometry(0.048, 0.20, 4, 10)
      const leftLock = new THREE.Mesh(lockGeo, hairMat)
      leftLock.position.set(-0.21, 0.15, 0.05)
      leftLock.rotation.z = -0.10
      leftLock.rotation.x = 0.08
      const rightLock = new THREE.Mesh(lockGeo, hairMat)
      rightLock.position.set(0.21, 0.15, 0.05)
      rightLock.rotation.z = 0.10
      rightLock.rotation.x = 0.08
      headPivot.add(leftLock, rightLock)
    } else if (style === 'bun') {
      const bunGeo = new THREE.SphereGeometry(0.12, 16, 16)
      const bun = new THREE.Mesh(bunGeo, hairMat)
      bun.position.set(0, 0.46, -0.05)
      headPivot.add(bun)

      const ringGeo = new THREE.TorusGeometry(0.11, 0.02, 8, 16)
      const ring = new THREE.Mesh(ringGeo, hairMat)
      ring.position.set(0, 0.41, -0.05)
      ring.rotation.x = Math.PI / 2
      headPivot.add(ring)
    } else if (style === 'double-buns') {
      const bunGeo = new THREE.SphereGeometry(0.09, 14, 14)
      const leftBun = new THREE.Mesh(bunGeo, hairMat)
      leftBun.position.set(-0.18, 0.45, -0.04)
      const rightBun = new THREE.Mesh(bunGeo, hairMat)
      rightBun.position.set(0.18, 0.45, -0.04)

      const ringGeo = new THREE.TorusGeometry(0.08, 0.016, 8, 16)
      const leftRing = new THREE.Mesh(ringGeo, hairMat)
      leftRing.position.set(-0.18, 0.41, -0.04)
      leftRing.rotation.x = Math.PI / 2
      const rightRing = new THREE.Mesh(ringGeo, hairMat)
      rightRing.position.set(0.18, 0.41, -0.04)
      rightRing.rotation.x = Math.PI / 2
      headPivot.add(leftBun, rightBun, leftRing, rightRing)
    } else if (style === 'ponytail') {
      // Spring-driven ponytail with natural inertia & bounce
      const tailPivot = new THREE.Group()
      tailPivot.position.set(0, 0.42, -0.12)

      const tailGeo = new THREE.CapsuleGeometry(0.06, 0.32, 4, 10)
      const tail = new THREE.Mesh(tailGeo, hairMat)
      tail.position.set(0, -0.14, -0.08)
      tail.rotation.x = -0.45

      const ringGeo = new THREE.TorusGeometry(0.07, 0.02, 8, 16)
      const ring = new THREE.Mesh(ringGeo, hairMat)
      ring.position.set(0, 0, 0)
      ring.rotation.x = 0.8

      tailPivot.add(tail, ring)
      headPivot.add(tailPivot)

      springBones.push(
        new SpringBone(tailPivot, {
          stiffness: 140,
          damping: 12,
          maxAngle: 0.65,
          gravity: 0.08,
        }),
      )
    } else if (style === 'curly') {
      const curlGeo = new THREE.SphereGeometry(0.075, 12, 12)
      const curlPositions: [number, number, number][] = [
        [-0.18, 0.38, 0.08],
        [0.18, 0.38, 0.08],
        [-0.22, 0.26, 0.02],
        [0.22, 0.26, 0.02],
        [-0.18, 0.16, -0.04],
        [0.18, 0.16, -0.04],
        [0, 0.46, -0.06],
        [-0.10, 0.47, -0.02],
        [0.10, 0.47, -0.02],
      ]
      curlPositions.forEach(([x, y, z]) => {
        const curl = new THREE.Mesh(curlGeo, hairMat)
        curl.position.set(x, y, z)
        headPivot.add(curl)
      })
    } else if (style === 'spiky') {
      const spikeGeo = new THREE.ConeGeometry(0.075, 0.20, 6)
      const positions: [number, number, number, number, number][] = [
        [-0.14, 0.46, 0.05, 0.35, -0.2],
        [0.14, 0.46, 0.05, -0.35, -0.2],
        [0, 0.50, -0.04, 0, -0.3],
        [-0.19, 0.39, -0.08, 0.6, 0],
        [0.19, 0.39, -0.08, -0.6, 0],
      ]
      positions.forEach(([x, y, z, rz, rx]) => {
        const spike = new THREE.Mesh(spikeGeo, hairMat)
        spike.position.set(x, y, z)
        spike.rotation.z = rz
        spike.rotation.x = rx
        headPivot.add(spike)
      })
    } else if (style === 'floppy') {
      const strandGeo = new THREE.CapsuleGeometry(0.06, 0.40, 4, 10)

      // Spring-driven floppy strands
      const leftPivot = new THREE.Group()
      leftPivot.position.set(-0.21, 0.24, 0.04)
      const leftStrand = new THREE.Mesh(strandGeo, hairMat)
      leftStrand.position.set(0, -0.14, 0)
      leftStrand.rotation.z = -0.15
      leftStrand.rotation.x = 0.1
      leftPivot.add(leftStrand)

      const rightPivot = new THREE.Group()
      rightPivot.position.set(0.21, 0.24, 0.04)
      const rightStrand = new THREE.Mesh(strandGeo, hairMat)
      rightStrand.position.set(0, -0.14, 0)
      rightStrand.rotation.z = 0.15
      rightStrand.rotation.x = 0.1
      rightPivot.add(rightStrand)

      headPivot.add(leftPivot, rightPivot)
      springBones.push(
        new SpringBone(leftPivot, { stiffness: 180, damping: 14, maxAngle: 0.45 }),
        new SpringBone(rightPivot, { stiffness: 180, damping: 14, maxAngle: 0.45 }),
      )
    }
  }

  #addAccessory(
    sockets: ChibiRigParts['sockets'],
    acc: ChibiAvatarConfig['accessory'],
    accMat: THREE.Material,
    springBones: SpringBone[],
  ): void {
    if (acc === 'cat-ears') {
      const earGeo = new THREE.ConeGeometry(0.07, 0.15, 4)

      const leftEarPivot = new THREE.Group()
      leftEarPivot.position.set(-0.16, 0.04, 0.02)
      const leftEar = new THREE.Mesh(earGeo, accMat)
      leftEar.rotation.z = 0.3
      leftEarPivot.add(leftEar)

      const rightEarPivot = new THREE.Group()
      rightEarPivot.position.set(0.16, 0.04, 0.02)
      const rightEar = new THREE.Mesh(earGeo, accMat)
      rightEar.rotation.z = -0.3
      rightEarPivot.add(rightEar)

      sockets.hat.add(leftEarPivot, rightEarPivot)
      springBones.push(
        new SpringBone(leftEarPivot, { stiffness: 240, damping: 18, maxAngle: 0.25 }),
        new SpringBone(rightEarPivot, { stiffness: 240, damping: 18, maxAngle: 0.25 }),
      )
    } else if (acc === 'bunny-ears') {
      const earGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.3, 10)

      const leftEarPivot = new THREE.Group()
      leftEarPivot.position.set(-0.12, 0.02, 0)
      const leftEar = new THREE.Mesh(earGeo, accMat)
      leftEar.position.set(0, 0.12, 0)
      leftEar.rotation.z = 0.18
      leftEarPivot.add(leftEar)

      const rightEarPivot = new THREE.Group()
      rightEarPivot.position.set(0.12, 0.02, 0)
      const rightEar = new THREE.Mesh(earGeo, accMat)
      rightEar.position.set(0, 0.12, 0)
      rightEar.rotation.z = -0.18
      rightEarPivot.add(rightEar)

      sockets.hat.add(leftEarPivot, rightEarPivot)
      springBones.push(
        new SpringBone(leftEarPivot, { stiffness: 160, damping: 12, maxAngle: 0.45 }),
        new SpringBone(rightEarPivot, { stiffness: 160, damping: 12, maxAngle: 0.45 }),
      )
    } else if (acc === 'glasses') {
      const frameGeo = new THREE.TorusGeometry(0.048, 0.008, 8, 16)
      const leftFrame = new THREE.Mesh(frameGeo, accMat)
      leftFrame.position.set(-0.09, 0, 0.005)
      const rightFrame = new THREE.Mesh(frameGeo, accMat)
      rightFrame.position.set(0.09, 0, 0.005)
      const bridgeGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.08)
      const bridge = new THREE.Mesh(bridgeGeo, accMat)
      bridge.position.set(0, 0, 0.005)
      bridge.rotation.z = Math.PI / 2
      sockets.face.add(leftFrame, rightFrame, bridge)
    } else if (acc === 'straw-hat') {
      const brimGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.02, 24)
      const brim = new THREE.Mesh(brimGeo, accMat)
      brim.position.set(0, 0, 0)
      const crownGeo = new THREE.CylinderGeometry(0.18, 0.20, 0.12, 24)
      const crown = new THREE.Mesh(crownGeo, accMat)
      crown.position.set(0, 0.06, 0)
      sockets.hat.add(brim, crown)
    } else if (acc === 'beret') {
      const beretGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.08, 20)
      const beret = new THREE.Mesh(beretGeo, accMat)
      beret.position.set(0.06, 0.02, 0)
      beret.rotation.z = -0.25
      sockets.hat.add(beret)
    } else if (acc === 'headphones') {
      const bandGeo = new THREE.TorusGeometry(0.24, 0.02, 8, 24, Math.PI)
      const band = new THREE.Mesh(bandGeo, accMat)
      band.position.set(0, 0.04, 0)
      band.rotation.x = Math.PI / 2
      band.rotation.z = Math.PI
      const cupGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16)
      const leftCup = new THREE.Mesh(cupGeo, accMat)
      leftCup.position.set(-0.24, -0.22, 0)
      leftCup.rotation.z = Math.PI / 2
      const rightCup = new THREE.Mesh(cupGeo, accMat)
      rightCup.position.set(0.24, -0.22, 0)
      rightCup.rotation.z = Math.PI / 2
      sockets.hat.add(band, leftCup, rightCup)
    } else if (acc === 'scarf') {
      // Cozy scarf ring + Spring-animated tail
      const scarfGeo = new THREE.TorusGeometry(0.16, 0.04, 10, 20)
      const scarf = new THREE.Mesh(scarfGeo, accMat)
      scarf.position.set(0, -0.02, 0)
      scarf.rotation.x = Math.PI / 2
      sockets.neck.add(scarf)

      // Billowing scarf tail
      const tailPivot = new THREE.Group()
      tailPivot.position.set(-0.11, -0.04, 0.09)
      const tailGeo = new THREE.CapsuleGeometry(0.038, 0.24, 4, 8)
      const tail = new THREE.Mesh(tailGeo, accMat)
      tail.position.set(0, -0.12, 0)
      tailPivot.add(tail)
      sockets.neck.add(tailPivot)

      springBones.push(
        new SpringBone(tailPivot, {
          stiffness: 110,
          damping: 9,
          maxAngle: 0.85,
          gravity: 0.12,
        }),
      )
    } else if (acc === 'backpack') {
      const bagGeo = new THREE.BoxGeometry(0.22, 0.24, 0.12)
      const bag = new THREE.Mesh(bagGeo, accMat)
      bag.position.set(0, 0, 0)
      sockets.back.add(bag)
    } else if (acc === 'angel-wings') {
      // Stylized Anime Feathered Wings with Smooth Beveled Curves
      const createWingShape = (): THREE.Shape => {
        const shape = new THREE.Shape()
        shape.moveTo(0, 0)
        // High arched primary feather
        shape.bezierCurveTo(0.04, 0.08, 0.12, 0.22, 0.24, 0.26)
        // Primary feather tip to notch 1
        shape.bezierCurveTo(0.19, 0.19, 0.21, 0.17, 0.26, 0.15)
        // Mid feather tip to notch 2
        shape.bezierCurveTo(0.20, 0.09, 0.21, 0.07, 0.23, 0.03)
        // Lower feather tip to notch 3
        shape.bezierCurveTo(0.17, -0.02, 0.15, -0.04, 0.17, -0.07)
        // Bottom smooth return curve to base
        shape.bezierCurveTo(0.10, -0.05, 0.04, -0.03, 0, 0)
        return shape
      }

      const wingShape = createWingShape()
      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: 0.018,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.010,
        bevelThickness: 0.010,
      }
      const wingGeo = new THREE.ExtrudeGeometry(wingShape, extrudeSettings)
      wingGeo.center()

      const leftWingPivot = new THREE.Group()
      leftWingPivot.position.set(-0.09, 0.08, 0)
      const leftWing = new THREE.Mesh(wingGeo, accMat)
      leftWing.position.set(-0.10, 0.04, -0.04)
      leftWing.rotation.set(-0.25, -0.35, 0.20)
      leftWingPivot.add(leftWing)

      const rightWingPivot = new THREE.Group()
      rightWingPivot.position.set(0.09, 0.08, 0)
      const rightWing = new THREE.Mesh(wingGeo, accMat)
      rightWing.position.set(0.10, 0.04, -0.04)
      rightWing.scale.set(-1, 1, 1)
      rightWing.rotation.set(-0.25, 0.35, -0.20)
      rightWingPivot.add(rightWing)

      sockets.back.add(leftWingPivot, rightWingPivot)
      springBones.push(
        new SpringBone(leftWingPivot, { stiffness: 120, damping: 10, maxAngle: 0.45 }),
        new SpringBone(rightWingPivot, { stiffness: 120, damping: 10, maxAngle: 0.45 }),
      )
    }
  }

  disposeGeometries(): void {
    this.group.traverse((obj) => {
      if ('geometry' in obj && obj.geometry) {
        (obj.geometry as THREE.BufferGeometry).dispose()
      }
    })
  }

  dispose(): void {
    this.faceTexture.dispose()
    Object.values(this.rig.materials).forEach((m) => m.dispose())
    this.disposeGeometries()
  }
}
