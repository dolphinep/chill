import * as THREE from 'three/webgpu'

/**
 * A small warm light that floats beside the local character — the observatory
 * scenery is deliberately locked to permanent deep night (see `Engine.ts`'s
 * `#applyNormalizedTime` night-lock), which makes the ground/deck genuinely hard to
 * see without something nearby actually casting light, not just decorative glow.
 * Local-only by design: this exists to help *you* see in the dark you're standing
 * in, not something other players need to see rendered on your avatar.
 *
 * Floats with a gentle lag + slow bob rather than rigidly locking to an offset from
 * the character every frame — a lantern rigidly glued in place reads as "attached
 * object," a softly-trailing one reads as "floating alongside you."
 */
export type PlayerLantern = {
  group: THREE.Group
  update(
    dt: number,
    characterX: number,
    characterY: number,
    characterZ: number,
    characterYaw: number,
  ): void
  dispose(): void
}

const FOLLOW_LAG_S = 0.25
const SIDE_OFFSET_M = 0.55
const HEIGHT_OFFSET_M = 1.15
const BOB_AMPLITUDE_M = 0.06
const BOB_SPEED = 1.3

export function createPlayerLantern(): PlayerLantern {
  const group = new THREE.Group()

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c9,
    emissive: 0xffb454,
    emissiveIntensity: 2.2,
    roughness: 0.4,
    transparent: true,
    opacity: 0.92,
  })
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x2a2015,
    roughness: 0.6,
    metalness: 0.3,
  })

  const bodyGeo = new THREE.SphereGeometry(0.12, 16, 12)
  const body = new THREE.Mesh(bodyGeo, glassMat)
  body.castShadow = false
  group.add(body)

  const ringGeo = new THREE.TorusGeometry(0.13, 0.012, 6, 16)
  const topRing = new THREE.Mesh(ringGeo, frameMat)
  topRing.position.y = 0.09
  topRing.rotation.x = Math.PI / 2
  group.add(topRing)
  const bottomRing = new THREE.Mesh(ringGeo, frameMat)
  bottomRing.position.y = -0.09
  bottomRing.rotation.x = Math.PI / 2
  group.add(bottomRing)

  const hookGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6)
  const hook = new THREE.Mesh(hookGeo, frameMat)
  hook.position.y = 0.18
  group.add(hook)

  // Warm, modest radius — enough to actually light the ground/deck right around the
  // player, not a substitute for the scene's own moonlight/starlight ambiance.
  const light = new THREE.PointLight(0xffb454, 3.5, 12, 2)
  light.castShadow = false
  group.add(light)

  const current = new THREE.Vector3()
  let hasPosition = false
  let bobPhase = Math.random() * Math.PI * 2

  return {
    group,
    update(dt, characterX, characterY, characterZ, characterYaw) {
      const rightX = Math.cos(characterYaw)
      const rightZ = -Math.sin(characterYaw)
      const targetX = characterX + rightX * SIDE_OFFSET_M
      const targetZ = characterZ + rightZ * SIDE_OFFSET_M

      bobPhase += dt * BOB_SPEED
      const targetY = characterY + HEIGHT_OFFSET_M + Math.sin(bobPhase) * BOB_AMPLITUDE_M

      if (!hasPosition) {
        current.set(targetX, targetY, targetZ)
        hasPosition = true
      } else {
        const t = 1 - Math.exp(-dt / FOLLOW_LAG_S)
        current.x += (targetX - current.x) * t
        current.y += (targetY - current.y) * t
        current.z += (targetZ - current.z) * t
      }
      group.position.copy(current)
    },
    dispose() {
      bodyGeo.dispose()
      ringGeo.dispose()
      hookGeo.dispose()
      glassMat.dispose()
      frameMat.dispose()
    },
  }
}
