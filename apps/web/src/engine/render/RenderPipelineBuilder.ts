import * as THREE from 'three/webgpu'
import { mrt, output, emissive, pass, vec4 } from 'three/tsl'
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js'
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js'
import type { Node } from 'three/webgpu'
import type { QualityTierName } from '@/engine/core/EngineEventBus'
import { TIER_SETTINGS } from '@/engine/core/QualityTier'
import { filmGrain, grade } from './colorGrade'

/**
 * The post chain.
 *
 * `RenderPipeline`, not `PostProcessing` — the latter was renamed at r183 and only
 * survives to emit a deprecation warning (S1). `render()` is fully synchronous, so the
 * frame loop never awaits and never builds a microtask chain.
 *
 * TRAA is deliberately absent for now: S5 could not establish whether it ghosts on
 * vertex-animated geometry (water, grass, the VAT crowd), because temporal history does
 * not accumulate in an automated pane. FXAA ships until that is settled in a visible
 * window. Adding TRAA later is a change here and nowhere else.
 */

export type BuiltPipeline = {
  pipeline: THREE.RenderPipeline
  dispose: () => void
}

export function buildRenderPipeline(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  tier: QualityTierName,
): BuiltPipeline {
  const settings = TIER_SETTINGS[tier]

  const scenePass = pass(scene, camera)
  // Bloom reads the emissive channel rather than thresholding the whole frame, so a
  // bright sky does not smear into everything. Only declare the extra target when
  // something consumes it — every material in an MRT pass must write every target.
  if (settings.bloom) scenePass.setMRT(mrt({ output, emissive }))

  // Typed as the general node, not TextureNode: each stage returns a computed node.
  // `fxaa()` calls `convertToTexture()` internally, so a computed input is fine.
  let node: Node<'vec4'> = scenePass.getTextureNode('output')

  if (settings.bloom) {
    // Gentle. Bloom is a seasoning here — at 0.7 the sun halo swallowed the horizon.
    node = node.add(bloom(scenePass.getTextureNode('emissive'), 0.28, 0.65, 0.05)) as Node<'vec4'>
  }
  if (settings.fxaa) {
    node = fxaa(node) as unknown as Node<'vec4'>
  }

  // Grade and grain run last, on the AA'd frame, and always — they are a few ALU ops and
  // are what stops the beach reading as an untouched render.
  const graded = grade(node.rgb as Node<'vec3'>)
  const grained = filmGrain(graded)
  node = vec4(grained, node.a) as Node<'vec4'>

  const pipeline = new THREE.RenderPipeline(renderer)
  pipeline.outputNode = node

  return {
    pipeline,
    dispose: () => pipeline.dispose(),
  }
}
