import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clamp, mrt, output, positionGeometry, positionWorld, vertexColor, vec4 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import type { RidgeTerrainSpec } from '@/engine/terrain/HeightSpec'
import {
  collidersFromInstances,
  scatterInBand,
  type Collider,
  type ScatterInstance,
} from '@/engine/terrain/Scatter'
import { windOffset } from './wind'

type F = Node<'float'>
type V3 = Node<'vec3'>

const TRUNK_COLOR = new THREE.Color(0.24, 0.16, 0.10)
const AUTUMN_COLORS = [
  new THREE.Color(0xd9480f), // Crimson red maple
  new THREE.Color(0xf08c00), // Rich amber orange
  new THREE.Color(0xfcc419), // Golden yellow ginkgo
  new THREE.Color(0xc92a2a), // Deep scarlet
  new THREE.Color(0x94d82d), // Autumn yellow-green
]

function ensureNonIndexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geometry.index) {
    const nonIndexed = geometry.toNonIndexed()
    geometry.dispose()
    return nonIndexed
  }
  return geometry
}

function withVertexColor(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geometry.attributes.position!.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function createAutumnTreeGeometry(): THREE.BufferGeometry {
  const trunkHeight = 2.4
  const trunkRadius = 0.14
  const trunk = ensureNonIndexed(new THREE.CylinderGeometry(trunkRadius * 0.65, trunkRadius, trunkHeight, 6))
  trunk.translate(0, trunkHeight / 2, 0)
  withVertexColor(trunk, TRUNK_COLOR)

  // Stylized low-poly faceted leafy canopies (lightweight and artistic)
  const canopy1 = ensureNonIndexed(new THREE.IcosahedronGeometry(1.4, 0))
  canopy1.scale(1.2, 0.85, 1.1)
  canopy1.translate(0, trunkHeight + 0.8, 0)
  withVertexColor(canopy1, AUTUMN_COLORS[0]!)

  const canopy2 = ensureNonIndexed(new THREE.IcosahedronGeometry(1.1, 0))
  canopy2.scale(1.0, 0.9, 1.0)
  canopy2.translate(0.45, trunkHeight + 1.5, 0.15)
  withVertexColor(canopy2, AUTUMN_COLORS[1]!)

  const canopy3 = ensureNonIndexed(new THREE.IcosahedronGeometry(0.9, 0))
  canopy3.scale(0.9, 0.8, 0.9)
  canopy3.translate(-0.4, trunkHeight + 1.8, -0.25)
  withVertexColor(canopy3, AUTUMN_COLORS[2]!)

  const merged = mergeGeometries([trunk, canopy1, canopy2, canopy3], false)
  trunk.dispose()
  canopy1.dispose()
  canopy2.dispose()
  canopy3.dispose()

  if (!merged) throw new Error('failed to merge autumn tree geometry')
  merged.computeVertexNormals()
  return merged
}

function createAutumnTreeMaterial(): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0 })
  material.vertexColors = true

  const heightWeight = clamp(positionGeometry.y.div(5.5), 0, 1) as F
  const wind = windOffset(heightWeight, { strength: 0.12, speed: 1.2 })
  material.positionNode = positionWorld.add(wind) as V3
  material.colorNode = vertexColor()
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })

  return material
}

export type AutumnTreeField = {
  mesh: THREE.InstancedMesh
  count: number
  colliders: Collider[]
  dispose: () => void
}

const TRUNK_COLLISION_RADIUS = 0.45

export function createAutumnTreeField(spec: RidgeTerrainSpec): AutumnTreeField {
  const instances = scatterInBand(spec, {
    radius: Math.min(spec.valleyRadiusM + 90, spec.halfExtentM - 20),
    referenceHeightM: spec.valleyFloorM,
    cellSize: 6.5,
    maxPerCell: 2,
    minAboveSea: 0.6,
    maxAboveSea: spec.treeLineM + 2,
    minSlope: 0.60,
    patchFrequency: 0.035,
    patchThreshold: 0.45,
    seedSalt: 0x7b21,
  })

  const geometry = createAutumnTreeGeometry()
  const material = createAutumnTreeMaterial()

  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(instances.length, 1))
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false

  fillInstances(mesh, instances)

  return {
    mesh,
    count: instances.length,
    colliders: collidersFromInstances(instances, TRUNK_COLLISION_RADIUS),
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}

function fillInstances(mesh: THREE.InstancedMesh, instances: ScatterInstance[]): void {
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const color = new THREE.Color()

  instances.forEach((inst, i) => {
    euler.set(0, inst.rotY, 0)
    q.setFromEuler(euler)

    // Varied heights (สูงๆ ต่ำๆ): Small saplings (0.65x), medium trees (1.1x), tall ancient maples (2.2x)
    const heightVariant = 0.65 + inst.variant * 1.55
    const s = inst.scale * heightVariant
    const sy = s * (0.9 + (inst.variant - 0.5) * 0.3)
    m.compose(new THREE.Vector3(inst.x, inst.y, inst.z), q, new THREE.Vector3(s, sy, s))
    mesh.setMatrixAt(i, m)

    // Rich color distribution across autumn palette
    const colorIdx = Math.floor(inst.variant * AUTUMN_COLORS.length) % AUTUMN_COLORS.length
    const baseColor = AUTUMN_COLORS[colorIdx]!
    const v = 0.88 + (inst.variant * 0.24)
    color.copy(baseColor).multiplyScalar(v)
    mesh.setColorAt(i, color)
  })

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}
