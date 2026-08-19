'use client'

import { useEffect, useRef, useState } from 'react'

type Report = {
  instances: number
  bones: number
  drawCalls: number
  triangles: number
  boneTextureKB: number
  /** Wall time for one render of the whole crowd, GPU flush included. */
  crowdFrameMs: number
  /** JS cost of the crowd per frame — one uniform write. */
  crowdJsMs: number
  /** JS cost of the naive path: Skeleton.update() per character. */
  skeletonJsMs: number
  perCharacterUs: number
  verdict: string
}

const INSTANCES = 200
const CLIPS = 4
const FRAMES = 32
const CLIP_DURATION = 2

export function S3Scene() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let cleanup: (() => void) | null = null

    void (async () => {
      const THREE = await import('three/webgpu')
      const { bakeBoneTexture } = await import('@/engine/avatars/BoneTextureBaker')
      const { createVatSkinning } = await import('@/engine/tsl/crowd/vatSkinning')
      const { createRiggedGeometry, poseBone, RIG_BONES } = await import('./rig')
      if (disposed) return

      const size = await waitForSize(host)
      if (disposed || !size) return

      const renderer = new THREE.WebGPURenderer({ antialias: true })
      renderer.setPixelRatio(1)
      renderer.setSize(size.width, size.height)
      host.appendChild(renderer.domElement)
      await renderer.init()
      if (disposed) return renderer.dispose()

      // --- bake -------------------------------------------------------------
      const { texture: boneTexture, layout } = bakeBoneTexture(
        { bones: RIG_BONES, clips: CLIPS, frames: FRAMES },
        (clip, frame, bone, out) => poseBone(clip, frame, FRAMES, bone, out),
      )
      const boneTextureKB = (layout.width * layout.height * 4 * 4) / 1024

      // --- crowd ------------------------------------------------------------
      const geo = createRiggedGeometry()
      const anim = new Float32Array(INSTANCES * 2)
      for (let i = 0; i < INSTANCES; i++) {
        anim[i * 2] = i % CLIPS // clip index
        anim[i * 2 + 1] = (i * 0.137) % CLIP_DURATION // phase offset
      }
      geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(anim, 2))

      const vat = createVatSkinning({ boneTexture, layout, clipDuration: CLIP_DURATION })
      const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.05 })
      material.positionNode = vat.positionNode

      const crowd = new THREE.InstancedMesh(geo, material, INSTANCES)
      crowd.frustumCulled = false
      const m = new THREE.Matrix4()
      const cols = Math.ceil(Math.sqrt(INSTANCES))
      for (let i = 0; i < INSTANCES; i++) {
        const gx = (i % cols) - cols / 2
        const gz = Math.floor(i / cols) - cols / 2
        m.makeTranslation(gx * 1.5, 0, gz * 1.5)
        crowd.setMatrixAt(i, m)
      }
      crowd.instanceMatrix.needsUpdate = true

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x0a0d14)
      scene.add(crowd)
      scene.add(new THREE.AmbientLight(0x93a7d8, 1.1))
      const sun = new THREE.DirectionalLight(0xffd9a8, 2.2)
      sun.position.set(5, 9, 4)
      scene.add(sun)

      const camera = new THREE.PerspectiveCamera(50, size.width / size.height, 0.1, 200)
      camera.position.set(0, 9, 26)
      camera.lookAt(0, 1, 0)

      // --- measure ----------------------------------------------------------
      // rAF is suspended while the document is hidden (S1), so drive frames manually
      // and wait for the GPU to actually finish. `onSubmittedWorkDone` is the exact
      // WebGPU primitive for this; without it we would only be timing command
      // submission, which is not the number anyone cares about.
      const device = (renderer.backend as { device?: GPUDevice }).device
      const flush = async () => {
        if (device) await device.queue.onSubmittedWorkDone()
        else await new Promise((r) => setTimeout(r, 0)) // WebGL2 fallback
      }

      const N = 90
      vat.setTime(0)
      renderer.render(scene, camera)
      // Capture stats immediately: renderer.info resets at the start of each render,
      // so reading it after the timing loop + flush reports zeros.
      const drawCalls = renderer.info.render.drawCalls
      const triangles = renderer.info.render.triangles
      await flush() // warm up: compile the pipeline before timing anything

      const t0 = performance.now()
      for (let i = 0; i < N; i++) {
        vat.setTime(i / 60)
        renderer.render(scene, camera)
      }
      await flush()
      const crowdFrameMs = (performance.now() - t0) / N

      // JS-only cost of the crowd: one uniform write per frame, for every avatar.
      const tJs0 = performance.now()
      for (let i = 0; i < N; i++) vat.setTime(i / 60)
      const crowdJsMs = (performance.now() - tJs0) / N

      // The naive path's CPU cost, isolated: a real Skeleton per character.
      const skeletons: InstanceType<typeof THREE.Skeleton>[] = []
      for (let s = 0; s < INSTANCES; s++) {
        const bones: InstanceType<typeof THREE.Bone>[] = []
        for (let b = 0; b < RIG_BONES; b++) {
          const bone = new THREE.Bone()
          bone.position.y = b === 0 ? 0 : 0.045
          if (b > 0) bones[b - 1]!.add(bone)
          bones.push(bone)
        }
        bones[0]!.updateMatrixWorld(true)
        skeletons.push(new THREE.Skeleton(bones))
      }
      const tSk0 = performance.now()
      for (let i = 0; i < N; i++) {
        for (const sk of skeletons) {
          sk.bones[1]!.rotation.z = Math.sin(i * 0.1) * 0.2
          sk.bones[0]!.updateMatrixWorld(true)
          sk.update()
        }
      }
      const skeletonJsMs = (performance.now() - tSk0) / N

      if (disposed) return renderer.dispose()

      const perCharacterUs = (skeletonJsMs / INSTANCES) * 1000
      setReport({
        instances: INSTANCES,
        bones: RIG_BONES,
        drawCalls,
        triangles,
        boneTextureKB,
        crowdFrameMs,
        crowdJsMs,
        skeletonJsMs,
        perCharacterUs,
        verdict:
          drawCalls <= 2 && crowdJsMs < 0.05
            ? 'VAT path viable — 1 draw call, no per-avatar JS'
            : 'investigate',
      })

      // Leave a slow animation running for visual inspection when visible.
      let raf = 0
      const loop = () => {
        vat.setTime(performance.now() / 1000)
        renderer.render(scene, camera)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)

      cleanup = () => {
        cancelAnimationFrame(raf)
        renderer.dispose()
        boneTexture.dispose()
        geo.dispose()
        material.dispose()
        host.removeChild(renderer.domElement)
      }
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [])

  return (
    <div className="relative min-h-dvh w-full">
      <div ref={hostRef} className="absolute inset-0" />

      <div className="glass absolute top-6 right-6 w-[24rem] p-5 text-xs">
        <p className="mb-3 text-sm font-medium">S3 · VAT crowd skinning</p>
        {error ? (
          <p className="text-red-300">{error}</p>
        ) : report ? (
          <>
            <dl className="space-y-1 font-mono text-[11px]">
              <Row k="instances" v={`${report.instances} × ${report.bones} bones`} />
              <Row k="draw calls" v={String(report.drawCalls)} />
              <Row k="triangles" v={report.triangles.toLocaleString()} />
              <Row k="bone texture" v={`${report.boneTextureKB.toFixed(0)} KB`} />
              <Row k="frame (flushed)" v={`${report.crowdFrameMs.toFixed(2)} ms`} />
              <Row k="crowd JS/frame" v={`${report.crowdJsMs.toFixed(4)} ms`} />
              <Row k="— naive skeletons" v={`${report.skeletonJsMs.toFixed(2)} ms`} />
              <Row k="— per character" v={`${report.perCharacterUs.toFixed(1)} µs`} />
            </dl>
            <p className="mt-3 text-emerald-300">{report.verdict}</p>
          </>
        ) : (
          <p className="text-glass-faint">baking, rendering, measuring…</p>
        )}
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

/** See S1: a 0×0 WebGPU surface cascades GPUValidationErrors. */
function waitForSize(el: HTMLElement): Promise<{ width: number; height: number } | null> {
  const measure = () => ({ width: Math.floor(el.clientWidth), height: Math.floor(el.clientHeight) })
  const initial = measure()
  if (initial.width > 0 && initial.height > 0) return Promise.resolve(initial)

  const { promise, resolve } = Promise.withResolvers<{ width: number; height: number } | null>()
  const ro = new ResizeObserver(() => {
    const s = measure()
    if (s.width > 0 && s.height > 0) {
      ro.disconnect()
      resolve(s)
    }
  })
  ro.observe(el)
  return promise
}
