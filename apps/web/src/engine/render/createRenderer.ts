import * as THREE from 'three/webgpu'

/**
 * Renderer construction, carrying the S1 findings.
 *
 * `WebGPURenderer` falls back to WebGL2 transparently — S1 verified the fallback is
 * genuinely free (identical draw calls, identical bloom+MRT output), because TSL
 * transpiles to both WGSL and GLSL. So there is no code branch, only a quality tier.
 */

export type CreatedRenderer = {
  renderer: THREE.WebGPURenderer
  backend: 'WebGPU' | 'WebGL2'
  adapter: string
}

export function shouldAutoFallbackWebGL(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('webgl') === '1' || params.get('backend') === 'webgl') return true
  if (params.get('webgl') === '0' || params.get('backend') === 'webgpu') return false
  if (localStorage.getItem('chill_force_webgl') === '1') return true

  // Chrome on macOS with WebGPU has an upstream Tint IR Metal lowering bug in Dawn
  // ("swizzle view instruction still has usages after lowering").
  // Automatically fallback to WebGL2 backend for rock-solid stability and high FPS.
  const isMac = /Macintosh|Mac OS X|Mac/i.test(navigator.userAgent)
  const isChrome =
    /Chrome|Chromium|CriOS/i.test(navigator.userAgent) &&
    !/Edge|Edg|OPR|Opera/i.test(navigator.userAgent)
  if (isMac && isChrome) {
    console.info(
      '[Renderer] macOS Chrome detected — using WebGL2 backend to prevent Tint IR Metal compiler bug',
    )
    return true
  }

  return false
}

export async function createRenderer(
  canvasHost: HTMLElement,
  opts: { forceWebGL?: boolean; pixelRatio?: number } = {},
): Promise<CreatedRenderer> {
  const size = await waitForSize(canvasHost)
  if (!size) throw new Error('canvas host was removed before it had a size')

  const forceWebGL =
    opts.forceWebGL === true || (opts.forceWebGL === undefined && shouldAutoFallbackWebGL())

  const renderer = new THREE.WebGPURenderer({
    antialias: false, // FXAA/TRAA live in the post chain instead
    forceWebGL,
  })
  renderer.setPixelRatio(opts.pixelRatio ?? Math.min(window.devicePixelRatio, 2))
  renderer.setSize(size.width, size.height)
  renderer.toneMapping = THREE.AgXToneMapping
  // RenderPipeline issues several internal render() calls per frame (scene pass, bloom
  // mips, resolve). With autoReset on, `info` reflects only the last of them; with it
  // off and a manual reset per frame, it reflects the whole frame — which is the number
  // the draw-call budget is actually about. three's own docs prescribe this pattern.
  renderer.info.autoReset = false
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  canvasHost.appendChild(renderer.domElement)
  await renderer.init()

  return {
    renderer,
    backend: renderer.backend instanceof THREE.WebGPUBackend ? 'WebGPU' : 'WebGL2',
    adapter: await describeGpu(),
  }
}

/**
 * three requests a GPU adapter during `init()` and then discards it, keeping only the
 * device — so `renderer.backend.adapter` is always undefined (S1). Ask the platform.
 */
async function describeGpu(): Promise<string> {
  if (!navigator.gpu) return 'no navigator.gpu (WebGL2 path)'
  try {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) return 'no adapter'
    const info = adapter.info
    return [info?.vendor, info?.architecture].filter(Boolean).join(' · ') || 'unknown'
  } catch {
    return 'requestAdapter threw'
  }
}

/**
 * Resolve once the element has a non-zero box.
 *
 * S1: mounting a renderer against a 0×0 host makes three allocate zero-sized swapchain
 * textures, and WebGPU rejects *every one* with a cascade of GPUValidationErrors. This
 * is not a transient nuisance — the automated pane genuinely reports `innerWidth === 0`
 * and `100dvh === 0px` until the page is first presented.
 */
export function waitForSize(el: HTMLElement): Promise<{ width: number; height: number } | null> {
  const measure = () => ({ width: Math.floor(el.clientWidth), height: Math.floor(el.clientHeight) })

  const initial = measure()
  if (initial.width > 0 && initial.height > 0) return Promise.resolve(initial)

  const { promise, resolve } = Promise.withResolvers<{ width: number; height: number } | null>()
  const ro = new ResizeObserver(() => {
    const size = measure()
    if (size.width > 0 && size.height > 0) {
      ro.disconnect()
      resolve(size)
    }
  })
  ro.observe(el)
  return promise
}
