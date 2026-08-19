import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mrt, output, vertexColor, vec4 } from 'three/tsl'
import type { RidgeTerrainSpec } from '@/engine/terrain/HeightSpec'
import { scatterInBand, type ScatterInstance } from '@/engine/terrain/Scatter'

/**
 * Frostholm Ridge only: a frozen pond's breathing hole — a pale broken-ice rim around a
 * dark disc of open water/shadow, flush with the ground. Ground-flush and walk-through
 * by design, same reasoning `Engine.ts` already gives for grass: nobody wants collision
 * math against a flat decal. Confined to genuinely flat, low ground near the valley
 * floor (see `scatterInBand` options below) — a real pond only forms there, not on a
 * mountainside.
 */

const OUTER_RADIUS = 0.85
const INNER_RADIUS = 0.5

const RIM_COLOR = new THREE.Color(0.78, 0.9, 0.95)
const WATER_COLOR = new THREE.Color(0.03, 0.09, 0.14)

function withVertexColor(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geometry.attributes.position!.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function createIceHoleGeometry(): THREE.BufferGeometry {
  // Flat circles, laid on the XZ plane (rotate -90° around X so their default +Z
  // normal becomes +Y) — the rim sits a hair above the water disc so it draws on top
  // without z-fighting.
  const rim = new THREE.CircleGeometry(OUTER_RADIUS, 24).toNonIndexed()
  rim.rotateX(-Math.PI / 2)
  rim.translate(0, 0.012, 0)
  withVertexColor(rim, RIM_COLOR)

  const water = new THREE.CircleGeometry(INNER_RADIUS, 24).toNonIndexed()
  water.rotateX(-Math.PI / 2)
  water.translate(0, 0.02, 0)
  withVertexColor(water, WATER_COLOR)

  const parts = [rim, water]
  const merged = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  if (!merged) throw new Error('failed to merge ice hole geometry')
  merged.computeVertexNormals()
  return merged
}

function createIceHoleMaterial(): THREE.MeshStandardNodeMaterial {
  // Glassy and near-flat — a still pond reflects, it doesn't scatter light the way
  // snow or ice-cliff facets do.
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.05 })
  material.vertexColors = true
  material.colorNode = vertexColor()
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })
  return material
}

export type IceHoleField = {
  mesh: THREE.InstancedMesh
  count: number
  dispose: () => void
}

export function createIceHoleField(spec: RidgeTerrainSpec): IceHoleField {
  const instances = scatterInBand(spec, {
    radius: Math.min(spec.valleyRadiusM + 40, spec.halfExtentM - 5),
    referenceHeightM: spec.valleyFloorM,
    cellSize: 20,
    maxPerCell: 1,
    // A pond forms right near the valley floor, not partway up the slope.
    minAboveSea: 0,
    maxAboveSea: 8,
    // Needs to be genuinely flat, same reasoning as the snowman field.
    minSlope: 0.92,
    patchFrequency: 0.018,
    patchThreshold: 0.6,
    seedSalt: 0x1ceb01e,
  })

  const geometry = createIceHoleGeometry()
  const material = createIceHoleMaterial()

  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(instances.length, 1))
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = false

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

  instances.forEach((inst, i) => {
    euler.set(0, inst.rotY, 0)
    q.setFromEuler(euler)
    const s = 0.8 + inst.variant * 0.5
    m.compose(new THREE.Vector3(inst.x, inst.y, inst.z), q, new THREE.Vector3(s, s, s))
    mesh.setMatrixAt(i, m)
  })

  mesh.instanceMatrix.needsUpdate = true
}
