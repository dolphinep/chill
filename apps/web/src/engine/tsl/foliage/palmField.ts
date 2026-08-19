import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clamp, mrt, output, positionGeometry, positionWorld, vertexColor, vec4 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import type { CoastalTerrainSpec } from '@/engine/terrain/HeightSpec'
import {
  collidersFromInstances,
  scatterInBand,
  type Collider,
  type ScatterInstance,
} from '@/engine/terrain/Scatter'
import { windOffset } from './wind'

/**
 * A coconut palm, primitives merged into one geometry, vertex-coloured rather than a
 * second material — same one-draw-call-per-batch trick as `pineField.ts`. Rebuilt from
 * an earlier placeholder (one straight leaning capsule + flat triangle fronds, which
 * read as "a leaning pole with paper fans" rather than a coconut tree) around the three
 * cues that actually sell "coconut palm": a trunk that *arcs*, not just leans at a
 * constant angle; fronds with a feathered pinnate silhouette, not solid triangles; and
 * a coconut cluster under the crown, the one unambiguous identifying feature a generic
 * palm doesn't have.
 */

type F = Node<'float'>
type V3 = Node<'vec3'>

const TRUNK_LENGTH = 3.0
const TRUNK_SEGMENTS = 5
const TRUNK_RADIUS_BASE = 0.13
const TRUNK_RADIUS_TOP = 0.07
/** Radians of additional lean accumulated per segment — this, not a single constant
 * tilt, is what turns a leaning pole into an arc. */
const TRUNK_LEAN_INCREMENT = 0.055

const CROWN_SHAFT_LENGTH = 0.32
const CROWN_SHAFT_RADIUS_BASE = 0.085
const CROWN_SHAFT_RADIUS_TOP = 0.06

const FROND_COUNT = 9
const FROND_LENGTH = 1.7
/** Droop grows with `t^FROND_DROOP_POWER` — small near the crown, steep toward the
 * tip, which is what makes a frond arc instead of drooping in a straight line. */
const FROND_DROOP = 1.1
const FROND_DROOP_POWER = 1.8
/** A frond bursts slightly upward right at the crown before curving down. */
const FROND_UPLIFT = 0.14
const RACHIS_SAMPLES = 7
const RACHIS_HALF_WIDTH = 0.022
const LEAFLET_COUNT = 5
const LEAFLET_LENGTH_BASE = 0.34

const COCONUT_RADIUS = 0.11
const COCONUT_OFFSETS: [number, number, number][] = [
  [0.06, -0.06, 0.07],
  [-0.07, -0.09, 0.02],
  [0.02, -0.11, -0.06],
  [-0.03, -0.05, -0.08],
]

const TRUNK_COLOR = new THREE.Color(0.36, 0.27, 0.17)
const CROWN_SHAFT_COLOR = new THREE.Color(0.42, 0.5, 0.24)
const FROND_COLOR = new THREE.Color(0.22, 0.42, 0.18)
const COCONUT_COLOR = new THREE.Color(0.33, 0.24, 0.14)

function withVertexColor(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geometry.attributes.position!.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/**
 * A pinnate frond: a thin curved rachis (the central spine) with leaflet pairs
 * branching off at intervals, tapering toward the tip — a hand-built triangle soup
 * (matching the original single-triangle frond's approach) rather than a swept THREE
 * primitive, since neither a cone nor a capsule can produce this asymmetric curved
 * silhouette. `computeVertexNormals` needs `normal` — omitted here and computed once
 * on the whole merged tree instead, same as every other part.
 */
function frondGeometry(): THREE.BufferGeometry {
  const positions: number[] = []

  const sample = (t: number): { y: number; z: number } => ({
    z: t * FROND_LENGTH,
    y: FROND_UPLIFT * Math.sin(t * Math.PI * 0.35) - FROND_DROOP * Math.pow(t, FROND_DROOP_POWER),
  })

  // Rachis: a tapering ribbon of quads following the droop curve.
  for (let i = 0; i < RACHIS_SAMPLES - 1; i++) {
    const t0 = i / (RACHIS_SAMPLES - 1)
    const t1 = (i + 1) / (RACHIS_SAMPLES - 1)
    const p0 = sample(t0)
    const p1 = sample(t1)
    const w0 = RACHIS_HALF_WIDTH * (1 - 0.55 * t0)
    const w1 = RACHIS_HALF_WIDTH * (1 - 0.55 * t1)
    positions.push(-w0, p0.y, p0.z, w0, p0.y, p0.z, w1, p1.y, p1.z)
    positions.push(-w0, p0.y, p0.z, w1, p1.y, p1.z, -w1, p1.y, p1.z)
  }

  // Leaflets: a symmetric pair of thin triangles jutting from the rachis at several
  // points, shortening and drooping further back toward the tip.
  for (let i = 1; i <= LEAFLET_COUNT; i++) {
    const t = i / (LEAFLET_COUNT + 1)
    const p = sample(t)
    const len = LEAFLET_LENGTH_BASE * (1 - t * 0.5)
    const droopBack = 0.14 * t
    positions.push(
      0,
      p.y,
      p.z,
      len,
      p.y - droopBack,
      p.z + len * 0.5,
      0.02,
      p.y - 0.02,
      p.z + len * 0.9,
    )
    positions.push(
      0,
      p.y,
      p.z,
      -0.02,
      p.y - 0.02,
      p.z + len * 0.9,
      -len,
      p.y - droopBack,
      p.z + len * 0.5,
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  // `mergeGeometries` requires identical attribute sets across every part being
  // merged — the primitive-based parts (cylinders, spheres) all carry `normal` and
  // `uv`, so this hand-built one needs both too (the `uv` is otherwise unused — there's
  // no texture map). `computeVertexNormals` must run here, per-part, before merging —
  // the merged tree's own final `computeVertexNormals` call can't retroactively add an
  // attribute that isn't already present and consistent across every input.
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((positions.length / 3) * 2), 2))
  geometry.computeVertexNormals()
  return geometry
}

/** Builds the trunk as a chain of tapering cylinder segments, each leaning a little
 * further than the last — an accumulating rotation, not a fixed one, is what makes
 * this an arc instead of a straight tilted pole. Returns where (and at what
 * orientation) the trunk ends, so the crown shaft/fronds can continue naturally from
 * it instead of always pointing straight up regardless of how the trunk curved. */
function createTrunkGeometry(): {
  geometry: THREE.BufferGeometry
  tipPos: THREE.Vector3
  tipQuat: THREE.Quaternion
} {
  const segLength = TRUNK_LENGTH / TRUNK_SEGMENTS
  const cursor = new THREE.Vector3(0, 0, 0)
  const rot = new THREE.Quaternion()
  const zAxis = new THREE.Vector3(0, 0, 1)
  const segments: THREE.BufferGeometry[] = []

  for (let i = 0; i < TRUNK_SEGMENTS; i++) {
    const t0 = i / TRUNK_SEGMENTS
    const t1 = (i + 1) / TRUNK_SEGMENTS
    const rBottom = THREE.MathUtils.lerp(TRUNK_RADIUS_BASE, TRUNK_RADIUS_TOP, t0)
    const rTop = THREE.MathUtils.lerp(TRUNK_RADIUS_BASE, TRUNK_RADIUS_TOP, t1)
    const seg = new THREE.CylinderGeometry(rTop, rBottom, segLength, 8).toNonIndexed()
    seg.translate(0, segLength / 2, 0) // base at local origin, tip at +Y
    seg.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rot))
    seg.translate(cursor.x, cursor.y, cursor.z)
    segments.push(seg)

    cursor.add(new THREE.Vector3(0, segLength, 0).applyQuaternion(rot))
    rot.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, TRUNK_LEAN_INCREMENT))
  }

  const merged = mergeGeometries(segments, false)
  segments.forEach((g) => g.dispose())
  if (!merged) throw new Error('failed to merge palm trunk segments')
  withVertexColor(merged, TRUNK_COLOR)
  return { geometry: merged, tipPos: cursor, tipQuat: rot }
}

function createPalmGeometry(): { geometry: THREE.BufferGeometry; topY: number } {
  const { geometry: trunk, tipPos, tipQuat } = createTrunkGeometry()
  const tipRotation = new THREE.Matrix4().makeRotationFromQuaternion(tipQuat)

  const shaft = new THREE.CylinderGeometry(
    CROWN_SHAFT_RADIUS_TOP,
    CROWN_SHAFT_RADIUS_BASE,
    CROWN_SHAFT_LENGTH,
    8,
  ).toNonIndexed()
  shaft.translate(0, CROWN_SHAFT_LENGTH / 2, 0)
  shaft.applyMatrix4(tipRotation)
  shaft.translate(tipPos.x, tipPos.y, tipPos.z)
  withVertexColor(shaft, CROWN_SHAFT_COLOR)

  const crownPos = tipPos.clone().add(new THREE.Vector3(0, CROWN_SHAFT_LENGTH, 0).applyQuaternion(tipQuat))

  const parts: THREE.BufferGeometry[] = [trunk, shaft]

  for (let i = 0; i < FROND_COUNT; i++) {
    // The stagger (odd fronds nudged a little further round) keeps the fan from
    // reading as a perfectly even pinwheel, which is what a real crown never is.
    const angle = (i / FROND_COUNT) * Math.PI * 2 + (i % 2) * 0.15
    const frond = withVertexColor(frondGeometry(), FROND_COLOR)
    frond.rotateY(angle)
    // Aligns the whole fan to the crown's actual orientation (the trunk's
    // accumulated lean), so fronds burst from wherever the tree's top really ended
    // up rather than always straight up regardless of how far it arced.
    frond.applyMatrix4(tipRotation)
    frond.translate(crownPos.x, crownPos.y, crownPos.z)
    parts.push(frond)
  }

  for (const [ox, oy, oz] of COCONUT_OFFSETS) {
    const coconut = new THREE.SphereGeometry(COCONUT_RADIUS, 8, 6).toNonIndexed()
    coconut.translate(ox, oy, oz)
    coconut.applyMatrix4(tipRotation)
    coconut.translate(crownPos.x, crownPos.y, crownPos.z)
    parts.push(withVertexColor(coconut, COCONUT_COLOR))
  }

  const merged = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  if (!merged) throw new Error('failed to merge palm geometry')
  merged.computeVertexNormals()
  // Approximate top of the swaying crown, for the wind weight below — doesn't need
  // to be exact, just in the right ballpark so sway strength ramps up believably
  // from the (still) trunk base to the (swaying) fronds.
  return { geometry: merged, topY: crownPos.y + FROND_UPLIFT }
}

function createPalmMaterial(topY: number): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 })
  material.vertexColors = true

  const heightWeight = clamp(positionGeometry.y.div(topY), 0, 1) as F
  const wind = windOffset(heightWeight, { strength: 0.22, speed: 1.1 })
  material.positionNode = positionWorld.add(wind) as V3
  material.colorNode = vertexColor()
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })

  return material
}

export type PalmField = {
  mesh: THREE.InstancedMesh
  count: number
  colliders: Collider[]
  dispose: () => void
}

/** Wider than the literal trunk radius — a base and surface roots widen the real
 * footprint, and a too-thin collider reads as walking half-through the tree. */
const TRUNK_COLLISION_RADIUS = 0.3

export function createPalmField(spec: CoastalTerrainSpec): PalmField {
  const instances = scatterInBand(spec, {
    radius: Math.min(spec.islandRadiusM + 5, spec.halfExtentM - 5),
    referenceHeightM: spec.seaLevelM,
    cellSize: 9,
    maxPerCell: 1,
    minAboveSea: 0.8,
    maxAboveSea: 5,
    minSlope: 0.8,
    patchFrequency: 0.02,
    patchThreshold: 0.55, // sparse and clumped — small groves, not a hedge
    seedSalt: 0x9a1e,
  })

  const { geometry, topY } = createPalmGeometry()
  const material = createPalmMaterial(topY)

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
    const s = inst.scale * 0.9
    m.compose(new THREE.Vector3(inst.x, inst.y, inst.z), q, new THREE.Vector3(s, s, s))
    mesh.setMatrixAt(i, m)

    const v = 0.85 + inst.variant * 0.3
    color.setRGB(v, v, v)
    mesh.setColorAt(i, color)
  })

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}
