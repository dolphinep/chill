'use client'

import { useEffect, useRef, useState } from 'react'

type Report = {
  backend: string
  adapter: string
  pipelineClass: string
  renderIsSync: boolean
  /** null while the document is hidden — rAF is suspended, so there is nothing to time. */
  fps: number | null
  frameMs: number | null
  drawCalls: number
}

export function S1Scene() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [forceWebGL, setForceWebGL] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let cleanup: (() => void) | null = null

    // Spike-only tracing. The browser pane runs with document.hidden, which
    // suspends rAF, so "nothing happened" has several possible causes — this makes
    // the actual stall point observable instead of guessable.
    const stage = (s: string) => {
      ;(window as unknown as { __s1: string[] }).__s1 ??= []
      ;(window as unknown as { __s1: string[] }).__s1.push(s)
    }
    stage('effect:start')

    // Dynamic import keeps three/webgpu (~278KB gz) out of the shell chunk.
    void (async () => {
      stage('import:begin')
      const THREE = await import('three/webgpu')
      const { pass, mrt, output, emissive } = await import('three/tsl')
      const { bloom } = await import('three/examples/jsm/tsl/display/BloomNode.js')

      stage('import:done')
      if (disposed) return

      // The host measures 0x0 on the first layout pass. Creating the renderer then
      // makes three allocate zero-sized swapchain textures, and WebGPU rejects every
      // one of them until a resize lands. Wait for a real size first.
      stage('size:wait')
      const size = await waitForSize(host)
      stage(`size:${size?.width}x${size?.height}`)
      if (disposed || !size) return

      const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(size.width, size.height)
      host.appendChild(renderer.domElement)

      stage('init:begin')
      await renderer.init()
      stage('init:done')
      if (disposed) {
        renderer.dispose()
        return
      }

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x0a0d14)

      const camera = new THREE.PerspectiveCamera(60, size.width / size.height, 0.1, 100)
      camera.position.set(0, 1.4, 5)

      scene.add(new THREE.AmbientLight(0x9fb4ff, 0.6))
      const sun = new THREE.DirectionalLight(0xffd9a8, 2.4)
      sun.position.set(4, 6, 3)
      scene.add(sun)

      // A rotating cube plus an emissive core, so bloom has something to bloom on.
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.6, 1.6),
        new THREE.MeshStandardNodeMaterial({ color: 0x4a6fa5, roughness: 0.35, metalness: 0.1 }),
      )
      scene.add(cube)

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 32, 16),
        new THREE.MeshStandardNodeMaterial({
          color: 0x000000,
          emissive: new THREE.Color(0xffb257),
          emissiveIntensity: 4,
        }),
      )
      scene.add(core)

      // MRT so bloom reads the emissive channel rather than thresholding the whole
      // frame — same wiring the real post chain will use.
      const scenePass = pass(scene, camera)
      scenePass.setMRT(mrt({ output, emissive }))

      const pipeline = new THREE.RenderPipeline(renderer)
      pipeline.outputNode = scenePass
        .getTextureNode('output')
        .add(bloom(scenePass.getTextureNode('emissive'), 1.1, 0.4, 0.1))

      // The finding that matters: render() returns undefined, not a Promise, so the
      // loop never awaits and never builds a microtask chain.
      stage('firstRender:begin')
      const renderIsSync = pipeline.render() === undefined
      stage('firstRender:done')

      const staticReport = {
        backend: renderer.backend instanceof THREE.WebGPUBackend ? 'WebGPU' : 'WebGL2',
        adapter: await describeGpu(),
        pipelineClass: THREE.RenderPipeline.name,
        renderIsSync,
        drawCalls: renderer.info.render.drawCalls,
      }

      // Report the correctness findings from that first synchronous frame. Frame
      // timing needs rAF, which is fully suspended while the document is hidden —
      // so in a background tab or an automated pane, fps stays null rather than
      // silently reporting nothing at all.
      setReport({ ...staticReport, fps: null, frameMs: null })
      stage('report:set')

      const ro = new ResizeObserver(([entry]) => {
        const w = Math.floor(entry?.contentRect.width ?? 0)
        const h = Math.floor(entry?.contentRect.height ?? 0)
        if (w === 0 || h === 0) return // never hand three a zero-sized target
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
      })
      ro.observe(host)

      let frames = 0
      let elapsedMs = 0
      let last = performance.now()

      renderer.setAnimationLoop(() => {
        const now = performance.now()
        const rawMs = now - last
        const dt = Math.min(rawMs / 1000, 1 / 20)
        last = now

        cube.rotation.x += dt * 0.4
        cube.rotation.y += dt * 0.7
        core.position.x = Math.sin(now / 900) * 2.2

        pipeline.render()

        frames += 1
        elapsedMs += rawMs
        if (frames >= 60) {
          const frameMs = elapsedMs / frames
          setReport({
            ...staticReport,
            drawCalls: renderer.info.render.drawCalls,
            fps: Math.round(1000 / frameMs),
            frameMs: Number(frameMs.toFixed(2)),
          })
          frames = 0
          elapsedMs = 0
        }
      })

      cleanup = () => {
        renderer.setAnimationLoop(null)
        ro.disconnect()
        pipeline.dispose()
        renderer.dispose()
        host.removeChild(renderer.domElement)
      }
    })().catch((e: unknown) => {
      stage('error:' + (e instanceof Error ? e.message : String(e)))
      setError(e instanceof Error ? e.message : String(e))
    })

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [forceWebGL])

  return (
    <div className="relative min-h-dvh w-full">
      <div ref={hostRef} className="absolute inset-0" />

      <div className="glass absolute top-6 right-6 w-72 p-4 text-xs">
        <p className="mb-3 text-sm font-medium">S1 · WebGPU + RenderPipeline</p>

        {error ? (
          <p className="text-red-300">{error}</p>
        ) : report ? (
          <dl className="space-y-1">
            <Row k="backend" v={report.backend} />
            <Row k="adapter" v={report.adapter} />
            <Row k="pipeline class" v={report.pipelineClass} />
            <Row k="render() sync" v={report.renderIsSync ? 'yes' : 'NO — investigate'} />
            <Row
              k="frame"
              v={
                report.frameMs === null
                  ? 'n/a — document hidden'
                  : `${report.frameMs} ms (~${report.fps} fps)`
              }
            />
            <Row k="draw calls" v={String(report.drawCalls)} />
          </dl>
        ) : (
          <p className="text-glass-faint">measuring…</p>
        )}

        <label className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={forceWebGL}
            onChange={(e) => setForceWebGL(e.target.checked)}
          />
          <span>forceWebGL (fallback check)</span>
        </label>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-glass-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  )
}

/**
 * three requests an adapter during init and then discards it, keeping only the
 * device — so `backend.adapter` is always undefined. Ask the platform directly.
 * This is how the real QualityTier will pick its starting tier.
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
 * Resolves once the element has a non-zero box. Returns null if the element is
 * torn down first. Every canvas host needs this — a 0x0 WebGPU surface is not a
 * transient nuisance, it produces a cascade of GPUValidationErrors.
 */
function waitForSize(el: HTMLElement): Promise<{ width: number; height: number } | null> {
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
