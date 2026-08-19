import { BufferAttribute, CylinderGeometry, Matrix4, Quaternion, Vector3 } from 'three'

/**
 * A procedural stand-in rig for S3 — a bone chain up a tapered cylinder.
 *
 * The point of the spike is the *skinning mechanism*, not the art, and a procedural
 * rig removes an asset dependency from the highest-risk experiment. The bone count
 * and influence count match the real budget (<=40 bones, 4 influences), so the
 * measured cost transfers.
 */

export const RIG_BONES = 40
export const RIG_HEIGHT = 1.8

export function createRiggedGeometry(radialSegments = 10, heightSegments = 48) {
  const geo = new CylinderGeometry(0.1, 0.16, RIG_HEIGHT, radialSegments, heightSegments)
  geo.translate(0, RIG_HEIGHT / 2, 0)

  const pos = geo.attributes.position as BufferAttribute
  const count = pos.count
  const skinIndex = new Float32Array(count * 4)
  const skinWeight = new Float32Array(count * 4)

  for (let i = 0; i < count; i++) {
    const y = pos.getY(i)
    // Bone space runs 0..RIG_BONES-1 up the height.
    const b = (y / RIG_HEIGHT) * (RIG_BONES - 1)
    const b0 = Math.max(0, Math.min(RIG_BONES - 1, Math.floor(b)))
    const b1 = Math.min(RIG_BONES - 1, b0 + 1)
    const t = b - b0

    skinIndex[i * 4] = b0
    skinIndex[i * 4 + 1] = b1
    skinWeight[i * 4] = 1 - t
    skinWeight[i * 4 + 1] = t
    // Influences 2 and 3 stay zero — still exercises the 4-influence code path.
  }

  geo.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4))
  geo.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4))
  return geo
}

/**
 * Bone pose for (clip, frame, bone). Each clip is a travelling sine wave up the
 * chain with a different frequency, which makes a wrong bone index or a wrong frame
 * blend immediately visible rather than subtly off.
 */
export function poseBone(
  clip: number,
  frame: number,
  frames: number,
  bone: number,
  out: Matrix4,
): void {
  const restY = (bone / (RIG_BONES - 1)) * RIG_HEIGHT
  const phase = (frame / frames) * Math.PI * 2
  const freq = 1 + clip * 0.9
  const amp = 0.05 + clip * 0.02

  const bend = Math.sin(phase * freq + (bone / RIG_BONES) * Math.PI * 2) * amp
  // Cumulative bend along the chain, so the tip swings further than the base.
  const sway = bend * (bone / RIG_BONES) * RIG_HEIGHT

  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), bend * 1.2)
  const t = new Vector3(sway, restY, 0)

  out.compose(t, q, new Vector3(1, 1, 1))
  // Undo the rest position so the matrix is a true bind-pose delta.
  out.multiply(new Matrix4().makeTranslation(0, -restY, 0))
}
