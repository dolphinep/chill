import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * A procedural standing figure — arms relaxed at the sides, weight even. Same placeholder
 * philosophy as `SeatedFigure`: primitives merged into one geometry, one draw call, no
 * skinning. What matters right now is that a standing silhouette exists and grounds
 * correctly, not that it moves convincingly — a real rig replaces this file and nothing
 * else once one exists.
 *
 * Origin is at the ground between the feet, +Z is the facing direction, matching every
 * other spawn/heading convention in the engine (`spawn.yaw`, `SeatedFigure`).
 *
 * ~1.5m tall, stylised rather than realistic, same 7-heads-tall proportion as the seated
 * figure — consistent scale matters more than either being anatomically exact.
 */

const HEAD_R = 0.115

type Part = {
  geometry: THREE.BufferGeometry
  position: [number, number, number]
  rotation?: [number, number, number]
}

function capsule(radius: number, length: number): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(radius, length, 4, 10)
}

export function createStandingFigure(): THREE.BufferGeometry {
  const parts: Part[] = [
    // Legs, straight — an idle stance, not mid-stride. `CharacterController` has no
    // walk-cycle to drive a bent pose, and a straight stand reads correctly at rest.
    { geometry: capsule(0.065, 0.36), position: [-0.1, 0.24, 0] },
    { geometry: capsule(0.065, 0.36), position: [0.1, 0.24, 0] },
    { geometry: capsule(0.09, 0.36), position: [-0.1, 0.62, 0] },
    { geometry: capsule(0.09, 0.36), position: [0.1, 0.62, 0] },
    // Feet, flat on the ground.
    { geometry: new THREE.BoxGeometry(0.085, 0.05, 0.2), position: [-0.1, 0.025, 0.05] },
    { geometry: new THREE.BoxGeometry(0.085, 0.05, 0.2), position: [0.1, 0.025, 0.05] },

    // Torso, a slight backward lean — the same relaxed-not-alert cue `SeatedFigure` uses.
    { geometry: capsule(0.155, 0.42), position: [0, 1.0, 0], rotation: [-0.03, 0, 0] },
    // Neck
    { geometry: capsule(0.045, 0.05), position: [0, 1.28, 0] },
    // Head
    { geometry: new THREE.SphereGeometry(HEAD_R, 16, 12), position: [0, 1.42, 0.02] },

    // Arms hanging at the sides. A slight outward rotation at the shoulder keeps them
    // from clipping the torso; a slight forward rotation at the elbow is the difference
    // between "relaxed" and "at attention".
    { geometry: capsule(0.055, 0.28), position: [-0.2, 1.12, 0], rotation: [0, 0, 0.06] },
    { geometry: capsule(0.055, 0.28), position: [0.2, 1.12, 0], rotation: [0, 0, -0.06] },
    { geometry: capsule(0.045, 0.28), position: [-0.205, 0.83, 0.02], rotation: [0.05, 0, 0] },
    { geometry: capsule(0.045, 0.28), position: [0.205, 0.83, 0.02], rotation: [0.05, 0, 0] },
  ]

  const transformed = parts.map(({ geometry, position, rotation }) => {
    const g = geometry.clone()
    if (rotation) {
      g.rotateX(rotation[0])
      g.rotateY(rotation[1])
      g.rotateZ(rotation[2])
    }
    g.translate(...position)
    geometry.dispose()
    return g
  })

  const merged = mergeGeometries(transformed, false)
  transformed.forEach((g) => g.dispose())
  if (!merged) throw new Error('failed to merge standing figure geometry')
  merged.computeVertexNormals()
  return merged
}

/** Eye height when standing, for camera framing. */
export const STANDING_EYE_HEIGHT = 1.4
