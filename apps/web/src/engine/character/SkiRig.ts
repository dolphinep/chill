import * as THREE from 'three/webgpu'
import type { ChibiRigParts } from './ChibiAvatarMesh'

/**
 * Two small ski meshes parented onto an existing chibi rig's `rootGroup` (Frostholm
 * Ridge exclusive) — deliberately NOT the leg pivots. `ChibiAnimator`'s ski pose bends
 * the knee (`leftLegPivot.rotation.x = -0.55`) and the torso leans/banks
 * (`torsoPivot.rotation`), and `leftLegPivot` is a child of `torsoPivot` — a ski
 * parented there would stack both rotations and pitch up at a steep, wrong angle
 * instead of lying flat on the ground. `rootGroup` only ever inherits the avatar
 * group's yaw (set externally in `Engine.ts` to match facing), never pitch/lean, so a
 * ski attached here stays level regardless of animation pose.
 *
 * Deliberately NOT built inside `ChibiAvatarMesh` itself — `updateConfig()` fully
 * rebuilds the rig on any hair/outfit/accessory change, and because these two mesh
 * objects are created once and reused, `attachSkis` just needs calling again after
 * such a rebuild (`Object3D.add` reparents automatically, so there's nothing to
 * explicitly detach from the old, now-discarded rig).
 */

const SKI_WIDTH_M = 0.09
const SKI_THICKNESS_M = 0.025
const SKI_LENGTH_M = 0.62
/** Roughly under the feet in the rig's rest pose (`rootGroup` → `torsoPivot` at
 * y=0.28 → leg pivot at y=-0.02 → shoe at y=-0.18, x=±0.09 — same rest-pose spot the
 * old leg-pivot-relative offset landed on, just expressed directly in `rootGroup`
 * space instead of inheriting it through three stacked transforms). */
const SKI_HEIGHT_M = 0.055
const SKI_FORWARD_M = 0.08
const SKI_SIDE_M = 0.09

export type SkiPair = {
  left: THREE.Mesh
  right: THREE.Mesh
  dispose(): void
}

export function createSkiPair(): SkiPair {
  const geometry = new THREE.BoxGeometry(SKI_WIDTH_M, SKI_THICKNESS_M, SKI_LENGTH_M)
  const material = new THREE.MeshStandardMaterial({
    color: '#e0483c',
    roughness: 0.35,
    metalness: 0.35,
  })

  const left = new THREE.Mesh(geometry, material)
  left.position.set(-SKI_SIDE_M, SKI_HEIGHT_M, SKI_FORWARD_M)
  left.castShadow = true

  const right = new THREE.Mesh(geometry, material)
  right.position.set(SKI_SIDE_M, SKI_HEIGHT_M, SKI_FORWARD_M)
  right.castShadow = true

  return {
    left,
    right,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}

/** Idempotent — safe to call again after `ChibiAvatarMesh.updateConfig()` rebuilds
 * the rig, since reparenting an already-parented object is a harmless no-op. */
export function attachSkis(rig: ChibiRigParts, skis: SkiPair): void {
  rig.rootGroup.add(skis.left, skis.right)
}
