import { DataTexture, FloatType, Matrix4, NearestFilter, NoColorSpace, RGBAFormat } from 'three'

/**
 * Bakes animation clips into a bone texture (VAT-style), so the GPU can pose a crowd
 * with **zero per-avatar JavaScript**.
 *
 * The problem this solves: 100 `SkinnedMesh` instances is only 100 draw calls, which
 * is survivable — but each one costs an `AnimationMixer` interpolation pass plus bone
 * world-matrix propagation, roughly 30-80us of JS for a 40-bone rig. At 60us x 100
 * that is ~6ms/frame of pure JavaScript, which blows the entire frame budget before
 * anything is drawn. The cliff is on the CPU, not the GPU.
 *
 * Layout — a plain 2D RGBA-float texture (not a DataArrayTexture, which would add
 * array-sampling complexity for no benefit at this size):
 *
 *   width  = frames
 *   height = clips * bones * 3
 *   row(clip, bone, r) = clip * bones * 3 + bone * 3 + r
 *
 * Each bone is 3 consecutive texels holding the rows of a 3x4 affine matrix. The
 * bottom row of a rigid transform is always (0,0,0,1), so storing it would waste 25%
 * of the texture.
 *
 * For 40 bones x 20 clips x 32 frames that is 32 x 2400 RGBA-float = ~1.2 MB.
 */

export type BoneTextureLayout = {
  bones: number
  clips: number
  frames: number
  width: number
  height: number
}

export type PoseSampler = (clip: number, frame: number, bone: number, out: Matrix4) => void

export function bakeBoneTexture(
  layout: Omit<BoneTextureLayout, 'width' | 'height'>,
  sample: PoseSampler,
): { texture: DataTexture; layout: BoneTextureLayout } {
  const { bones, clips, frames } = layout
  const width = frames
  const height = clips * bones * 3

  const data = new Float32Array(width * height * 4)
  const m = new Matrix4()

  for (let c = 0; c < clips; c++) {
    for (let b = 0; b < bones; b++) {
      for (let f = 0; f < frames; f++) {
        sample(c, f, b, m)
        const e = m.elements // column-major

        // Rows of the 3x4 affine matrix. Column-major indexing: e[col*4 + row].
        for (let r = 0; r < 3; r++) {
          const row = c * bones * 3 + b * 3 + r
          const o = (row * width + f) * 4
          data[o] = e[r]! // col 0
          data[o + 1] = e[4 + r]! // col 1
          data[o + 2] = e[8 + r]! // col 2
          data[o + 3] = e[12 + r]! // col 3 (translation)
        }
      }
    }
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType)
  // Exact texel fetch only — frame blending is done explicitly in the shader, so any
  // hardware filtering here would silently smear between unrelated bones.
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.needsUpdate = true

  return { texture, layout: { bones, clips, frames, width, height } }
}
