import {
  attribute,
  floor,
  ivec2,
  mix,
  positionLocal,
  textureLoad,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import type { DataTexture } from 'three'
import type { Node } from 'three/webgpu'
import type { BoneTextureLayout } from '@/engine/avatars/BoneTextureBaker'

/**
 * Instanced skinning from a bone texture, entirely in the vertex stage.
 *
 * This replaces three's built-in skinning path: the mesh is a plain `InstancedMesh`
 * (not a `SkinnedMesh`), so three applies no skinning of its own and this node owns
 * the whole transform. Geometry keeps its normal `skinIndex` / `skinWeight`
 * attributes, so LODs and attachments still work — only the *source* of the bone
 * matrices changes, from a CPU-updated `Skeleton` to a texture.
 *
 * Per-instance state is two static floats (`aAnim` = clip index, phase offset). The
 * GPU advances playback from a single uniform clock, so adding an avatar costs no
 * per-frame JavaScript at all.
 */

type F = Node<'float'>
type V3 = Node<'vec3'>

export type VatSkinningOptions = {
  boneTexture: DataTexture
  layout: BoneTextureLayout
  /** Seconds per clip loop. Frames are sampled across this duration. */
  clipDuration: number
}

export function createVatSkinning({ boneTexture, layout, clipDuration }: VatSkinningOptions) {
  const { bones, frames } = layout
  const time = uniform(0)

  // (clipIndex, phaseOffset) per instance — static for the lifetime of the avatar.
  const anim = attribute<'vec2'>('aAnim', 'vec2')
  const clipIndex = anim.x as F
  const phase = anim.y as F

  /** Fetch one row of a bone's 3x4 matrix at an exact texel — no filtering. */
  const row = (clip: F, bone: F, r: number, frame: F) => {
    const y = clip
      .mul(bones * 3)
      .add(bone.mul(3))
      .add(r)
    return textureLoad(boneTexture, ivec2(frame.toInt(), y.toInt()))
  }

  /**
   * Transform a position by a bone at a given frame. Multiplies the 3x4 directly
   * rather than materialising a Matrix4 — the bottom row is implicitly (0,0,0,1).
   */
  const applyBone = (clip: F, bone: F, frame: F, p: V3): V3 => {
    const p4 = vec4(p, 1)
    return vec3(
      row(clip, bone, 0, frame).dot(p4),
      row(clip, bone, 1, frame).dot(p4),
      row(clip, bone, 2, frame).dot(p4),
    )
  }

  /** Blend the same bone across two adjacent frames, so playback is smooth. */
  const applyBoneBlended = (clip: F, bone: F, f0: F, f1: F, t: F, p: V3): V3 =>
    mix(applyBone(clip, bone, f0, p), applyBone(clip, bone, f1, p), t)

  const skinnedPosition = (): V3 => {
    // Playback cursor from one uniform clock — no per-instance CPU work.
    const cursor = time.add(phase).div(clipDuration).fract().mul(frames)
    const f0 = floor(cursor) as F
    const f1 = f0.add(1).mod(frames) as F
    const t = cursor.sub(f0) as F

    const idx = attribute<'vec4'>('skinIndex', 'vec4')
    const wgt = attribute<'vec4'>('skinWeight', 'vec4')
    const p = positionLocal as V3

    // Four influences, matching three's standard skinning.
    const influences: [F, F][] = [
      [idx.x as F, wgt.x as F],
      [idx.y as F, wgt.y as F],
      [idx.z as F, wgt.z as F],
      [idx.w as F, wgt.w as F],
    ]

    let acc: V3 = vec3(0, 0, 0)
    for (const [bone, weight] of influences) {
      acc = acc.add(applyBoneBlended(clipIndex, bone, f0, f1, t, p).mul(weight)) as V3
    }
    return acc
  }

  return {
    /** Assign to `material.positionNode`. */
    positionNode: skinnedPosition(),
    /** Advance once per frame for the whole crowd — this is the entire per-frame cost. */
    setTime: (seconds: number) => {
      time.value = seconds
    },
  }
}
