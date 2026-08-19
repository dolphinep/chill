import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * A procedural seated figure — knees drawn up, forearms resting on them, looking out.
 *
 * **This is a placeholder for the authored GLTF**, and deliberately so. The thing that
 * actually needs designing here is the *moment*: where the camera sits, how much frame
 * the horizon gets, how large the silhouette reads. All of that can be judged from a
 * correct silhouette, and none of it should wait on an asset. Swapping in a real rig
 * later changes this file and nothing else.
 *
 * Built from primitives merged into a single geometry — one draw call, and no skinning
 * cost, since a seated idle only needs gentle whole-body motion (breathing, a slow
 * weight shift) rather than a skeleton.
 *
 * Proportions are ~7 heads tall, stylised rather than realistic: at the distance the sit
 * camera frames, anatomical accuracy is invisible but silhouette clarity is everything.
 */

const HEAD_R = 0.115

type Part = {
  geometry: THREE.BufferGeometry
  position: [number, number, number]
  rotation?: [number, number, number]
}

function capsule(radius: number, length: number, taper = 1): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(radius, length, 4, 10)
  if (taper !== 1) {
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      // Scale X/Z by height so limbs thin toward one end.
      const t = 1 + (y / (length * 0.5 + radius)) * (taper - 1)
      pos.setX(i, pos.getX(i) * t)
      pos.setZ(i, pos.getZ(i) * t)
    }
    pos.needsUpdate = true
  }
  return g
}

/**
 * Origin is at the sand under the seat, +Z is the facing direction (out to sea).
 */
export function createSeatedFigure(): THREE.BufferGeometry {
  const parts: Part[] = [
    // Torso, leaning back a little — a relaxed sit, not an alert one. The lean is the
    // single strongest cue that the figure is at rest rather than waiting.
    { geometry: capsule(0.145, 0.34, 0.82), position: [0, 0.42, -0.04], rotation: [-0.22, 0, 0] },
    // Head
    { geometry: new THREE.SphereGeometry(HEAD_R, 16, 12), position: [0, 0.71, 0.03] },
    // Neck
    { geometry: capsule(0.045, 0.05), position: [0, 0.6, 0.0] },

    // Thighs: from hip forward and up to the knees.
    { geometry: capsule(0.085, 0.3, 0.9), position: [-0.11, 0.3, 0.2], rotation: [1.15, 0, 0.06] },
    { geometry: capsule(0.085, 0.3, 0.9), position: [0.11, 0.3, 0.2], rotation: [1.15, 0, -0.06] },
    // Shins: from knee down to the sand.
    { geometry: capsule(0.068, 0.32, 0.85), position: [-0.12, 0.2, 0.42], rotation: [-0.7, 0, 0] },
    { geometry: capsule(0.068, 0.32, 0.85), position: [0.12, 0.2, 0.42], rotation: [-0.7, 0, 0] },
    // Feet, flat on the sand.
    { geometry: new THREE.BoxGeometry(0.085, 0.05, 0.19), position: [-0.12, 0.03, 0.55] },
    { geometry: new THREE.BoxGeometry(0.085, 0.05, 0.19), position: [0.12, 0.03, 0.55] },

    // Arms wrapped forward around the shins. Read from *behind* — which is the only
    // angle this shot ever shows — arms held out to the sides read as a blob with
    // sticks; wrapped arms give a compact, unmistakably human rounded silhouette.
    // Upper arms angle down and forward from the shoulders.
    {
      geometry: capsule(0.052, 0.2, 0.92),
      position: [-0.175, 0.44, 0.1],
      rotation: [0.95, 0, 0.16],
    },
    {
      geometry: capsule(0.052, 0.2, 0.92),
      position: [0.175, 0.44, 0.1],
      rotation: [0.95, 0, -0.16],
    },
    // Forearms come inward across the shins, hands nearly meeting.
    {
      geometry: capsule(0.045, 0.22, 0.85),
      position: [-0.13, 0.25, 0.38],
      rotation: [0.1, 0, -1.25],
    },
    {
      geometry: capsule(0.045, 0.22, 0.85),
      position: [0.13, 0.25, 0.38],
      rotation: [0.1, 0, 1.25],
    },
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
  if (!merged) throw new Error('failed to merge seated figure geometry')
  merged.computeVertexNormals()
  return merged
}

/** Eye height when seated, for camera framing. */
export const SEATED_EYE_HEIGHT = 0.71
