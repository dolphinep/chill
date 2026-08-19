import * as THREE from 'three/webgpu'
import { sampleHeight } from '@/engine/terrain/HeightFieldCpu'
import type { HeightSpec } from '@/engine/terrain/HeightSpec'

/**
 * A small hand-assembled stone platform + telescope silhouette, giving the
 * observatory scenery a landmark to stand at rather than just "a mountaintop with
 * stars" — same "a few `THREE.Mesh` primitives in one `THREE.Group`" recipe as
 * `SkeetField`/`TargetField`, deliberately simple since the actual point of this
 * scenery is the sky, not the structure.
 */
export function createObservatoryDeck(spec: HeightSpec, x: number, z: number) {
  const group = new THREE.Group()
  const groundY = sampleHeight(spec, x, z)
  group.position.set(x, groundY, z)

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.92 })
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.55, metalness: 0.4 })

  const deckGeo = new THREE.CylinderGeometry(3.4, 3.6, 0.3, 24)
  const deck = new THREE.Mesh(deckGeo, stoneMat)
  deck.position.y = 0.15
  deck.receiveShadow = true
  group.add(deck)

  const railGeo = new THREE.TorusGeometry(3.3, 0.05, 8, 32)
  const rail = new THREE.Mesh(railGeo, metalMat)
  rail.rotation.x = Math.PI / 2
  rail.position.y = 0.65
  group.add(rail)

  const mountGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.1, 12)
  const mount = new THREE.Mesh(mountGeo, metalMat)
  mount.position.y = 0.85
  mount.castShadow = true
  group.add(mount)

  const tubeGeo = new THREE.CylinderGeometry(0.16, 0.22, 2.2, 16)
  const tube = new THREE.Mesh(tubeGeo, metalMat)
  tube.position.set(0, 1.9, -0.3)
  tube.rotation.x = -Math.PI / 3.4 // angled up toward the sky
  tube.castShadow = true
  group.add(tube)

  return {
    group,
    dispose(): void {
      deckGeo.dispose()
      railGeo.dispose()
      mountGeo.dispose()
      tubeGeo.dispose()
      stoneMat.dispose()
      metalMat.dispose()
    },
  }
}
