import { Color, Vector3 } from 'three'
import {
  clamp,
  exp,
  float,
  floor,
  fract,
  mix,
  mrt,
  output,
  pow,
  sin,
  smoothstep,
  time,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import type * as WebGPU from 'three/webgpu'
import type { Node } from 'three/webgpu'

type F = Node<'float'>
type V3 = Node<'vec3'>

export type SkyOptions = {
  sunDirection?: [number, number, number]
  zenith?: number
  horizon?: number
  ground?: number
  sunColor?: number
  sunIntensity?: number
  /** Sky-dome mesh radius, in metres — a pure `Engine.ts` mesh-construction concern
   * (defaults to 4000 there), not a shader uniform `createSky()` itself reads. Lives
   * here anyway so `Scenery.sky` stays the one place a scenery describes "everything
   * about its sky," rather than splitting dome geometry into a separate field. */
  domeRadius?: number
}

export function createSky(opts: SkyOptions = {}) {
  const sunDirection = uniform(
    new Vector3(...(opts.sunDirection ?? [0.45, 0.22, -0.86])).normalize(),
  )
  const zenith = uniform(new Color(opts.zenith ?? 0x2a4f9e))
  const horizon = uniform(new Color(opts.horizon ?? 0xb8c7dc))
  const ground = uniform(new Color(opts.ground ?? 0x101418))
  const sunColor = uniform(new Color(opts.sunColor ?? 0xffd39e))
  const sunIntensity = uniform(opts.sunIntensity ?? 12)

  const sunRadiance = (dir: V3): V3 => {
    const d = dir.normalize() as V3
    const cosSun = clamp(d.dot(sunDirection) as F, 0, 1) as F

    const core = pow(cosSun, 4500) as F
    const aureole = pow(cosSun, 250).mul(0.5) as F
    const mie = pow(cosSun, 6).mul(0.16) as F

    const above = smoothstep(-0.08, 0.06, d.y as F) as F
    return sunColor.mul(core.add(aureole).add(mie.mul(above)).mul(sunIntensity)) as V3
  }

  /**
   * Dual-layer procedural twinkling starlight in sky shader.
   * Fills the entire 360° sky dome uniformly with thousands of bright stars and stardust.
   */
  /**
   * Dual-layer organic procedural starlight in sky shader.
   * Uses 3D GLSL noise hashing for organic, non-repeating star placement without grid lines or symmetry rings.
   */
  const starRadiance = (dir: V3): V3 => {
    const d = dir.normalize() as V3
    const horizonFade = smoothstep(-0.15, 0.05, d.y as F) as F
    const nightFactor = smoothstep(0.1, -0.25, sunDirection.y as F) as F

    // Layer 1: Bright organic main stars
    const scale1 = float(220)
    const st1 = d.mul(scale1)
    const cell1 = floor(st1) as V3
    const f1 = fract(st1).sub(0.5) as V3
    const dot1 = cell1.x.mul(127.1).add(cell1.y.mul(311.7)).add(cell1.z.mul(74.7))
    const n1 = fract(sin(dot1).mul(43758.5453)) as F
    const isStar1 = smoothstep(0.965, 0.992, n1) as F
    const dist1 = f1.length() as F
    const shape1 = pow(clamp(float(1).sub(dist1.mul(2.2)), 0, 1), 5) as F
    const twinkle1 = sin(n1.mul(120).add(time.mul(3.5))).mul(0.35).add(0.65) as F
    const color1 = mix(vec3(1.0, 0.98, 0.9), vec3(0.75, 0.92, 1.0), n1) as V3
    const layer1 = color1.mul(isStar1.mul(shape1).mul(twinkle1).mul(4.5))

    // Layer 2: Dense organic stardust
    const scale2 = float(480)
    const st2 = d.mul(scale2)
    const cell2 = floor(st2) as V3
    const f2 = fract(st2).sub(0.5) as V3
    const dot2 = cell2.x.mul(269.5).add(cell2.y.mul(183.3)).add(cell2.z.mul(246.1))
    const n2 = fract(sin(dot2).mul(43758.5453)) as F
    const isStar2 = smoothstep(0.960, 0.990, n2) as F
    const dist2 = f2.length() as F
    const shape2 = pow(clamp(float(1).sub(dist2.mul(2.4)), 0, 1), 4) as F
    const twinkle2 = sin(n2.mul(90).add(time.mul(4.5))).mul(0.4).add(0.6) as F
    const color2 = mix(vec3(0.9, 0.95, 1.0), vec3(1.0, 0.9, 0.8), n2) as V3
    const layer2 = color2.mul(isStar2.mul(shape2).mul(twinkle2).mul(3.0))

    const combined = layer1.add(layer2) as V3
    return combined.mul(nightFactor).mul(horizonFade) as V3
  }

  const skyRadiance = (dir: V3): V3 => {
    const d = dir.normalize() as V3
    const up = clamp(d.y as F, -1, 1) as F
    const upClamped = clamp(up, 0, 1) as F

    const horizonWeight = pow(float(1).sub(upClamped), 5) as F
    let above = mix(zenith, horizon, horizonWeight) as V3

    const haze = pow(float(1).sub(upClamped), 22) as F
    above = mix(above, horizon.mul(1.12).add(vec3(0.05, 0.04, 0.03)), haze.mul(0.85)) as V3

    const sunAzimuth = clamp(d.dot(sunDirection) as F, 0, 1) as F
    above = above.add(sunColor.mul(pow(sunAzimuth, 3).mul(haze).mul(0.5))) as V3

    const sky = above.add(sunRadiance(d)) as V3
    const groundBlend = clamp(up.mul(14).add(0.5) as F, 0, 1) as F
    const skyBase = mix(ground, sky, groundBlend) as V3
    return skyBase.add(starRadiance(d)) as V3
  }

  /**
   * Aerial perspective — the single biggest realism win available here.
   *
   * Distant surfaces are seen through kilometres of air, so they lose contrast and take
   * on the colour of the sky *in that exact direction*. Because the sky is a pure
   * function we can evaluate it along the view ray and blend, which means the horizon
   * line dissolves correctly instead of terrain being cut out against a gradient.
   *
   * Density falls off with altitude: haze pools at sea level and thins as you climb, so
   * a hill top stays crisper than the shoreline behind it.
   */
  const aerialPerspective = (color: V3, viewDir: V3, distance: F, height: F): V3 => {
    const density = float(0.00042).mul(exp(height.mul(-0.004)))
    const amount = clamp(float(1).sub(exp(distance.mul(density).negate())), 0, 1) as F
    return mix(color, skyRadiance(viewDir), amount) as V3
  }

  return {
    skyRadiance,
    sunRadiance,
    aerialPerspective,
    uniforms: { sunDirection, zenith, horizon, ground, sunColor, sunIntensity },
    setSunDirection(x: number, y: number, z: number) {
      sunDirection.value.set(x, y, z).normalize()
    },
  }
}

export type Sky = ReturnType<typeof createSky>

/**
 * Sky dome material: a large inverted sphere with depth test/write off. Cheaper and
 * far more controllable than a cubemap background, and it keeps the sky as one node
 * function that water can reuse.
 */
export function createSkyMaterial(sky: Sky, THREE: typeof WebGPU, viewDirection: V3) {
  // MeshBasicNodeMaterial + `colorNode`, NOT a raw NodeMaterial with `fragmentNode`.
  // A raw fragmentNode emits a single vec4, so rendering into a scene pass declaring
  // mrt({ output, emissive }) fails validation outright:
  //   "Color target has no corresponding fragment stage output ... targets[1]"
  // Any material in an MRT pass must produce every declared target.
  const material = new THREE.MeshBasicNodeMaterial()
  material.colorNode = vec4(sky.skyRadiance(viewDirection), 1)

  // Only the sun disc and halo go to the emissive target, so bloom picks out the sun
  // rather than smearing the whole sky gradient.
  material.mrtNode = mrt({
    output,
    emissive: vec4(sky.sunRadiance(viewDirection), 1),
  })

  material.side = THREE.BackSide
  material.depthWrite = false
  material.depthTest = false
  material.fog = false
  return material
}

/** Cheap hemispheric ambient sampled from the same function, so lighting matches. */
export function ambientFromSky(sky: Sky): V3 {
  return mix(sky.uniforms.horizon, sky.uniforms.zenith, 0.5).mul(0.35) as V3
}
