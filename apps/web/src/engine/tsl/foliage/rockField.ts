import * as THREE from 'three/webgpu'
import { mrt, output, vec4 } from 'three/tsl'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import {
  collidersFromInstances,
  scatterInBand,
  type Collider,
  type ScatterInstance,
} from '@/engine/terrain/Scatter'

/**
 * Rocks: one low-poly icosahedron prototype, instanced with non-uniform per-axis scale
 * for shape variety — cheaper than authoring several rock meshes, and at scatter density
 * nobody is standing close enough to notice the repetition.
 */

export type RockField = {
  mesh: THREE.InstancedMesh
  count: number
  colliders: Collider[]
  dispose: () => void
}

/** The prototype icosahedron's radius before per-instance scale. */
const BASE_RADIUS = 0.42

export function createRockField(spec: HeightSpec): RockField {
  // Boulders/talus read as natural on either the beach or the autumn highlands, so this
  // is otherwise the one scatter field shared across archetypes — but bare granite talus
  // doesn't belong in a snow-bound alpine valley (see `HeightSpec.ts`'s doc comment on
  // `FROSTHOLM_RIDGE`): exposed ground there is themed as ice
  // (`snowTerrainMaterial.ts`), and `createSnowmanField`/`createIceHoleField` are its
  // scatter dressing instead. Skipped by id, not `spec.kind === 'ridge'`, since Aki
  // Highlands is also a ridge spec and keeps its rocks.
  const instances =
    spec.id === 'frostholm-ridge'
      ? []
      : scatterInBand(spec, {
          radius:
            spec.kind === 'coastal'
              ? Math.min(spec.islandRadiusM + 30, spec.halfExtentM - 5)
              : Math.min(spec.valleyRadiusM + 180, spec.halfExtentM - 5),
          referenceHeightM: spec.kind === 'coastal' ? spec.seaLevelM : spec.valleyFloorM,
          cellSize: 5,
          maxPerCell: 2,
          minAboveSea: 0.4,
          maxAboveSea: spec.kind === 'coastal' ? 30 : 70,
          // No slope gate: Kamakura Bay is gentle dunes end to end (per HeightSpec), so a
          // "cliffs only" filter matched nothing. Real beaches scatter boulders on flat
          // sand too — the patch-noise clumping is what keeps this from looking uniform.
          patchFrequency: 0.03,
          patchThreshold: 0.5,
          seedSalt: 0x50c3,
        })

  const geometry = new THREE.IcosahedronGeometry(BASE_RADIUS, 1)
  // Sink the prototype so its lower third sits below the placement point, i.e. the rock
  // reads as partly bedded in the sand rather than resting on top of it like a dropped ball.
  geometry.translate(0, -0.14, 0)
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardNodeMaterial({
    color: 0x716b60,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  })
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })

  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(instances.length, 1))
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false

  fillInstances(mesh, instances)

  return {
    mesh,
    count: instances.length,
    // Non-uniform per-axis scale (see `fillInstances`) makes a rock a squat boulder or a
    // jagged shard, but a collider only needs one number — `inst.scale` before that
    // per-axis stretch is the honest "how big is this instance" value.
    colliders: collidersFromInstances(instances, BASE_RADIUS),
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
    euler.set(inst.variant * 0.4 - 0.2, inst.rotY, inst.variant * 0.3 - 0.15)
    q.setFromEuler(euler)
    // Non-uniform scale is the whole trick: the same icosahedron reads as a squat
    // boulder or a jagged shard depending on which axis got stretched.
    const sx = inst.scale * (0.7 + inst.variant * 0.6)
    const sy = inst.scale * (0.6 + (1 - inst.variant) * 0.5)
    const sz = inst.scale * (0.7 + ((inst.variant * 7) % 1) * 0.6)
    m.compose(new THREE.Vector3(inst.x, inst.y, inst.z), q, new THREE.Vector3(sx, sy, sz))
    mesh.setMatrixAt(i, m)

    const v = 0.82 + inst.variant * 0.3
    color.setRGB(v, v * 0.97, v * 0.92)
    mesh.setColorAt(i, color)
  })

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}
