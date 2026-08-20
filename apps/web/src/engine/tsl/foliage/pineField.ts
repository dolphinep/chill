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

/**
 * A placeholder conifer, same spirit as `createPalmGeometry`: primitives merged into
 * one geometry, vertex-coloured rather than a second material. Three stacked cones
 * (narrowing toward the top) read as a conifer silhouette at a glance; a single cone
 * reads as a party hat.
 */

type F = Node<'float'>
type V3 = Node<'vec3'>

const TRUNK_HEIGHT = 0.5
const TRUNK_RADIUS = 0.08
const TIER_COUNT = 3
const TIER_BASE_RADIUS = 0.85
const TIER_HEIGHT = 1.3
// Each tier sits lower than the last one's top, so they overlap — a conifer's canopy
// is continuous, not three separate hats stacked with gaps.
const TIER_OVERLAP = 0.45

const TRUNK_COLOR = new THREE.Color(0.22, 0.15, 0.11)
const NEEDLE_COLOR = new THREE.Color(0.09, 0.19, 0.14)
const SNOW_CAP_COLOR = new THREE.Color(0.92, 0.94, 0.98)

const PINE_HEIGHT = TRUNK_HEIGHT + TIER_HEIGHT + (TIER_COUNT - 1) * (TIER_HEIGHT - TIER_OVERLAP)

function withVertexColor(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geometry.attributes.position!.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function createPineGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(
    TRUNK_RADIUS,
    TRUNK_RADIUS * 1.3,
    TRUNK_HEIGHT,
    6,
  ).toNonIndexed()
  trunk.translate(0, TRUNK_HEIGHT / 2, 0)
  withVertexColor(trunk, TRUNK_COLOR)

  const parts: THREE.BufferGeometry[] = [trunk]
  for (let i = 0; i < TIER_COUNT; i++) {
    const t = i / (TIER_COUNT - 1) // 0 at the base tier, 1 at the top
    const radius = TIER_BASE_RADIUS * (1 - t * 0.6)
    const tier = new THREE.ConeGeometry(radius, TIER_HEIGHT, 7).toNonIndexed()
    const baseY = TRUNK_HEIGHT + i * (TIER_HEIGHT - TIER_OVERLAP)
    tier.translate(0, baseY + TIER_HEIGHT / 2, 0)
    // The topmost tier's snow-catching cap gets tinted separately below — snow settles
    // on branches, not the trunk, and settles more toward the crown.
    const tint = NEEDLE_COLOR.clone().lerp(SNOW_CAP_COLOR, t * 0.35)
    withVertexColor(tier, tint)
    parts.push(tier)
  }

  const merged = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  if (!merged) throw new Error('failed to merge pine geometry')
  merged.computeVertexNormals()
  return merged
}

function createPineMaterial(): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 })
  material.vertexColors = true

  // Conifers sway far less than a palm frond — mostly the crown, barely the trunk.
  const heightWeight = clamp(positionGeometry.y.div(PINE_HEIGHT), 0, 1) as F
  const wind = windOffset(heightWeight, { strength: 0.09, speed: 1.3 })
  material.positionNode = positionWorld.add(wind) as V3
  material.colorNode = vertexColor()
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })

  return material
}

export type PineField = {
  mesh: THREE.InstancedMesh
  count: number
  colliders: Collider[]
  dispose: () => void
}

const TRUNK_COLLISION_RADIUS = 0.35

export function createPineField(spec: RidgeTerrainSpec): PineField {
  const instances = scatterInBand(spec, {
    radius: Math.min(spec.valleyRadiusM + 130, spec.halfExtentM - 5),
    referenceHeightM: spec.valleyFloorM,
    cellSize: 4,
    maxPerCell: 3,
    minAboveSea: 0.6,
    // Pines stop at the treeline — above it, just rock and snow.
    maxAboveSea: spec.treeLineM,
    minSlope: 0.55,
    patchFrequency: 0.025,
    patchThreshold: 0.42,
    seedSalt: 0x9e17,
  })

  const geometry = createPineGeometry()
  const material = createPineMaterial()

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
    const s = inst.scale * 0.85
    m.compose(new THREE.Vector3(inst.x, inst.y, inst.z), q, new THREE.Vector3(s, s, s))
    mesh.setMatrixAt(i, m)

    const v = 0.85 + inst.variant * 0.3
    color.setRGB(v, v, v)
    mesh.setColorAt(i, color)
  })

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}
