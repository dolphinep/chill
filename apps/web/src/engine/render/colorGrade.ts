import { clamp, dot, float, fract, hash, mix, pow, screenCoordinate, smoothstep, time, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'

type F = Node<'float'>
type V3 = Node<'vec3'>

const LUMA = vec3(0.2126, 0.7152, 0.0722)

export function grade(color: V3): V3 {
  let c = clamp(color, 0, 1) as V3
  const luma = dot(c, LUMA) as F

  // Mask black lift in dark shadows so night skies stay rich dark black rather than muddy noise
  const shadowMask = smoothstep(0.02, 0.20, luma) as F
  const liftColor = vec3(0.008, 0.010, 0.015).mul(shadowMask)
  const lifted = liftColor.add(c.mul(vec3(1).sub(liftColor))) as V3
  c = pow(lifted, vec3(0.95)) as V3

  // Split-tone: cool shadows, warm highlights
  const shadowTone = vec3(0.0, 0.008, 0.018)
  const highlightTone = vec3(0.02, 0.01, -0.01)
  c = c.add(shadowTone.mul(float(1).sub(luma).pow(2))).add(highlightTone.mul(luma.pow(2))) as V3

  // Saturation push
  c = mix(vec3(luma), c, 1.1) as V3

  return clamp(c, 0, 1) as V3
}

/**
 * Animated white-noise grain, masked in dark shadow regions so night scenes stay crystal clear.
 */
export function filmGrain(color: V3, strength = 0.010): V3 {
  const luma = dot(color, LUMA) as F
  const shadowMask = smoothstep(0.03, 0.30, luma) as F
  const n = hash(
    screenCoordinate.x.add(screenCoordinate.y.mul(1920)).add(fract(time.mul(997))),
  ) as F
  const grain = n.sub(0.5).mul(strength).mul(shadowMask) as F
  return clamp(color.add(grain), 0, 1) as V3
}
