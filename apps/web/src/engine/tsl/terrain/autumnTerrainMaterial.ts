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

/**
 * Autumn Highlands Terrain Material: Rich loam earth, warm terracotta soil,
 * golden steppe grass patches, and weathered rock strata for Aki Highlands.
 */
export function createAutumnTerrainMaterial(
  spec: RidgeTerrainSpec,
  opts: TerrainMaterialOptions,
  sky?: Sky,
  footprintTexture?: THREE.Texture,
) {
  const { height } = buildHeightNode(spec)
  const detail = createGradientNoise(buildPermutation(spec.seed ^ 0x9e3779b9))
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0.02 })

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

  // Footprints on soft loam earth
  const earthUVNode = footprintTexture ? worldToSandUV(worldX, worldZ) : null
  const footprintTexNode = footprintTexture ? texture(footprintTexture, earthUVNode!) : null
  const footprintDepth = (footprintTexNode ? (footprintTexNode.r as F) : float(0)) as F
  if (footprintTexNode) h = h.sub(footprintDepth.mul(0.6)) as F

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

  // Footprint rim
  let dLTexNode: ReturnType<typeof texture> | null = null
  let dRTexNode: ReturnType<typeof texture> | null = null
  let dDTexNode: ReturnType<typeof texture> | null = null
  let dUTexNode: ReturnType<typeof texture> | null = null

  if (footprintTexNode && earthUVNode) {
    const dUV = 2.0 / SAND_RESOLUTION
    dLTexNode = texture(footprintTexture!, earthUVNode.add(vec2(-dUV, 0)))
    dRTexNode = texture(footprintTexture!, earthUVNode.add(vec2(dUV, 0)))
    dDTexNode = texture(footprintTexture!, earthUVNode.add(vec2(0, -dUV)))
    dUTexNode = texture(footprintTexture!, earthUVNode.add(vec2(0, dUV)))

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

  // --- Multi-scale earth & terrain surface detail ---
  const detailFade = clamp(float(1).sub(camDistance.div(85)), 0, 1) as F
  const soilNoise = detail.noise2D(worldX.mul(0.8), worldZ.mul(0.8)) as F
  const pebbleNoise = detail.noise2D(worldX.mul(8.0), worldZ.mul(8.0)) as F
  const microGrain = detail.noise2D(worldX.mul(24.0), worldZ.mul(24.0)) as F

  const bump = soilNoise.mul(0.06).add(pebbleNoise.mul(0.03)).add(microGrain.mul(0.015)).mul(detailFade) as F
  const detailNormal = vec3(bump.mul(1.8), 1, bump.mul(1.8)).normalize() as V3
  const normal = macroNormal.add(detailNormal.mul(detailFade.mul(0.32))).normalize() as V3
  material.normalNode = normal

  const slope = normal.y as F

  // 1. Rich dark loam soil
  const darkSoil = vec3(0.28, 0.18, 0.11)
  const warmSoil = vec3(0.42, 0.28, 0.17)
  const soilAlbedo = mix(darkSoil, warmSoil, pebbleNoise.mul(0.5).add(0.5)) as V3

  // 2. Golden Autumn Grass / Moss patches
  const goldenGrassA = vec3(0.68, 0.48, 0.18)
  const goldenGrassB = vec3(0.78, 0.58, 0.24)
  const grassAlbedo = mix(goldenGrassA, goldenGrassB, microGrain.mul(0.4).add(0.6)) as V3

  // 3. Cliff Rock Strata
  const rockDark = vec3(0.22, 0.20, 0.18)
  const rockLit = vec3(0.38, 0.34, 0.30)
  const rockAlbedo = mix(rockDark, rockLit, soilNoise.mul(0.5).add(0.5)) as V3

  // Blend soil vs grass based on noise patches
  const grassMask = smoothstep(0.1, 0.6, soilNoise.mul(0.6).add(microGrain.mul(0.4)).add(0.2)) as F
  const groundAlbedo = mix(soilAlbedo, grassAlbedo, grassMask.mul(0.65)) as V3

  // Blend ground vs steep cliff rocks
  const slopeCoverage = smoothstep(0.55, 0.85, slope) as F
  let albedo: V3 = mix(rockAlbedo, groundAlbedo, slopeCoverage) as V3

  // Footprints on earth: compressed darker loam
  const compaction = clamp(footprintDepth.mul(6), 0, 1) as F
  const compressedEarth = vec3(0.18, 0.11, 0.07)
  albedo = mix(albedo, compressedEarth, compaction) as V3

  // Ambient occlusion in footprint depressions
  const footprintShadow = clamp(float(1.0).sub(footprintDepth.mul(1.2)), 0.55, 1.0) as F
  albedo = albedo.mul(footprintShadow) as V3

  material.roughnessNode = mix(float(0.92), float(0.78), compaction) as F

  if (sky) {
    const viewDir = positionWorld.sub(cameraPosition).normalize() as V3
    const dist = length(positionWorld.sub(cameraPosition)) as F
    albedo = sky.aerialPerspective(albedo, viewDir, dist, positionWorld.y as F)
  }

  material.colorNode = vec4(albedo, 1)
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })

  return {
    material,
    height,
    setSnowTexture: (tex: THREE.Texture) => {
      if (footprintTexNode) footprintTexNode.value = tex
      if (dLTexNode) dLTexNode.value = tex
      if (dRTexNode) dRTexNode.value = tex
      if (dDTexNode) dDTexNode.value = tex
      if (dUTexNode) dUTexNode.value = tex
    },
  }
}
