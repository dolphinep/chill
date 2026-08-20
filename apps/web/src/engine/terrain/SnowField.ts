import * as THREE from 'three/webgpu'
import { float, positionGeometry, smoothstep, texture, uniform, uv, vec4 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import {
  SAND_RESOLUTION,
  SAND_BOX_SIZE,
  worldToSandPixel,
  sandPixelToWorld,
  halfToFloat,
} from './sandBox'

/**
 * Persistent footprints in snow: the ridge scenery's counterpart to `SandField`, minus
 * everything sand-specific. Same ping-pong RG16F mechanism (R is depression depth) —
 * no shoreline, no wetness, so G is written but never read. Kept as its own class
 * rather than a `wetness: boolean` flag on `SandField`: the two fields serve terrain
 * kinds that share nothing else (no water, no shoreline geometry to trace at
 * construction), and that constructor-time difference is exactly the kind of branching
 * this codebase avoids by giving each archetype its own file.
 *
 * Tuned differently from sand on purpose: a boot sinks deeper into snow than a bare
 * foot into sand, and fresh powder does not re-level itself in the time a footprint
 * takes to fade at the beach — wind-packed snow drifts back over hours, not seconds.
 */

const REFILL_RATE = 0.012 // m/s — snow footprints fade naturally and smoothly over ~20 seconds
const MAX_DEPTH = 0.22 // 22cm deep boot impression

const MAX_FOOTPRINT_STAMPS = 32
const FOOTPRINT_RADIUS = 0.36

type F = Node<'float'>

export type FootprintStamp = { x: number; z: number; pressure: number }

export class SnowField {
  /** The texture consumers (the snow terrain material) should sample this frame. */
  texture: THREE.Texture

  #targets: [THREE.RenderTarget, THREE.RenderTarget]
  #readIndex = 0
  // Same reasoning as `SandField`'s camera: both passes write clip space directly, this
  // exists only because `renderer.render()` requires one, and it must be an
  // Orthographic/PerspectiveCamera or WebGPURenderer's `_updateCamera` throws on the
  // first frame.
  #camera: THREE.OrthographicCamera
  #frame = 0

  // One scene, not two — see `SandField`'s class doc comment: `renderer.autoClear`
  // applies per `.render()` call, so a separate decay-scene/stamp-scene split with two
  // `.render()` calls into the same target was clearing away the decay pass's output
  // every single frame. Three's opaque-before-transparent queue order (decay has no
  // `transparent` flag, the stamp mesh does) guarantees draw order within this one scene.
  #scene = new THREE.Scene()
  #decayMaterial: THREE.MeshBasicNodeMaterial
  #prevTextureNode: ReturnType<typeof texture>
  #dtUniform = uniform(0)

  #footprintMesh: THREE.InstancedMesh

  constructor() {
    const options = {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }
    this.#targets = [
      new THREE.RenderTarget(SAND_RESOLUTION, SAND_RESOLUTION, options),
      new THREE.RenderTarget(SAND_RESOLUTION, SAND_RESOLUTION, options),
    ]
    this.texture = this.#targets[0]!.texture

    const half = SAND_BOX_SIZE / 2
    this.#camera = new THREE.OrthographicCamera(-half, half, half, -half, -10, 10)
    this.#camera.position.set(0, 0, 1)
    this.#camera.lookAt(0, 0, 0)
    this.#camera.updateProjectionMatrix()

    const decayGeometry = new THREE.PlaneGeometry(SAND_BOX_SIZE, SAND_BOX_SIZE)
    this.#decayMaterial = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false })

    this.#prevTextureNode = texture(this.#targets[1]!.texture, uv())
    const prevRG = this.#prevTextureNode
    const finalR = prevRG.r.sub(this.#dtUniform.mul(REFILL_RATE)).max(0) as F
    this.#decayMaterial.colorNode = vec4(finalR.min(MAX_DEPTH), 0, 0, 1)

    const decayMesh = new THREE.Mesh(decayGeometry, this.#decayMaterial)
    decayMesh.renderOrder = 0
    this.#scene.add(decayMesh)

    // --- stamps: footprints only, no shoreline ring -----------------------------
    this.#footprintMesh = buildStampMesh(MAX_FOOTPRINT_STAMPS)
    this.#footprintMesh.renderOrder = 1
    this.#scene.add(this.#footprintMesh)
  }

  /** Run before the main scene render. `footprints` is the local player today, same as
   * `SandField` — room for other avatars once they exist. */
  update(renderer: THREE.Renderer, dt: number, footprints: FootprintStamp[]): void {
    const writeIndex = 1 - this.#readIndex
    const writeTarget = this.#targets[writeIndex]!
    const readTarget = this.#targets[this.#readIndex]!
    this.#prevTextureNode.value = readTarget.texture

    this.#dtUniform.value = dt

    this.#writeFootprints(footprints)

    // One render() call, one clear — see `SandField.update`'s doc comment.
    const prevTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(writeTarget)
    renderer.render(this.#scene, this.#camera)
    renderer.setRenderTarget(prevTarget)

    this.texture = writeTarget.texture
    this.#readIndex = writeIndex
    this.#frame++
  }

  #writeFootprints(footprints: FootprintStamp[]): void {
    const m = new THREE.Matrix4()
    const color = new THREE.Color()
    const count = Math.min(footprints.length, MAX_FOOTPRINT_STAMPS)
    const diameter = FOOTPRINT_RADIUS * 2
    for (let i = 0; i < count; i++) {
      const f = footprints[i]!
      m.compose(
        new THREE.Vector3(f.x, f.z, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(diameter, diameter, 1),
      )
      this.#footprintMesh.setMatrixAt(i, m)
      color.setRGB(f.pressure, 0, 0)
      this.#footprintMesh.setColorAt(i, color)
    }
    this.#footprintMesh.count = count
    this.#footprintMesh.instanceMatrix.needsUpdate = true
    if (this.#footprintMesh.instanceColor) this.#footprintMesh.instanceColor.needsUpdate = true
  }

  /** Diagnostic only — same reasoning AND the same row-stride fix as
   * `SandField.readDepthNear` (see its doc comment): the returned buffer pads each row
   * to a 256-byte boundary, so it cannot be indexed as a flat array. */
  async readDepthNear(
    renderer: THREE.Renderer,
    worldX: number,
    worldZ: number,
    patch = 9,
  ): Promise<number | null> {
    const center = worldToSandPixel(worldX, worldZ)
    if (!center) return null
    const half = Math.floor(patch / 2)
    const x = Math.max(0, Math.min(SAND_RESOLUTION - patch, center.x - half))
    const y = Math.max(0, Math.min(SAND_RESOLUTION - patch, center.y - half))
    const target = this.#targets[this.#readIndex]!
    const data = (await renderer.readRenderTargetPixelsAsync(
      target,
      x,
      y,
      patch,
      patch,
    )) as Uint16Array
    const bytesPerRow = Math.ceil((patch * 4) / 256) * 256
    const strideU16 = bytesPerRow / 2
    let max = 0
    for (let row = 0; row < patch; row++) {
      for (let col = 0; col < patch; col++) {
        max = Math.max(max, halfToFloat(data[row * strideU16 + col * 2]!))
      }
    }
    return max
  }

  /** Diagnostic only, and a heavy one — reads the ENTIRE texture back to find where the
   * actual maximum lives, converted to world coordinates. `readDepthNear` reads a small
   * patch centred on where a footprint is *expected*; if there's a coordinate mismatch
   * between the write path (GPU clip-space, via `worldToSandUV`) and the read path (CPU
   * pixel math, via `worldToSandPixel`) — a Y-flip, an axis swap, anything — a small
   * patch at the expected spot would silently read zero forever while the real data
   * sits somewhere else entirely. This settles that empirically instead of guessing at
   * the flip convention from three's source. Not meant to run every stats tick — call it
   * once, manually, via a dev command. */
  async scanForMax(
    renderer: THREE.Renderer,
  ): Promise<{ depth: number; worldX: number; worldZ: number } | null> {
    const target = this.#targets[this.#readIndex]!
    const data = (await renderer.readRenderTargetPixelsAsync(
      target,
      0,
      0,
      SAND_RESOLUTION,
      SAND_RESOLUTION,
    )) as Uint16Array
    const bytesPerRow = Math.ceil((SAND_RESOLUTION * 4) / 256) * 256
    const strideU16 = bytesPerRow / 2
    let max = 0
    let maxRow = -1
    let maxCol = -1
    for (let row = 0; row < SAND_RESOLUTION; row++) {
      const base = row * strideU16
      for (let col = 0; col < SAND_RESOLUTION; col++) {
        const v = halfToFloat(data[base + col * 2]!)
        if (v > max) {
          max = v
          maxRow = row
          maxCol = col
        }
      }
    }
    if (maxRow < 0) return null
    const { worldX, worldZ } = sandPixelToWorld(maxCol, maxRow)
    return { depth: max, worldX, worldZ }
  }

  dispose(): void {
    this.#targets[0]!.dispose()
    this.#targets[1]!.dispose()
    this.#decayMaterial.dispose()
    ;(this.#scene.children[0] as THREE.Mesh).geometry.dispose()
    this.#footprintMesh.geometry.dispose()
    ;(this.#footprintMesh.material as THREE.Material).dispose()
  }
}

/** Same construction as `SandField`'s stamp mesh, minus the wetness channel. */
function buildStampMesh(maxCount: number): THREE.InstancedMesh {
  const geometry = new THREE.PlaneGeometry(1, 1)

  const material = new THREE.MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    transparent: true,
  })
  material.blending = THREE.AdditiveBlending

  const dist = positionGeometry.xy.length().mul(2) as F
  const falloff = float(1.0)
    .sub(dist)
    .clamp(0, 1)
    .mul(smoothstep(float(1.0), float(0.0), dist)) as F

  material.colorNode = vec4(falloff.mul(MAX_DEPTH), 0, 0, 1)

  const mesh = new THREE.InstancedMesh(geometry, material, maxCount)
  mesh.frustumCulled = false
  mesh.count = 0
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 3), 3)
  return mesh
}
