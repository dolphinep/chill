import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mrt, output, vertexColor, vec4 } from 'three/tsl'
import type { RidgeTerrainSpec } from '@/engine/terrain/HeightSpec'
import {
  collidersFromInstances,
  scatterInBand,
  type Collider,
  type ScatterInstance,
} from '@/engine/terrain/Scatter'

/**
 * Frostholm Ridge only: a rare, hand-built snowman — three stacked spheres, a stick-arm
 * pair, a carrot nose, a top hat, and a scatter of coal dots, all merged into one
 * vertex-coloured geometry (same trick as `createPineGeometry`). Deliberately much
 * sparser than the flora fields (`patchThreshold`/`maxPerCell` below) — this is a
 * once-in-a-while charming find, not ground cover.
 */

const BOTTOM_RADIUS = 0.4
const MIDDLE_RADIUS = 0.28
const HEAD_RADIUS = 0.19
const BOTTOM_Y = 0.32
const MIDDLE_Y = BOTTOM_Y + BOTTOM_RADIUS - 0.15
const HEAD_Y = MIDDLE_Y + MIDDLE_RADIUS - 0.1

const SNOW_COLOR = new THREE.Color(0.94, 0.96, 0.99)
const COAL_COLOR = new THREE.Color(0.08, 0.08, 0.09)
const CARROT_COLOR = new THREE.Color(0.85, 0.45, 0.12)
const TWIG_COLOR = new THREE.Color(0.32, 0.22, 0.14)
const HAT_COLOR = new THREE.Color(0.1, 0.1, 0.12)

function withVertexColor(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geometry.attributes.position!.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function createSnowmanGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  const bottom = new THREE.SphereGeometry(BOTTOM_RADIUS, 14, 10).toNonIndexed()
  bottom.translate(0, BOTTOM_Y, 0)
  parts.push(withVertexColor(bottom, SNOW_COLOR))

  const middle = new THREE.SphereGeometry(MIDDLE_RADIUS, 14, 10).toNonIndexed()
  middle.translate(0, MIDDLE_Y, 0)
  parts.push(withVertexColor(middle, SNOW_COLOR))

  const head = new THREE.SphereGeometry(HEAD_RADIUS, 14, 10).toNonIndexed()
  head.translate(0, HEAD_Y, 0)
  parts.push(withVertexColor(head, SNOW_COLOR))

  // Carrot nose, pointing forward (+Z).
  const nose = new THREE.ConeGeometry(0.025, 0.14, 6).toNonIndexed()
  nose.rotateX(Math.PI / 2)
  nose.translate(0, HEAD_Y, HEAD_RADIUS + 0.05)
  parts.push(withVertexColor(nose, CARROT_COLOR))

  // Coal eyes and buttons — tiny spheres, cheap to merge in, does most of the work of
  // reading as "a snowman" rather than "three snowballs."
  const dot = new THREE.SphereGeometry(0.018, 6, 5).toNonIndexed()
  ;[
    [-0.07, HEAD_Y + 0.03, HEAD_RADIUS - 0.02],
    [0.07, HEAD_Y + 0.03, HEAD_RADIUS - 0.02],
  ].forEach(([x, y, z]) => {
    const g = dot.clone().translate(x!, y!, z!)
    parts.push(withVertexColor(g, COAL_COLOR))
  })
  ;[-0.09, 0, 0.09].forEach((yOffset) => {
    const g = dot.clone().translate(0, MIDDLE_Y + yOffset, MIDDLE_RADIUS - 0.015)
    parts.push(withVertexColor(g, COAL_COLOR))
  })
  dot.dispose()

  // Twig arms, angled up and outward from the middle sphere.
  const armGeo = new THREE.CylinderGeometry(0.018, 0.012, 0.42, 5).toNonIndexed()
  const leftArm = armGeo.clone()
  leftArm.rotateZ(Math.PI / 2.6)
  leftArm.translate(-MIDDLE_RADIUS - 0.12, MIDDLE_Y + 0.05, 0)
  parts.push(withVertexColor(leftArm, TWIG_COLOR))
  const rightArm = armGeo.clone()
  rightArm.rotateZ(-Math.PI / 2.6)
  rightArm.translate(MIDDLE_RADIUS + 0.12, MIDDLE_Y + 0.05, 0)
  parts.push(withVertexColor(rightArm, TWIG_COLOR))
  armGeo.dispose()

  // Top hat: a wide flat brim plus a short cylinder crown.
  const brim = new THREE.CylinderGeometry(0.16, 0.16, 0.02, 16).toNonIndexed()
  brim.translate(0, HEAD_Y + HEAD_RADIUS - 0.02, 0)
  parts.push(withVertexColor(brim, HAT_COLOR))
  const crown = new THREE.CylinderGeometry(0.1, 0.11, 0.18, 16).toNonIndexed()
  crown.translate(0, HEAD_Y + HEAD_RADIUS + 0.08, 0)
  parts.push(withVertexColor(crown, HAT_COLOR))

  const merged = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  if (!merged) throw new Error('failed to merge snowman geometry')
  merged.computeVertexNormals()
  return merged
}

function createSnowmanMaterial(): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 })
  material.vertexColors = true
  material.colorNode = vertexColor()
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })
  return material
}

export type SnowmanField = {
  mesh: THREE.InstancedMesh
  count: number
  colliders: Collider[]
  dispose: () => void
}

export function createSnowmanField(spec: RidgeTerrainSpec): SnowmanField {
  const instances = scatterInBand(spec, {
    radius: Math.min(spec.valleyRadiusM + 150, spec.halfExtentM - 5),
    referenceHeightM: spec.valleyFloorM,
    cellSize: 14,
    maxPerCell: 1,
    minAboveSea: 1,
    // Below the treeline is plausible walking distance from wherever a visitor made
    // it; well past the snowline is plausible too, but the actual peaks are not.
    maxAboveSea: spec.snowLineM + 40,
    // A snowman needs genuinely flat ground to stand on — steeper than pines
    // tolerate, closer to the ice-hole's own flatness requirement.
    minSlope: 0.88,
    // High threshold + `maxPerCell: 1`: a rare find, never a clump.
    patchFrequency: 0.02,
    patchThreshold: 0.66,
    seedSalt: 0x50442,
  })

  const geometry = createSnowmanGeometry()
  const material = createSnowmanMaterial()

  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(instances.length, 1))
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false

  fillInstances(mesh, instances)

  return {
    mesh,
    count: instances.length,
    colliders: collidersFromInstances(instances, BOTTOM_RADIUS),
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

  // No per-instance `setColorAt` here, unlike pine/rock — those vary brightness
  // instance-to-instance because they're naturalistic clusters; a hand-built snowman
  // is a "crafted object" where every instance should just look the same.
  instances.forEach((inst, i) => {
    euler.set(0, inst.rotY, 0)
    q.setFromEuler(euler)
    // Small scale variance only — too big a range and either the smallest snowman
    // looks like a snowball or the largest towers over the character.
    const s = 0.85 + inst.variant * 0.3
    m.compose(new THREE.Vector3(inst.x, inst.y, inst.z), q, new THREE.Vector3(s, s, s))
    mesh.setMatrixAt(i, m)
  })

  mesh.instanceMatrix.needsUpdate = true
}
