import * as THREE from 'three/webgpu'
import { clamp, mix, mrt, output, positionGeometry, positionWorld, vec3, vec4 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import type { RidgeTerrainSpec } from '@/engine/terrain/HeightSpec'
import { scatterInBand, type ScatterInstance } from '@/engine/terrain/Scatter'
import { windOffset } from './wind'

type F = Node<'float'>
type V3 = Node<'vec3'>

const BLADE_WIDTH = 0.045
const BLADE_HEIGHT = 0.36

function createBladeGeometry(): THREE.BufferGeometry {
  const w = BLADE_WIDTH
  const h = BLADE_HEIGHT
  // Two triangles crossed at 90° so the blade reads from any yaw without looking like a flat board
  const positions = new Float32Array([-w, 0, 0, w, 0, 0, 0, h, 0, 0, 0, -w, 0, 0, w, 0, h, 0])
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  return geometry
}

function createGoldenGrassMaterial(): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
  })

  const heightWeight = clamp(positionGeometry.y.div(BLADE_HEIGHT), 0, 1) as F
  const wind = windOffset(heightWeight, { strength: 0.16, speed: 1.5 })
  material.positionNode = positionWorld.add(wind) as V3

  // Earthy soil root color blending to glowing golden-amber sunlit tip
  const rootColor = vec3(0.32, 0.2, 0.1)
  const tipColor = vec3(0.88, 0.64, 0.2)
  material.colorNode = mix(rootColor, tipColor, heightWeight) as V3
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })

  return material
}

export type GoldenGrassField = {
  mesh: THREE.InstancedMesh
  count: number
  dispose: () => void
}

export function createGoldenGrassField(spec: RidgeTerrainSpec): GoldenGrassField {
  const instances = scatterInBand(spec, {
    radius: Math.min(spec.valleyRadiusM + 60, spec.halfExtentM - 20),
    referenceHeightM: spec.valleyFloorM,
    cellSize: 1.4,
    maxPerCell: 4,
    minAboveSea: 0.2,
    maxAboveSea: spec.treeLineM + 2,
    minSlope: 0.65,
    patchFrequency: 0.042,
    patchThreshold: 0.35,
    seedSalt: 0x4a91,
  })

  const geometry = createBladeGeometry()
  const material = createGoldenGrassMaterial()

  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(instances.length, 1))
  mesh.castShadow = false
  mesh.receiveShadow = true
  mesh.frustumCulled = false

  fillGrassInstances(mesh, instances)

  return {
    mesh,
    count: instances.length,
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}

function fillGrassInstances(mesh: THREE.InstancedMesh, instances: ScatterInstance[]): void {
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const color = new THREE.Color()

  instances.forEach((inst, i) => {
    euler.set(0, inst.rotY, 0)
    q.setFromEuler(euler)

    // Natural scale variation for grass blades
    const s = inst.scale * (0.8 + inst.variant * 0.6)
    m.compose(new THREE.Vector3(inst.x, inst.y, inst.z), q, new THREE.Vector3(s, s, s))
    mesh.setMatrixAt(i, m)

    // Subtle tint variations between golden amber and warm ochre
    const v = 0.88 + inst.variant * 0.24
    color.setRGB(v, v * 0.92, v * 0.75)
    mesh.setColorAt(i, color)
  })

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}
