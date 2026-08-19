import * as THREE from 'three/webgpu'
import {
  cameraPosition,
  clamp,
  cos,
  float,
  mix,
  mrt,
  output,
  length,
  positionWorld,
  pow,
  sin,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import type { Node } from 'three/webgpu'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'
import { buildHeightNode } from '@/engine/tsl/terrain/heightNode'
import type { Sky } from '@/engine/tsl/sky/atmosphere'
import { KAMAKURA_WAVES, type WaveSpec } from '@/engine/water/waves'
import { buildPermutation } from '@/engine/terrain/noise'
import { createGradientNoise } from '@/engine/tsl/noise/gradientNoise'

/**
 * Water surface: Gerstner displacement, analytic sky reflection, depth-based colour,
 * and shore foam.
 *
 * **Depth comes from the terrain height node, not from a depth texture.** Because the
 * heightfield is a pure function we can evaluate `seaLevel - terrainHeight(x, z)`
 * directly in the shader. That is exact, costs no extra pass, and sidesteps the entire
 * transparent-depth-sampling and render-order problem — which is normally the fiddliest
 * part of rendering water. It also gives a free, perfectly stable shoreline for foam.
 *
 * **Reflection re-evaluates the sky function along the reflected ray.** No cubemap, no
 * PMREM, no SSR: temporally perfectly stable, and it costs a handful of ALU.
 */

type F = Node<'float'>
type V3 = Node<'vec3'>

const TAU = Math.PI * 2

export function createWaterMaterial(
  terrainSpec: HeightSpec,
  sky: Sky,
  waveSpec: WaveSpec = KAMAKURA_WAVES,
) {
  const { height } = buildHeightNode(terrainSpec)
  const time = uniform(0)
  // Reduced-motion halves this (never to zero — a frozen ocean reads as a crash, not as
  // calm, per the plan's own accessibility note). Scales `c`/`s` directly rather than
  // `w.amplitude` itself: every position/normal term below is linear in `c`/`s`, so one
  // multiply there scales displacement and slope together, proportionally.
  const amplitudeScale = uniform(1)
  // Detail field for micro-chop. Gerstner alone gives a glassy surface: real water has
  // capillary ripples an order of magnitude smaller than the swell, and those are what
  // scatter the sun into glitter rather than one mirror highlight.
  const detail = createGradientNoise(buildPermutation(terrainSpec.seed ^ 0x5bf03635))

  const material = new THREE.MeshStandardNodeMaterial({
    transparent: true,
    roughness: 0.06,
    metalness: 0.0,
  })

  /**
   * Gerstner displacement + analytic normal. Mirrors `surfaceAt` in `water/waves.ts`;
   * they must agree or the surfboard in §4 will float above the visible surface.
   */
  /**
   * Short waves must fade with distance or they alias badly: a 4 m wave sampled on the
   * outer clipmap rings (cells tens of metres wide) produces a moiré diamond lattice
   * across the whole bay. Attenuating by wavelength/distance is also physically
   * reasonable — that detail is sub-pixel out there anyway.
   */
  const waveFade = (wavelength: number, dist: F): F =>
    clamp(float(1).sub(dist.div(wavelength * 26)), 0, 1) as F

  const gerstner = (x: F, z: F, dist: F) => {
    let px: F = float(0)
    let py: F = float(0)
    let pz: F = float(0)
    let dydx: F = float(0)
    let dydz: F = float(0)

    for (const w of waveSpec.waves) {
      const k = TAU / w.wavelength
      const len = Math.hypot(w.dirX, w.dirZ) || 1
      const dx = w.dirX / len
      const dz = w.dirZ / len
      const q = w.steepness / (k * w.amplitude * waveSpec.waves.length || 1)

      const phase = x
        .mul(dx * k)
        .add(z.mul(dz * k))
        .sub(time.mul(w.speed * k))
      const fade = waveFade(w.wavelength, dist)
      const c = cos(phase).mul(fade).mul(amplitudeScale) as F
      const s = sin(phase).mul(fade).mul(amplitudeScale) as F

      px = px.add(c.mul(q * w.amplitude * dx)) as F
      pz = pz.add(c.mul(q * w.amplitude * dz)) as F
      py = py.add(s.mul(w.amplitude)) as F
      dydx = dydx.add(c.mul(k * w.amplitude * dx)) as F
      dydz = dydz.add(c.mul(k * w.amplitude * dz)) as F
    }

    const normal = vec3(dydx.negate(), 1, dydz.negate()).normalize() as V3
    return { px, py, pz, normal }
  }

  const restX = positionWorld.x as F
  const restZ = positionWorld.z as F
  const camDist = length(
    vec3(restX, 0, restZ).sub(vec3(cameraPosition.x, 0, cameraPosition.z)),
  ) as F
  const wave = gerstner(restX, restZ, camDist)

  // Keep the surface flat at wave height everywhere. An earlier version sank vertices
  // below the bed over land to force occlusion — that was wrong: clipmap cells are tens
  // of metres wide in the outer rings, so one corner of a quad dropped 50m while its
  // neighbour stayed at 0, producing enormous slanted polygons slicing through the
  // scene. Opaque terrain is drawn first and occludes the water via the depth test;
  // no geometric trickery is needed or wanted.
  const waveY = float(waveSpec.seaLevelM).add(wave.py) as F
  material.positionNode = vec3(restX.add(wave.px), waveY, restZ.add(wave.pz))
  // normalNode is assigned after the chop is built, further down.

  // --- depth & physical Beer–Lambert extinction (wavelength-dependent) -----------
  const bed = height(restX, restZ)
  const depth = clamp(float(waveSpec.seaLevelM).sub(bed), 0, 40) as F

  // Shallow tropical teal vs Deep oceanic navy base colors
  const shallow = vec3(0.18, 0.78, 0.72)
  const deep = vec3(0.005, 0.07, 0.22)

  // Physical Beer-Lambert extinction per channel: Red is absorbed quickly in shallow water,
  // Green is absorbed moderately, Blue penetrates deepest.
  const absorb = float(1).sub(pow(float(0.88), depth)) as F
  const extR = float(1).sub(pow(float(0.72), depth)) as F
  const extG = float(1).sub(pow(float(0.88), depth)) as F
  const extB = float(1).sub(pow(float(0.96), depth)) as F
  const absorbRGB = vec3(extR, extG, extB) as V3
  const bodyColor = shallow.add(deep.sub(shallow).mul(absorbRGB)) as V3

  // --- micro-chop: perturb the normal at capillary scale ------------------------
  const chopFade = clamp(float(1).sub(camDist.div(220)), 0, 1) as F
  const chopA = detail.noise2D(restX.mul(3.1).add(time.mul(0.6)), restZ.mul(3.1)) as F
  const chopB = detail.noise2D(restX.mul(7.7), restZ.mul(7.7).sub(time.mul(0.9))) as F
  const chopNormal = vec3(chopA.mul(0.5), 1, chopB.mul(0.5)).normalize() as V3
  const surfaceNormal = wave.normal.add(chopNormal.mul(chopFade.mul(0.35))).normalize() as V3

  // --- reflection: analytic sky along reflected ray -----------------------------
  const viewDir = positionWorld.sub(cameraPosition).normalize() as V3
  const reflectDir = viewDir.sub(surfaceNormal.mul(viewDir.dot(surfaceNormal).mul(2))) as V3
  const reflected = clamp(sky.skyRadiance(reflectDir), 0, 0.55).mul(vec3(0.9, 0.94, 1.0)) as V3

  const cosTheta = clamp(viewDir.negate().dot(surfaceNormal) as F, 0, 1) as F
  const fresnel = float(0.02).add(float(0.25).mul(pow(float(1).sub(cosTheta), 5))) as F

  let color: V3 = mix(bodyColor, reflected, fresnel) as V3

  // --- sun glitter / specular highlight ------------------------------------------
  const halfway = sky.uniforms.sunDirection.sub(viewDir).normalize() as V3
  const spec = pow(clamp(surfaceNormal.dot(halfway) as F, 0, 1) as F, 340) as F
  const glitterMask = pow(clamp(chopA.mul(chopB).add(0.5), 0, 1) as F, 2) as F
  color = color.add(sky.uniforms.sunColor.mul(spec.mul(glitterMask).mul(7).mul(chopFade))) as V3

  // --- subsurface scattering through wave crests --------------------------------
  const backlight = clamp(viewDir.dot(sky.uniforms.sunDirection) as F, 0, 1) as F
  const crest = clamp(wave.py.mul(1.6).add(0.35), 0, 1) as F
  const sssColor = vec3(0.08, 0.52, 0.42) // luminous emerald scatter
  color = color.add(sssColor.mul(pow(backlight, 2.5).mul(crest).mul(0.65))) as V3

  // --- dynamic turbulent shore foam & swash (multi-layer) -------------------------
  // 1. Shore band: shallow region where waves break
  const shoreBand = smoothstep(0.01, 0.25, depth).mul(float(1).sub(smoothstep(0.25, 1.8, depth))) as F
  
  // 2. Lacy procedural noise break-up for realistic foam edges instead of smooth lines
  const foamNoise1 = detail.noise2D(restX.mul(2.2).add(time.mul(0.8)), restZ.mul(2.2).sub(time.mul(0.4))) as F
  const foamNoise2 = detail.noise2D(restX.mul(6.5).sub(time.mul(1.2)), restZ.mul(6.5).add(time.mul(0.9))) as F
  const lacyFoam = clamp(foamNoise1.add(foamNoise2.mul(0.5)).add(0.4), 0, 1) as F

  // 3. Dynamic swash wave pulse moving up and down the shore
  const swashPulse = sin(restX.mul(0.4).add(restZ.mul(0.3)).add(time.mul(1.4)))
    .mul(0.5)
    .add(0.5) as F
  
  const shoreFoam = clamp(shoreBand.mul(swashPulse.mul(0.6).add(0.4)).mul(lacyFoam.mul(0.7).add(0.4)), 0, 1) as F

  // 4. Crest whitecaps where wave peaks steepen
  const crestFoam = smoothstep(0.58, 0.92, crest).mul(chopFade).mul(lacyFoam) as F
  const totalFoam = clamp(shoreFoam.add(crestFoam.mul(0.6)), 0, 1) as F
  
  const foamColor = vec3(0.95, 0.97, 0.98)
  color = mix(color, foamColor, totalFoam) as V3

  material.normalNode = surfaceNormal

  // Aerial perspective, same as the terrain — without it the sea meets the sky at a
  // hard line and the horizon looks like a cut-out.
  if (sky.aerialPerspective) {
    const dist = length(positionWorld.sub(cameraPosition)) as F
    color = sky.aerialPerspective(color, viewDir, dist, float(0))
  }

  material.colorNode = vec4(color, 1)

  // Fade out entirely over dry land so the plane does not sit visibly on top of the
  // beach, and go fully opaque once it is deep enough to hide the bed.
  // Zero on dry land, then rise FAST. The old ramp left shallow water almost invisible,
  // which is precisely where the waterline needs to be legible. Any real depth now reads
  // unmistakably as water.
  const alpha = clamp(smoothstep(0.0, 0.12, depth).mul(0.82).add(absorb.mul(0.18)), 0, 1) as F
  material.opacityNode = alpha

  // Every material in an MRT pass must write every declared target (§1). Water is not
  // emissive, so its emissive target is black rather than absent.
  material.mrtNode = mrt({ output, emissive: vec4(0, 0, 0, 1) })

  return {
    material,
    setTime: (seconds: number) => {
      time.value = seconds
    },
    setAmplitudeScale: (scale: number) => {
      amplitudeScale.value = scale
    },
  }
}
