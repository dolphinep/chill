import * as THREE from 'three/webgpu'
import { clamp, mix, mrt, output, positionGeometry, positionWorld, vec3, vec4 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import type { CoastalTerrainSpec } from '@/engine/terrain/HeightSpec'
import { scatterInBand, type ScatterInstance } from '@/engine/terrain/Scatter'
import { windOffset } from './wind'

/**
 * Grass: a single instanced mesh of two crossed triangles per blade — 2 triangles,
 * no texture, no alpha test. A textured alpha-cut quad looks better per-blade, but at
 * the density that actually reads as "ground cover" (tens of thousands of instances)
 * alpha-tested overdraw becomes the cost driver; a solid taper avoids it entirely.
 */

type F = Node<'float'>
type V3 = Node<'vec3'>

const BLADE_WIDTH = 0.045
const BLADE_HEIGHT = 0.34

function createBladeGeometry(): THREE.BufferGeometry {
  const w = BLADE_WIDTH
  const h = BLADE_HEIGHT
  // Two triangles crossed at 90° so the blade reads from any yaw, not just face-on.
  const positions = new Float32Array([-w, 0, 0, w, 0, 0, 0, h, 0, 0, 0, -w, 0, 0, w, 0, h, 0])
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  return geometry
}

function createGrassMaterial(): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
  })

  const heightWeight = clamp(positionGeometry.y.div(BLADE_HEIGHT), 0, 1) as F
  const wind = windOffset(heightWeight, { strength: 0.14, speed: 1.7 })

  // `positionWorld` here is the instance-transformed vertex position (root translate +
  // yaw + scale already applied) — see terrainMaterial's positionNode for why re-basing
  // on it rather than positionLocal is safe: this mesh's own model matrix is identity,
  // so world space and the "local" space the material system expects coincide.
  material.positionNode = positionWorld.add(wind) as V3

  // Root reads shaded/damp, tip reads sun-dried — the same read as the terrain's own
  // wet-sand-to-dry-sand gradient, so grass and ground agree about where "dry" starts.
  const rootColor = vec3(0.15, 0.3, 0.12)
  const tipColor = vec3(0.5, 0.54, 0.22)
  material.colorNode = mix(rootColor, tipColor, heightWeight) as V3

  // Every material the bloom MRT pass touches must write both targets, or WebGL/WebGPU
  // rejects the draw with "missing fragment shader outputs" (see terrainMaterial).
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })

  return material
}

export type GrassField = {
  mesh: THREE.InstancedMesh
  count: number
  dispose: () => void
}

export function createGrassField(spec: CoastalTerrainSpec): GrassField {
  const instances = scatterInBand(spec, {
    radius: Math.min(spec.islandRadiusM + 10, spec.halfExtentM - 5),
    referenceHeightM: spec.seaLevelM,
    cellSize: 1.1,
    maxPerCell: 5,
    minAboveSea: 1.6,
    maxAboveSea: 14,
    minSlope: 0.62,
    patchFrequency: 0.045,
    patchThreshold: 0.32,
    seedSalt: 0xa17,
  })

  const geometry = createBladeGeometry()
  const material = createGrassMaterial()

  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(instances.length, 1))
  mesh.castShadow = false
  mesh.receiveShadow = true
  mesh.frustumCulled = false // instances are spread over the whole island; a single AABB helps little

  fillInstances(mesh, instances)

  return {
    mesh,
    count: instances.length,
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
    m.compose(
      new THREE.Vector3(inst.x, inst.y, inst.z),
      q,
      new THREE.Vector3(inst.scale, inst.scale, inst.scale),
    )
    mesh.setMatrixAt(i, m)

    // Per-blade tint variance, multiplied onto the material's colorNode automatically
    // (NodeMaterial does this whenever `instanceColor` is present) — this is what stops
    // a dense field of identical blades reading as a stamped texture.
    const v = 0.85 + inst.variant * 0.3
    color.setRGB(v, 0.9 + (inst.variant - 0.5) * 0.2, v)
    mesh.setColorAt(i, color)
  })

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}
