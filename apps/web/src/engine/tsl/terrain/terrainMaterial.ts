import * as THREE from 'three/webgpu'
import {
  cameraPosition,
  clamp,
  float,
  length,
  mix,
  mrt,
  output,
  positionWorld,
  pow,
  smoothstep,
  texture,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import type { Node } from 'three/webgpu'
import type { CoastalTerrainSpec } from '@/engine/terrain/HeightSpec'
import { buildHeightNode } from './heightNode'
import { buildPermutation } from '@/engine/terrain/noise'
import { createGradientNoise } from '@/engine/tsl/noise/gradientNoise'
import type { Sky } from '@/engine/tsl/sky/atmosphere'
import { worldToSandUV, SAND_RESOLUTION } from '@/engine/terrain/sandBox'

/**
 * Terrain material: S2-verified displacement, LOD morphing, and slope/height splatting.
 *
 * Displacement uses the same height node the CPU evaluator mirrors, so the surface you
 * walk on is the surface you see — that equivalence is the whole reason the collision
 * design avoids GPU readback.
 */

type F = Node<'float'>
type V3 = Node<'vec3'>

export type TerrainMaterialOptions = {
  /** Finest clipmap cell size, metres. Drives the LOD morph band. */
  baseCell: number
  /** Quads per side per clipmap level. */
  gridSide: number
}

export function createTerrainMaterial(
  spec: CoastalTerrainSpec,
  opts: TerrainMaterialOptions,
  sky?: Sky,
  sandTexture?: THREE.Texture,
) {
  const { height } = buildHeightNode(spec)
  // A second noise field, seeded differently, purely for surface detail. Reusing the
  // terrain seed would make ripples correlate with dunes, which reads as a repeating
  // pattern rather than as sand.
  const detail = createGradientNoise(buildPermutation(spec.seed ^ 0x9e3779b9))
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.94, metalness: 0 })

  const worldX = positionWorld.x as F
  const worldZ = positionWorld.z as F

  /**
   * **LOD morphing.** Without this, each ring's vertices snap to a coarser grid than
   * its neighbour and the seam visibly pops as the camera moves — the classic clipmap
   * artefact.
   *
   * The fix: near a ring's outer edge, blend the height toward what the *next coarser*
   * level would produce, so by the time a vertex is handed off the two levels already
   * agree. `morph` ramps over the outer 40% of the ring the camera is standing in,
   * derived from distance rather than from a per-vertex ring index (which an
   * InstancedMesh does not expose to the vertex stage without an extra attribute).
   */
  const distance = length(
    vec3(worldX, 0, worldZ).sub(vec3(cameraPosition.x, 0, cameraPosition.z)),
  ) as F
  const innerRadius = float(opts.baseCell * (opts.gridSide / 2))
  // Which ring level this fragment falls in, as a continuous value: log2(d / r0).
  const level = clamp(distance.div(innerRadius).max(1).log2(), 0, 8) as F
  const cellHere = innerRadius.mul(float(2).pow(level)).div(opts.gridSide / 2) as F
  const morph = smoothstep(0.6, 1.0, level.fract()) as F

  const fine = height(worldX, worldZ)
  // Sampling on the next-coarser lattice: quantise to 2x the local cell size.
  const q = cellHere.mul(2)
  const coarse = height(worldX.div(q).round().mul(q), worldZ.div(q).round().mul(q))
  let h = mix(fine, coarse, morph) as F

  /**
   * Footprints (§4). `sandTexture` ping-pongs (see `SandField`), so this material keeps
   * a live `texture()` node whose `.value` `setSandTexture` reassigns each frame — the
   * node itself is built once, only the texture it points at changes.
   *
   * Depression depth actually displaces the surface (a real dip reads far better than a
   * colour trick), and a 2-texel central difference on that same depth channel feeds the
   * normal — that gradient IS the rim: the plan's separate "raised rim" term is the
   * lighting response you get for free once the edge of a depression has a real normal,
   * not something that needs computing twice.
   */
  const sandUVNode = sandTexture ? worldToSandUV(worldX, worldZ) : null
  const sandTextureNode = sandTexture ? texture(sandTexture, sandUVNode!) : null
  const sandDepth = (sandTextureNode ? (sandTextureNode.r as F) : float(0)) as F
  const sandWetness = (sandTextureNode ? (sandTextureNode.g as F) : float(0)) as F
  if (sandTextureNode) h = h.sub(sandDepth.mul(0.6)) as F

  material.positionNode = vec3(worldX, h, worldZ)

  // Analytic normals from central differences at the local cell size — cheaper and far
  // more stable than screen-space derivatives on a displaced grid, and it scales with
  // LOD so distant terrain does not shimmer.
  const camDistance = length(
    vec3(worldX, 0, worldZ).sub(vec3(cameraPosition.x, 0, cameraPosition.z)),
  ) as F
  const eps = clamp(cellHere, 0.5, 24) as F
  const hL = height(worldX.sub(eps), worldZ)
  const hR = height(worldX.add(eps), worldZ)
  const hD = height(worldX, worldZ.sub(eps))
  const hU = height(worldX, worldZ.add(eps))
  let macroNormal = vec3(hL.sub(hR), eps.mul(2), hD.sub(hU)).normalize() as V3

  // Footprint rim, continued: a 2-texel central difference on the depth channel, folded
  // straight into the macro normal before any of the sand-detail shading below reads it.
  let dLTexNode: ReturnType<typeof texture> | null = null
  let dRTexNode: ReturnType<typeof texture> | null = null
  let dDTexNode: ReturnType<typeof texture> | null = null
  let dUTexNode: ReturnType<typeof texture> | null = null

  if (sandTextureNode && sandUVNode) {
    const dUV = 2.0 / SAND_RESOLUTION
    dLTexNode = texture(sandTexture!, sandUVNode.add(vec2(-dUV, 0)))
    dRTexNode = texture(sandTexture!, sandUVNode.add(vec2(dUV, 0)))
    dDTexNode = texture(sandTexture!, sandUVNode.add(vec2(0, -dUV)))
    dUTexNode = texture(sandTexture!, sandUVNode.add(vec2(0, dUV)))

    const dL = dLTexNode.r as F
    const dR = dRTexNode.r as F
    const dD = dDTexNode.r as F
    const dU = dUTexNode.r as F

    const gradX = clamp(dR.sub(dL), -0.15, 0.15) as F
    const gradZ = clamp(dU.sub(dD), -0.15, 0.15) as F
    const rimNormal = vec3(gradX.mul(2.5), 1, gradZ.mul(2.5)).normalize() as V3

    const rimMask = smoothstep(0.01, 0.06, sandDepth) as F
    macroNormal = mix(macroNormal, rimNormal, rimMask.mul(0.5)).normalize() as V3
  }

  /**
   * Surface detail. Geometry alone gives a perfectly smooth plane, which is why the
   * beach read as untextured no matter how the colour was tuned — sand is *micro*
   * relief, not macro shape, and at 1.7m eye height that is all you actually see.
   *
   * Two scales:
   *  - **Ripples**: strongly anisotropic, aligned across the prevailing wind, ~0.35m
   *    apart. Wind-blown sand always organises into these, and their directionality is
   *    most of what identifies the material.
   *  - **Grain**: fine isotropic noise that breaks up the ripples so they do not read
   *    as corrugated iron.
   *
   * Both fade out with distance — beyond a few tens of metres they are sub-pixel and
   * would alias into shimmer.
   */
  const detailFade = clamp(float(1).sub(camDistance.div(70)), 0, 1) as F

  const rippleDir = vec2(0.94, 0.34) // across the wind
  const rippleCoord = worldX.mul(rippleDir.x).add(worldZ.mul(rippleDir.y))
  const ripple = detail
    .noise2D(rippleCoord.mul(2.9), worldZ.mul(rippleDir.x).sub(worldX.mul(rippleDir.y)).mul(0.35))
    .mul(0.5)
    .add(detail.noise2D(worldX.mul(0.9), worldZ.mul(0.9)).mul(0.35)) as F

  const grain = detail.noise2D(worldX.mul(11), worldZ.mul(11)) as F

  // Patchiness. Uniform ripples everywhere read as corduroy, not sand — wind organises
  // sand into *fields* of ripples separated by smooth swept areas, and that irregularity
  // is what stops the eye seeing a repeating texture.
  const patch = clamp(
    detail.noise2D(worldX.mul(0.055), worldZ.mul(0.055)).mul(1.7).add(0.55),
    0,
    1,
  ) as F
  const rippleStrength = ripple.mul(patch) as F

  // Perturb the macro normal rather than replacing it, so lighting still follows the
  // dunes while the surface gains texture.
  const bump = rippleStrength.mul(0.12).add(grain.mul(0.04)).mul(detailFade) as F
  const bumpDx = detail
    .noise2D(rippleCoord.mul(2.9).add(0.35), worldZ.mul(0.35))
    .mul(0.12)
    .mul(patch) as F
  const detailNormal = vec3(bump.sub(bumpDx).mul(2.2), 1, bump.mul(0.9)).normalize() as V3
  const normal = macroNormal.add(detailNormal.mul(detailFade.mul(0.3))).normalize() as V3
  material.normalNode = normal

  // --- splat by height above sea level and slope --------------------------------
  const aboveSea = h.sub(spec.seaLevelM) as F
  const slope = normal.y as F

  // Warm and clearly non-blue, so sand reads as sand against turquoise water. The
  // previous palette sat at the same hue-neutral value as the sea and the waterline
  // disappeared.
  const wetSand = vec3(0.42, 0.35, 0.27)
  const drySand = vec3(0.74, 0.67, 0.52)
  const duneGrass = vec3(0.46, 0.52, 0.29)
  const scrub = vec3(0.26, 0.35, 0.2)
  const rock = vec3(0.44, 0.42, 0.39)

  // Wet sand only right at the waterline; the band is narrow or the beach looks muddy.
  // Narrow wet band right at the waterline — a wide one turns the whole beach muddy.
  let albedo: V3 = mix(wetSand, drySand, smoothstep(-0.05, 0.9, aboveSea)) as V3
  albedo = mix(albedo, duneGrass, smoothstep(2.2, 6.5, aboveSea)) as V3
  albedo = mix(albedo, scrub, smoothstep(7, 15, aboveSea)) as V3
  // Steep faces are always rock, whatever the altitude — this is what stops the island
  // reading as a smooth blob.
  albedo = mix(albedo, rock, smoothstep(0.88, 0.66, slope)) as V3

  // Break up flat albedo with the same detail field — real sand is never one colour,
  // and a little variance does more for realism than any amount of palette tuning.
  const isSand = smoothstep(3.2, 1.2, aboveSea) as F
  albedo = albedo.mul(
    float(1).add(grain.mul(0.05).add(rippleStrength.mul(0.04)).mul(detailFade)),
  ) as V3

  // Footprints and the shoreline wet band darken toward the same `wetSand` the waterline
  // itself blends to — one wet color for the whole beach, however the water got there.
  const wetnessMask = clamp(sandWetness, 0, 1) as F
  albedo = mix(albedo, wetSand, wetnessMask) as V3

  // Deep footprint ambient occlusion shadow shading for crisp high-contrast definition
  const footprintShadow = clamp(float(1.0).sub(sandDepth.mul(1.2)), 0.55, 1.0) as F
  albedo = albedo.mul(footprintShadow) as V3

  // --- Underwater Sun Caustics ----------------------------------------------------
  // Sunlight focusing through animated wavy water onto the sand bed in shallow ocean
  const underwaterMask = smoothstep(0.4, -2.5, aboveSea) as F
  const causticDistort = detail.noise2D(worldX.mul(1.8), worldZ.mul(1.8)) as F
  const causticA = detail.noise2D(worldX.mul(4.2).add(causticDistort), worldZ.mul(4.2)) as F
  const causticB = detail.noise2D(worldX.mul(8.5), worldZ.mul(8.5).sub(causticDistort)) as F
  const caustic = pow(clamp(causticA.add(causticB).mul(0.5).add(0.45), 0, 1) as F, 4.0) as F
  const causticColor = vec3(0.4, 0.55, 0.5)
  albedo = albedo.add(causticColor.mul(caustic.mul(underwaterMask).mul(0.7))) as V3

  // --- Snowflow-style Micro-Facet Quartz Sparkles & Glints -----------------------
  // View-dependent micro-crystal sparkles that catch sunlight as the camera moves,
  // matching snowflow_demo's dynamic glint quality.
  const viewDir = positionWorld.sub(cameraPosition).normalize() as V3
  const sparkleViewShiftX = viewDir.x.mul(18.0) as F
  const sparkleViewShiftZ = viewDir.z.mul(18.0) as F
  const sparkleA = detail.noise2D(
    worldX.mul(58.0).add(sparkleViewShiftX),
    worldZ.mul(58.0).add(sparkleViewShiftZ),
  ) as F
  const sparkleB = detail.noise2D(worldX.mul(120.0), worldZ.mul(120.0)) as F
  const microSparkle = pow(clamp(sparkleA.mul(sparkleB).add(0.45), 0, 1) as F, 11.0)
    .mul(isSand)
    .mul(detailFade)
    .mul(float(1).sub(wetnessMask.mul(0.7))) as F // dry sand sparkles more than wet sand

  const sparkleColor = vec3(0.85, 0.82, 0.75)
  albedo = albedo.add(sparkleColor.mul(microSparkle.mul(1.4))) as V3

  const dryRoughness = mix(float(0.97), float(0.84), isSand.mul(detailFade)) as F
  material.roughnessNode = mix(dryRoughness, float(0.28), wetnessMask) as F

  // Aerial perspective last — everything before it is surface, this is the air in front.
  if (sky) {
    const dist = length(positionWorld.sub(cameraPosition)) as F
    albedo = sky.aerialPerspective(albedo, viewDir, dist, positionWorld.y as F)
  }

  material.colorNode = vec4(albedo, 1)
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })

  return {
    material,
    height,
    /** Point this material's sand-texture node at the freshly-written ping-pong target —
     * call once per frame, after `SandField.update()`. A no-op if this material was built
     * without a sand texture in the first place. */
    setSandTexture: (tex: THREE.Texture) => {
      if (sandTextureNode) sandTextureNode.value = tex
      if (dLTexNode) dLTexNode.value = tex
      if (dRTexNode) dRTexNode.value = tex
      if (dDTexNode) dDTexNode.value = tex
      if (dUTexNode) dUTexNode.value = tex
    },
  }
}
