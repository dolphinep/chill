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
import type { RidgeTerrainSpec } from '@/engine/terrain/HeightSpec'
import { buildHeightNode } from './heightNode'
import { buildPermutation } from '@/engine/terrain/noise'
import { createGradientNoise } from '@/engine/tsl/noise/gradientNoise'
import type { Sky } from '@/engine/tsl/sky/atmosphere'
import { worldToSandUV, SAND_RESOLUTION } from '@/engine/terrain/sandBox'

type F = Node<'float'>
type V3 = Node<'vec3'>

export type TerrainMaterialOptions = {
  baseCell: number
  gridSide: number
}

export function createSnowTerrainMaterial(
  spec: RidgeTerrainSpec,
  opts: TerrainMaterialOptions,
  sky?: Sky,
  snowTexture?: THREE.Texture,
) {
  const { height } = buildHeightNode(spec)
  const detail = createGradientNoise(buildPermutation(spec.seed ^ 0x9e3779b9))
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0.05 })

  const worldX = positionWorld.x as F
  const worldZ = positionWorld.z as F

  // --- LOD morphing ---
  const distance = length(
    vec3(worldX, 0, worldZ).sub(vec3(cameraPosition.x, 0, cameraPosition.z)),
  ) as F
  const innerRadius = float(opts.baseCell * (opts.gridSide / 2))
  const level = clamp(distance.div(innerRadius).max(1).log2(), 0, 8) as F
  const cellHere = innerRadius.mul(float(2).pow(level)).div(opts.gridSide / 2) as F
  const morph = smoothstep(0.6, 1.0, level.fract()) as F

  const fine = height(worldX, worldZ)
  const q = cellHere.mul(2)
  const coarse = height(worldX.div(q).round().mul(q), worldZ.div(q).round().mul(q))
  let h = mix(fine, coarse, morph) as F

  // Footprints (depth displacement)
  const snowUVNode = snowTexture ? worldToSandUV(worldX, worldZ) : null
  const snowTextureNode = snowTexture ? texture(snowTexture, snowUVNode!) : null
  const footprintDepth = (snowTextureNode ? (snowTextureNode.r as F) : float(0)) as F
  if (snowTextureNode) h = h.sub(footprintDepth.mul(0.6)) as F

  material.positionNode = vec3(worldX, h, worldZ)

  // --- Analytic normal ---
  const camDistance = length(
    vec3(worldX, 0, worldZ).sub(vec3(cameraPosition.x, 0, cameraPosition.z)),
  ) as F
  const eps = clamp(cellHere, 0.5, 24) as F
  const hL = height(worldX.sub(eps), worldZ)
  const hR = height(worldX.add(eps), worldZ)
  const hD = height(worldX, worldZ.sub(eps))
  const hU = height(worldX, worldZ.add(eps))
  let macroNormal = vec3(hL.sub(hR), eps.mul(2), hD.sub(hU)).normalize() as V3

  // Footprint rim central-difference gradient
  let dLTexNode: ReturnType<typeof texture> | null = null
  let dRTexNode: ReturnType<typeof texture> | null = null
  let dDTexNode: ReturnType<typeof texture> | null = null
  let dUTexNode: ReturnType<typeof texture> | null = null

  if (snowTextureNode && snowUVNode) {
    const dUV = 2.0 / SAND_RESOLUTION
    dLTexNode = texture(snowTexture!, snowUVNode.add(vec2(-dUV, 0)))
    dRTexNode = texture(snowTexture!, snowUVNode.add(vec2(dUV, 0)))
    dDTexNode = texture(snowTexture!, snowUVNode.add(vec2(0, -dUV)))
    dUTexNode = texture(snowTexture!, snowUVNode.add(vec2(0, dUV)))

    const dL = dLTexNode.r as F
    const dR = dRTexNode.r as F
    const dD = dDTexNode.r as F
    const dU = dUTexNode.r as F

    const gradX = clamp(dR.sub(dL), -0.15, 0.15) as F
    const gradZ = clamp(dU.sub(dD), -0.15, 0.15) as F
    const rimNormal = vec3(gradX.mul(2.5), 1, gradZ.mul(2.5)).normalize() as V3

    const rimMask = smoothstep(0.01, 0.06, footprintDepth) as F
    macroNormal = mix(macroNormal, rimNormal, rimMask.mul(0.5)).normalize() as V3
  }

  // --- Multi-scale snow surface detail ---
  const detailFade = clamp(float(1).sub(camDistance.div(85)), 0, 1) as F
  const windDir = { x: 0.7, z: 0.55 }
  const ridgeCoord = worldX.mul(windDir.x).add(worldZ.mul(windDir.z))
  const sastrugi = detail
    .noise2D(ridgeCoord.mul(1.6), worldZ.mul(windDir.x).sub(worldX.mul(windDir.z)).mul(0.22))
    .mul(0.6)
    .add(detail.noise2D(worldX.mul(0.7), worldZ.mul(0.7)).mul(0.4)) as F
  const grain = detail.noise2D(worldX.mul(12), worldZ.mul(12)) as F

  const bump = sastrugi.mul(0.08).add(grain.mul(0.04)).mul(detailFade) as F
  const bumpDx = detail.noise2D(ridgeCoord.mul(1.6).add(0.3), worldZ.mul(0.3)).mul(0.08) as F
  const detailNormal = vec3(bump.sub(bumpDx).mul(2.2), 1, bump.mul(0.8)).normalize() as V3
  const normal = macroNormal.add(detailNormal.mul(detailFade.mul(0.28))).normalize() as V3
  material.normalNode = normal

  // --- Splat by elevation, slope and glacial ice banding ---
  const aboveValley = h.sub(spec.valleyFloorM) as F
  const slope = normal.y as F

  // Exposed ground below the snow line is glacial ice, not bare rock — this is a
  // snow-bound alpine valley (see `HeightSpec.ts`'s doc comment on `FROSTHOLM_RIDGE`),
  // so cliff faces read as ice fracturing under its own weight, not stone strata. Same
  // noise-driven banding as before (it already looked right), just re-themed: a deep
  // glacial teal-blue in the cracks/shadow, pale icy cyan-white on the lit facets.
  const iceBanding = detail.noise2D(worldX.mul(0.25), h.mul(0.8)).mul(0.15) as F
  const iceDark = vec3(0.16, 0.36, 0.46)
  const iceLit = vec3(0.72, 0.88, 0.94)
  const iceAlbedo = mix(iceDark, iceLit, grain.mul(0.4).add(0.5).add(iceBanding)) as V3

  // Pristine Alpine Snow & Glacial SSS Blue
  const snowShadow = vec3(0.64, 0.72, 0.84) // Glacial cool ambient
  const snowLit = vec3(0.96, 0.98, 1.0) // Bright alpine sunlit white
  const snowAlbedo = mix(snowShadow, snowLit, grain.mul(0.25).add(0.75)) as V3

  // Snow coverage based on slope & elevation — thresholds pushed up from the original
  // (0.52-0.88 slope, full elevation weight) so more of the valley shows its ice base
  // instead of an unbroken snow blanket: ground now needs to be noticeably flatter
  // before it reads as fully snow-covered, and being above the snowline alone no
  // longer guarantees full coverage the way `.mul(0.75)` used to get most of the way
  // there on its own.
  const slopeCoverage = smoothstep(0.72, 0.95, slope) as F
  const elevationBoost = smoothstep(spec.snowLineM - 6, spec.snowLineM + 10, aboveValley) as F
  const snowCoverage = clamp(slopeCoverage.add(elevationBoost.mul(0.5)), 0, 1) as F

  let albedo: V3 = mix(iceAlbedo, snowAlbedo, snowCoverage) as V3

  // Compacted Snow in footprints
  const compaction = clamp(footprintDepth.mul(6), 0, 1) as F
  const packedSnow = vec3(0.7, 0.78, 0.88)
  albedo = mix(albedo, packedSnow, compaction.mul(snowCoverage)) as V3

  // Footprint ambient occlusion shadow shading
  const footprintShadow = clamp(float(1.0).sub(footprintDepth.mul(1.2)), 0.55, 1.0) as F
  albedo = albedo.mul(footprintShadow) as V3

  // --- Prismatic Snow Crystal Sparkle ---
  const viewDir = positionWorld.sub(cameraPosition).normalize() as V3
  const sparkleShiftX = viewDir.x.mul(18) as F
  const sparkleShiftZ = viewDir.z.mul(18) as F
  const sparkleA = detail.noise2D(
    worldX.mul(68).add(sparkleShiftX),
    worldZ.mul(68).add(sparkleShiftZ),
  ) as F
  const sparkleB = detail.noise2D(worldX.mul(142), worldZ.mul(142)) as F
  const sparkle = pow(clamp(sparkleA.mul(sparkleB).add(0.46), 0, 1) as F, 14)
    .mul(snowCoverage)
    .mul(detailFade)
    .mul(compaction.oneMinus()) as F
  albedo = albedo.add(vec3(0.92, 0.96, 1.0).mul(sparkle.mul(1.8))) as V3

  // Roughness: exposed ice is glassy (0.3) — noticeably glossier than snow (0.75) — and
  // a compacted footprint is icier still (0.48), between the two.
  const baseRoughness = mix(float(0.3), float(0.75), snowCoverage) as F
  material.roughnessNode = mix(baseRoughness, float(0.48), compaction) as F

  if (sky) {
    const dist = length(positionWorld.sub(cameraPosition)) as F
    albedo = sky.aerialPerspective(albedo, viewDir, dist, positionWorld.y as F)
  }

  material.colorNode = vec4(albedo, 1)
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })

  return {
    material,
    height,
    setSnowTexture: (tex: THREE.Texture) => {
      if (snowTextureNode) snowTextureNode.value = tex
      if (dLTexNode) dLTexNode.value = tex
      if (dRTexNode) dRTexNode.value = tex
      if (dDTexNode) dDTexNode.value = tex
      if (dUTexNode) dUTexNode.value = tex
    },
  }
}
