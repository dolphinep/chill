import * as THREE from 'three/webgpu'
import { Fn, uv, vec4 } from 'three/tsl'
import type { Node } from 'three/webgpu'

/**
 * Bake an arbitrary TSL function of world (x, z) into an R32F target, read it back
 * once, and diff it against a CPU function of the same signature.
 *
 * This is the bisection tool behind `goldenHeightCheck`: when the full height stack
 * disagrees, run the same harness on the coordinate mapping alone, then on the noise
 * primitive alone, and the divergence localises immediately instead of being guessed at.
 *
 * Readback lives HERE ONLY. It never appears in the collision path.
 */

type F = Node<'float'>

export type CompareResult = {
  label: string
  resolution: number
  samples: number
  maxAbsError: number
  meanAbsError: number
  worstAt: { x: number; z: number; cpu: number; gpu: number }
  /** True when readback rows run opposite to the shader's screen-space Y. */
  flipYNeeded: boolean
  directMaxError: number
  flippedMaxError: number
  gpuMin: number
  gpuMax: number
  nanCount: number
  /** Components per pixel in the readback buffer. RedFormat may return 1, not 4. */
  stride: number
  passed: boolean
  tolerance: number
}

export async function bakeAndCompare(
  renderer: THREE.Renderer,
  opts: {
    label: string
    resolution: number
    halfExtent: number
    tolerance: number
    gpu: (x: F, z: F) => F
    cpu: (x: number, z: number) => number
  },
): Promise<CompareResult> {
  const { label, resolution, halfExtent: half, tolerance, gpu: gpuFn, cpu: cpuFn } = opts

  const target = new THREE.RenderTarget(resolution, resolution, {
    type: THREE.FloatType,
    format: THREE.RedFormat,
    colorSpace: THREE.NoColorSpace,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  })

  const toWorld = (i: number) => ((i + 0.5) / resolution) * 2 * half - half

  const material = new THREE.NodeMaterial()
  material.fragmentNode = Fn(() => {
    // `uv` — NOT `screenCoordinate`. screenCoordinate is relative to the renderer's
    // viewport, which for an unsized offscreen renderer is the 300x150 canvas
    // default, so it silently disagrees with the render target's dimensions. Across
    // a fullscreen quad, uv interpolated at a fragment centre is exactly
    // (px + 0.5) / resolution, which is the mapping the CPU side reproduces.
    const q = uv()
    const x = q.x.mul(2).sub(1).mul(half)
    const z = q.y.mul(2).sub(1).mul(half)
    return vec4(gpuFn(x as F, z as F), 0, 0, 1)
  })()

  const quad = new THREE.QuadMesh(material)
  const prev = renderer.getRenderTarget()
  renderer.setRenderTarget(target)
  quad.render(renderer)
  renderer.setRenderTarget(prev)

  const raw = await renderer.readRenderTargetPixelsAsync(target, 0, 0, resolution, resolution)
  const buf = raw as unknown as Float32Array

  const samples = resolution * resolution

  /**
   * Do not assume an RGBA stride. This target is RedFormat, and the readback may
   * return one component per pixel — indexing with a hardcoded stride of 4 then
   * reads every fourth texel and silently walks off the end, which looks like a
   * coordinate bug rather than a layout bug.
   */
  const stride = Math.max(1, Math.round(buf.length / samples))
  const at = (row: number, col: number) => buf[(row * resolution + col) * stride]!
  let gpuMin = Infinity
  let gpuMax = -Infinity
  let nanCount = 0
  for (let i = 0; i < samples; i++) {
    const v = buf[i * stride]!
    if (Number.isNaN(v)) {
      nanCount++
      continue
    }
    if (v < gpuMin) gpuMin = v
    if (v > gpuMax) gpuMax = v
  }

  const score = (flipY: boolean) => {
    let maxAbs = 0
    let sumAbs = 0
    let counted = 0
    let worstAt = { x: 0, z: 0, cpu: 0, gpu: 0 }

    for (let row = 0; row < resolution; row++) {
      for (let px = 0; px < resolution; px++) {
        const g = at(row, px)
        if (!Number.isFinite(g)) continue

        const py = flipY ? resolution - 1 - row : row
        const x = toWorld(px)
        const z = toWorld(py)
        const c = cpuFn(x, z)
        if (!Number.isFinite(c)) continue

        const err = Math.abs(c - g)
        sumAbs += err
        counted++
        if (err > maxAbs) {
          maxAbs = err
          worstAt = { x, z, cpu: c, gpu: g }
        }
      }
    }
    return { maxAbs, meanAbs: counted ? sumAbs / counted : NaN, worstAt }
  }

  const direct = score(false)
  const flipped = score(true)
  const flipYNeeded = flipped.maxAbs < direct.maxAbs
  const best = flipYNeeded ? flipped : direct

  target.dispose()
  material.dispose()

  return {
    label,
    resolution,
    samples,
    maxAbsError: best.maxAbs,
    meanAbsError: best.meanAbs,
    worstAt: best.worstAt,
    flipYNeeded,
    directMaxError: direct.maxAbs,
    flippedMaxError: flipped.maxAbs,
    gpuMin,
    gpuMax,
    nanCount,
    stride,
    tolerance,
    passed: nanCount === 0 && best.maxAbs < tolerance,
  }
}
