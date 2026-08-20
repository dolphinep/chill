import * as THREE from 'three/webgpu'
import { float, positionGeometry, smoothstep, texture, uniform, uv, vec4 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import type { CoastalTerrainSpec } from './HeightSpec'
import { sampleHeight } from './HeightFieldCpu'
import {
  SAND_RESOLUTION,
  SAND_BOX_SIZE,
  worldToSandPixel,
  sandPixelToWorld,
  halfToFloat,
} from './sandBox'

/**
 * Persistent footprints + a wet band at the shoreline, on a static, non-scrolling
 * RG16F target ping-ponged across two frames — R is depression depth, G is wetness.
 *
 * **One scene, one `renderer.render()` call — not two.** An earlier version put the decay
 * quad and the stamp meshes in separate scenes and rendered each with its own `.render()`
 * call into the same target. `renderer.autoClear` (true by default) applies per CALL, not
 * per target, so the second call was clearing away everything the first had just written,
 * every frame — the field could never actually carry state forward. (Confirmed by reading
 * a reference WebGPU snow demo's own deformation pass: "one full-screen pass per frame...
 * there is no separate clear" is stated as a deliberate design constraint, not an
 * incidental detail.) Both the decay quad and the stamp meshes still bypass the
 * camera/projection pipeline entirely — clip-space output comes straight from geometry +
 * instance data via the one `worldToSandUV` mapping every consumer of this field shares —
 * they just live in the same scene now, and three's own opaque-before-transparent render
 * order (decay has no `transparent` flag; the stamp meshes do) is what guarantees the
 * decay pass's full-target overwrite happens before the stamps draw on top of it, within
 * one clear.
 *
 * **"Swash writes wetness" is a static ring of stamps, not a per-texel height lookup.**
 * The plan's phrasing suggests sampling the terrain height for every one of this target's
 * 4.19M texels, every frame, to know which texels sit at the waterline. That is a full
 * multi-octave noise evaluation 4M times a frame, for an app that budgets 8-10ms total —
 * measurably not free. The shoreline is static geometry (Kamakura Bay's terrain never
 * changes at runtime), so it only needs finding once: traced on the CPU at construction
 * the same way `findBeachSpawn` finds one point, just recording every crossing instead of
 * the best one, then re-stamped every frame same as a footprint — same mechanism, same
 * stamp budget, none of the per-texel cost.
 */

const REFILL_RATE = 0.015 // m/s — sand footprints fade smoothly over ~15-20 seconds
const WET_DECAY_RATE = 0.03 // wetness fades smoothly
const MAX_DEPTH = 0.2 // 20cm deep physical footprint impression

const MAX_FOOTPRINT_STAMPS = 32
const MAX_SHORE_STAMPS = 56
const SHORE_RAYS = 48
const FOOTPRINT_RADIUS = 0.32
const FOOTPRINT_WETNESS_FRACTION = 0.35
const SHORE_STAMP_RADIUS = 4.5
const SHORE_WETNESS_STRENGTH = 0.5

type F = Node<'float'>

export type FootprintStamp = { x: number; z: number; pressure: number }

export class SandField {
  /** The texture consumers (terrain, water) should sample this frame. */
  texture: THREE.Texture

  /** Every shoreline crossing found by `#placeShoreline`, world XZ — the audio engine
   * reuses these as its wave-emitter positions rather than re-tracing the same rays. */
  shorelinePoints: { x: number; z: number }[] = []

  #targets: [THREE.RenderTarget, THREE.RenderTarget]
  #readIndex = 0
  #camera: THREE.OrthographicCamera
  #frame = 0

  #scene = new THREE.Scene()
  #decayMaterial: THREE.MeshBasicNodeMaterial
  #prevTextureNode: ReturnType<typeof texture>
  #dtUniform = uniform(0)

  #footprintMesh: THREE.InstancedMesh
  #shoreMesh: THREE.InstancedMesh

  constructor(spec: CoastalTerrainSpec) {
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
    const finalG = prevRG.g.sub(this.#dtUniform.mul(WET_DECAY_RATE)).max(0) as F
    this.#decayMaterial.colorNode = vec4(finalR.min(MAX_DEPTH), finalG.min(1), 0, 1)

    const decayMesh = new THREE.Mesh(decayGeometry, this.#decayMaterial)
    decayMesh.renderOrder = 0
    this.#scene.add(decayMesh)

    // --- stamps: footprints (grow depth) + a static shoreline ring (grows wetness) ---
    this.#footprintMesh = buildStampMesh(MAX_FOOTPRINT_STAMPS)
    this.#shoreMesh = buildStampMesh(MAX_SHORE_STAMPS)
    this.#footprintMesh.renderOrder = 1
    this.#shoreMesh.renderOrder = 1
    this.#scene.add(this.#footprintMesh)
    this.#scene.add(this.#shoreMesh)

    this.#placeShoreline(spec)
  }

  /** Traced once — the shoreline is static geometry, so this never needs to re-run. */
  #placeShoreline(spec: CoastalTerrainSpec): void {
    const m = new THREE.Matrix4()
    const color = new THREE.Color()
    let count = 0

    for (let r = 0; r < SHORE_RAYS && count < MAX_SHORE_STAMPS; r++) {
      const angle = (r / SHORE_RAYS) * Math.PI * 2
      const dx = Math.cos(angle)
      const dz = Math.sin(angle)
      const maxR = spec.islandRadiusM + spec.islandFalloffM
      let previous = sampleHeight(spec, dx * maxR, dz * maxR)
      for (let d = maxR - 1; d > 20; d -= 1) {
        const h = sampleHeight(spec, dx * d, dz * d)
        if (previous < spec.seaLevelM && h >= spec.seaLevelM) {
          this.shorelinePoints.push({ x: dx * d, z: dz * d })
          const shoreDiameter = SHORE_STAMP_RADIUS * 2
          m.compose(
            new THREE.Vector3(dx * d, dz * d, 0),
            new THREE.Quaternion(),
            new THREE.Vector3(shoreDiameter, shoreDiameter, 1),
          )
          this.#shoreMesh.setMatrixAt(count, m)
          color.setRGB(0, SHORE_WETNESS_STRENGTH, 0)
          this.#shoreMesh.setColorAt(count, color)
          count++
          break
        }
        previous = h
      }
    }
    this.#shoreMesh.count = count
    this.#shoreMesh.instanceMatrix.needsUpdate = true
    if (this.#shoreMesh.instanceColor) this.#shoreMesh.instanceColor.needsUpdate = true
  }

  update(renderer: THREE.Renderer, dt: number, footprints: FootprintStamp[]): void {
    const writeIndex = 1 - this.#readIndex
    const writeTarget = this.#targets[writeIndex]!
    const readTarget = this.#targets[this.#readIndex]!
    this.#prevTextureNode.value = readTarget.texture

    this.#dtUniform.value = dt

    this.#writeFootprints(footprints)

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
      color.setRGB(f.pressure, f.pressure * FOOTPRINT_WETNESS_FRACTION, 0)
      this.#footprintMesh.setColorAt(i, color)
    }
    this.#footprintMesh.count = count
    this.#footprintMesh.instanceMatrix.needsUpdate = true
    if (this.#footprintMesh.instanceColor) this.#footprintMesh.instanceColor.needsUpdate = true
  }

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
    this.#shoreMesh.geometry.dispose()
    ;(this.#shoreMesh.material as THREE.Material).dispose()
  }
}

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

  material.colorNode = vec4(falloff.mul(MAX_DEPTH), falloff, 0, 1)

  const mesh = new THREE.InstancedMesh(geometry, material, maxCount)
  mesh.frustumCulled = false
  mesh.count = 0
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 3), 3)
  return mesh
}
