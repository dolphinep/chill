import * as THREE from 'three/webgpu'
import { mrt, output, vec4 } from 'three/tsl'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import { findFlatSpotNear, sampleHeight } from '@/engine/terrain/HeightFieldCpu'
import { TARGET_COUNT } from '@chill/protocol'

/**
 * The target-practice mini-game's props — a short line of simple wooden posts a
 * consistent walk from wherever the player spawns, placed once at scene build via
 * `findFlatSpotNear` (see that function's own doc comment). Unlike the decorative
 * scatter fields (rocks/pines/snowman — placed once, never touched again), each
 * instance here has a runtime-mutable "knocked down" state: `setKnockedDown` rewrites
 * that one instance's matrix to a tipped-over pose instead of the scatter fields'
 * "set every instance once at construction" pattern.
 *
 * `TARGET_COUNT` (from `@chill/protocol`) is shared with the relay/wire protocol —
 * the array length here and the relay's `targetStates: boolean[]` must always agree,
 * which is exactly why that constant lives in the shared package, not duplicated.
 */

const TARGET_RADIUS = 0.16
const TARGET_HEIGHT = 0.55
const CLUSTER_SPACING = 0.85
const TARGET_COLOR = new THREE.Color(0.42, 0.3, 0.18)

export type TargetField = {
  mesh: THREE.InstancedMesh
  /** World XZ + hit radius per target, index-aligned with the relay's
   * `targetStates`/wire `targetId` — `ProjectileField`'s hit check and the
   * host-authoritative reset both key off this same index. */
  targets: { x: number; z: number; radius: number }[]
  setKnockedDown: (index: number, knockedDown: boolean) => void
  isKnockedDown: (index: number) => boolean
  /** `true` once every target is down — `Engine.ts` polls this to decide when to
   * start the reset countdown, rather than this field owning any timing itself
   * (placement/hit-state is this field's job; when to reset is a game-loop decision). */
  allKnockedDown: () => boolean
  dispose: () => void
}

export function createTargetField(spec: HeightSpec, spawnX: number, spawnZ: number): TargetField {
  const center = findFlatSpotNear(spec, spawnX, spawnZ, { minDistM: 6, maxDistM: 10 })

  // A short line, perpendicular to the spawn->cluster direction, so the whole row is
  // visible face-on from the direction a player would actually approach from.
  const toCenterX = center.x - spawnX
  const toCenterZ = center.z - spawnZ
  const len = Math.hypot(toCenterX, toCenterZ) || 1
  const perpX = -toCenterZ / len
  const perpZ = toCenterX / len

  const geometry = new THREE.CylinderGeometry(TARGET_RADIUS, TARGET_RADIUS * 1.1, TARGET_HEIGHT, 10)
  const material = new THREE.MeshStandardMaterial({ color: TARGET_COLOR, roughness: 0.85 })
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })

  const mesh = new THREE.InstancedMesh(geometry, material, TARGET_COUNT)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false

  const targets: { x: number; z: number; radius: number }[] = []
  const knockedDown = new Array<boolean>(TARGET_COUNT).fill(false)
  const standingMatrices: THREE.Matrix4[] = []
  const downMatrices: THREE.Matrix4[] = []

  const upQuat = new THREE.Quaternion()
  const downQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)

  for (let i = 0; i < TARGET_COUNT; i++) {
    const offset = (i - (TARGET_COUNT - 1) / 2) * CLUSTER_SPACING
    const tx = center.x + perpX * offset
    const tz = center.z + perpZ * offset
    const ty = sampleHeight(spec, tx, tz)
    targets.push({ x: tx, z: tz, radius: TARGET_RADIUS * 1.6 })

    const standing = new THREE.Matrix4().compose(
      new THREE.Vector3(tx, ty + TARGET_HEIGHT / 2, tz),
      upQuat,
      new THREE.Vector3(1, 1, 1),
    )
    // Tipped over, resting on its side — the exact rest height isn't physically
    // simulated (nothing here is), just close enough to read as "knocked down, lying
    // on the ground" rather than floating or clipping into the terrain.
    const down = new THREE.Matrix4().compose(
      new THREE.Vector3(tx, ty + TARGET_RADIUS, tz),
      downQuat,
      new THREE.Vector3(1, 1, 1),
    )
    standingMatrices.push(standing)
    downMatrices.push(down)
    mesh.setMatrixAt(i, standing)
  }
  mesh.instanceMatrix.needsUpdate = true

  function setKnockedDown(index: number, down: boolean): void {
    if (index < 0 || index >= TARGET_COUNT) return
    if (knockedDown[index] === down) return
    knockedDown[index] = down
    mesh.setMatrixAt(index, down ? downMatrices[index]! : standingMatrices[index]!)
    mesh.instanceMatrix.needsUpdate = true
  }

  return {
    mesh,
    targets,
    setKnockedDown,
    isKnockedDown: (index: number) => knockedDown[index] ?? false,
    allKnockedDown: () => knockedDown.every((v) => v),
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}
