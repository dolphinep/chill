'use client'

import { useEffect, useRef, useState } from 'react'
import type { Node } from 'three/webgpu'

type Report = {
  backend: string
  shadowsOk: boolean
  cascades: number
  traaEngaged: boolean
  /** Max per-pixel delta TRAA-on vs off. Near zero => TRAA is a silent passthrough. */
  traaMaxDelta: number
  /** Share of pixels TRAA changed by >4 levels — should be edge-shaped, i.e. small but nonzero. */
  traaChangedPct: number
  /** Residual vs a clean reference frame, accumulated while the waves MOVED. */
  movingResidual: number
  /** Same, with the wave clock frozen — the control. */
  frozenResidual: number
  /** movingResidual - frozenResidual. This is the ghosting attributable to motion. */
  ghostExcess: number
  /** Same at 12x speed, so per-frame motion is several pixels rather than sub-pixel. */
  stressResidual: number
  stressExcess: number
  /** 2-frame vs 32-frame TRAA on a frozen scene. ~0 means no temporal accumulation. */
  accumMean: number
  accumMax: number
  drawCalls: number
  frameMs: number
  notes: string[]
}

const W = 640
const H = 360
const CASCADES = 3

export function S57Scene() {
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
      const { pass, mrt, output, velocity, positionLocal, sin, uniform, vec3 } =
        await import('three/tsl')
      const { traa } = await import('three/examples/jsm/tsl/display/TRAANode.js')
      const { CSMShadowNode } = await import('three/examples/jsm/csm/CSMShadowNode.js')
      if (disposed) return

      const notes: string[] = []

      const renderer = new THREE.WebGPURenderer({ antialias: false })
      renderer.setPixelRatio(1)
      renderer.setSize(W, H)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      host.appendChild(renderer.domElement)
      await renderer.init()
      if (disposed) return renderer.dispose()

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x101726)

      const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 400)
      camera.position.set(0, 7, 20)
      camera.lookAt(0, 0, 0)

      scene.add(new THREE.AmbientLight(0x8fa6d6, 0.5))

      const sun = new THREE.DirectionalLight(0xffe2b0, 3)
      sun.position.set(12, 14, 8)
      sun.castShadow = true
      sun.shadow.mapSize.set(1024, 1024)
      scene.add(sun)

      // --- S7: cascaded shadows on the node renderer -------------------------
      let shadowsOk = false
      try {
        const csm = new CSMShadowNode(sun, { cascades: CASCADES, maxFar: 120, mode: 'practical' })
        sun.shadow.shadowNode = csm
        shadowsOk = true
        notes.push(`CSMShadowNode attached via light.shadow.shadowNode (${CASCADES} cascades)`)
      } catch (e) {
        notes.push(`CSMShadowNode failed: ${e instanceof Error ? e.message : String(e)}`)
      }

      // --- S5: a vertex-animated receiver, like water/grass will be -----------
      // Displacement happens entirely in the vertex stage and is driven by the
      // built-in `time` node, so nothing on the CPU knows the geometry moved. This is
      // precisely the case that ghosts under TRAA if velocity is not accounted for.
      const waterGeo = new THREE.PlaneGeometry(70, 70, 128, 128)
      waterGeo.rotateX(-Math.PI / 2)
      const waterMat = new THREE.MeshStandardNodeMaterial({
        color: 0x2f5d8a,
        roughness: 0.25,
        metalness: 0.1,
      })
      const waveHeight = (t: Node<'float'>) =>
        sin(positionLocal.x.mul(0.35).add(t.mul(1.4)))
          .mul(0.55)
          .add(sin(positionLocal.z.mul(0.5).sub(t.mul(1.1))).mul(0.35))
      // Our own clock, NOT the built-in `time` node. The built-in advances on every
      // render, so it cannot be frozen — and without a frozen reference there is no
      // way to separate "TRAA smear" from "the scene simply moved".
      const waveTime = uniform(0)
      waterMat.positionNode = vec3(
        positionLocal.x,
        positionLocal.y.add(waveHeight(waveTime)),
        positionLocal.z,
      )
      const water = new THREE.Mesh(waterGeo, waterMat)
      water.receiveShadow = true
      scene.add(water)

      // Static casters, so shadow edges are unambiguous.
      const boxMat = new THREE.MeshStandardNodeMaterial({ color: 0xd8cfc0, roughness: 0.7 })
      for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4 + (i % 3) * 2, 1.4), boxMat)
        b.position.set(((i % 3) - 1) * 7, 2 + (i % 3), (Math.floor(i / 3) - 1) * 7)
        b.castShadow = true
        b.receiveShadow = true
        scene.add(b)
      }

      // --- pipelines: TRAA on vs off ----------------------------------------
      const scenePass = pass(scene, camera)
      scenePass.setMRT(mrt({ output, velocity }))
      const colorNode = scenePass.getTextureNode('output')

      const plain = new THREE.RenderPipeline(renderer)
      plain.outputNode = colorNode

      let traaPipeline: InstanceType<typeof THREE.RenderPipeline> | null = null
      let traaEngaged = false
      try {
        traaPipeline = new THREE.RenderPipeline(renderer)
        // traa(beauty, depth, velocity, camera) — it needs depth AND velocity, which is
        // why the scene pass declares an MRT with a velocity target.
        traaPipeline.outputNode = traa(
          colorNode,
          scenePass.getTextureNode('depth'),
          scenePass.getTextureNode('velocity'),
          camera,
        )
        traaEngaged = true
        notes.push('TRAANode built against a scene pass with mrt({ output, velocity })')
      } catch (e) {
        notes.push(`TRAA failed: ${e instanceof Error ? e.message : String(e)}`)
      }

      // --- measure ----------------------------------------------------------
      const device = (renderer.backend as { device?: GPUDevice }).device
      const flush = async () => {
        if (device) await device.queue.onSubmittedWorkDone()
      }

      const readTarget = new THREE.RenderTarget(W, H, {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        colorSpace: THREE.NoColorSpace,
        depthBuffer: true,
      })

      /**
       * Accumulate `frames` renders into an offscreen target and read the result.
       * `advance` controls whether the wave clock moves between frames.
       */
      const grab = async (
        pipeline: InstanceType<typeof THREE.RenderPipeline>,
        frames: number,
        startT: number,
        stepPerFrame: number,
      ) => {
        const prev = renderer.getRenderTarget()
        renderer.setRenderTarget(readTarget)
        for (let i = 0; i < frames; i++) {
          waveTime.value = startT + i * stepPerFrame
          pipeline.render()
        }
        renderer.setRenderTarget(prev)
        await flush()
        const px = await renderer.readRenderTargetPixelsAsync(readTarget, 0, 0, W, H)
        return new Uint8Array(px as unknown as ArrayBufferLike)
      }

      const diff = (a: Uint8Array, b: Uint8Array) => {
        let sum = 0
        let max = 0
        let changed = 0
        const n = Math.min(a.length, b.length)
        for (let i = 0; i < n; i += 4) {
          const d =
            (Math.abs(a[i]! - b[i]!) +
              Math.abs(a[i + 1]! - b[i + 1]!) +
              Math.abs(a[i + 2]! - b[i + 2]!)) /
            3
          sum += d
          if (d > max) max = d
          if (d > 4) changed++
        }
        const px = n / 4
        return { mean: sum / px, max, changedPct: (changed / px) * 100 }
      }

      // Warm up (pipeline compilation) before any timing or comparison.
      plain.render()
      await flush()
      const drawCalls = renderer.info.render.drawCalls

      // --- is TRAA actually doing anything? ---------------------------------
      // A whole-image mean dilutes an edge-only effect to nearly nothing, so judge on
      // max delta and the share of pixels that moved. Real AA changes edges a lot and
      // flat areas not at all; a silent passthrough changes nothing anywhere.
      const T_REF = 3.0
      const plainRef = await grab(plain, 2, T_REF, 0)
      const traaConverged = traaPipeline ? await grab(traaPipeline, 32, T_REF, 0) : plainRef
      const traaVsPlain = diff(plainRef, traaConverged)

      // --- ghosting on vertex-animated geometry -----------------------------
      // Accumulate with the wave clock MOVING, ending at T_REF, then compare against a
      // single clean frame at T_REF. Smearing shows up as a residual that the frozen
      // control does not have.
      const FRAMES = 32
      const frozenResidual = diff(plainRef, traaConverged)

      // Does TRAA history actually accumulate across manually-driven renders?
      // If 2 frames and 32 frames of the same frozen scene are identical, then this
      // harness is not exercising temporal accumulation at all, and every ghosting
      // number below is meaningless rather than reassuring.
      const traaShort = traaPipeline ? await grab(traaPipeline, 2, T_REF, 0) : plainRef
      const accumDelta = diff(traaShort, traaConverged)

      // Realistic speed: 60 Hz playback. Per-frame surface motion here is sub-pixel,
      // which is the honest normal case.
      const NORMAL_STEP = 1 / 60
      const traaMoving = traaPipeline
        ? await grab(traaPipeline, FRAMES, T_REF - (FRAMES - 1) * NORMAL_STEP, NORMAL_STEP)
        : plainRef
      const movingResidual = diff(plainRef, traaMoving)
      const ghostExcess = movingResidual.mean - frozenResidual.mean

      // Stress: 12x faster, so the surface moves several pixels per frame. Sub-pixel
      // motion cannot provoke smearing, so without this the "no ghosting" result would
      // be untrustworthy — it would only prove the test was too gentle.
      const STRESS_STEP = 0.2
      const traaStress = traaPipeline
        ? await grab(traaPipeline, FRAMES, T_REF - (FRAMES - 1) * STRESS_STEP, STRESS_STEP)
        : plainRef
      const stressResidual = diff(plainRef, traaStress)
      const stressExcess = stressResidual.mean - frozenResidual.mean

      const t0 = performance.now()
      const N = 60
      for (let i = 0; i < N; i++) {
        waveTime.value = 5 + i / 60
        ;(traaPipeline ?? plain).render()
      }
      await flush()
      const frameMs = (performance.now() - t0) / N

      if (disposed) return renderer.dispose()

      setReport({
        backend: renderer.backend instanceof THREE.WebGPUBackend ? 'WebGPU' : 'WebGL2',
        shadowsOk,
        cascades: CASCADES,
        traaEngaged,
        traaMaxDelta: traaVsPlain.max,
        traaChangedPct: traaVsPlain.changedPct,
        movingResidual: movingResidual.mean,
        frozenResidual: frozenResidual.mean,
        ghostExcess,
        stressResidual: stressResidual.mean,
        stressExcess,
        accumMean: accumDelta.mean,
        accumMax: accumDelta.max,
        drawCalls,
        frameMs,
        notes,
      })

      // Leave the TRAA pipeline presenting for visual inspection.
      let raf = 0
      const loop = () => {
        ;(traaPipeline ?? plain).render()
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)

      cleanup = () => {
        cancelAnimationFrame(raf)
        readTarget.dispose()
        plain.dispose()
        traaPipeline?.dispose()
        renderer.dispose()
        host.removeChild(renderer.domElement)
      }
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [])

  return (
    <main className="min-h-dvh p-8">
      <h1 className="mb-1 text-lg font-medium">
        S5 + S7 · TRAA over vertex-animated + CSM shadows
      </h1>
      <p className="text-glass-muted mb-6 text-sm">
        Tested together because the risk is the interaction: TRAA ghosting on vertex-animated
        geometry that is also receiving cascaded shadows.
      </p>

      <div className="flex flex-wrap items-start gap-6">
        <div ref={hostRef} className="glass overflow-hidden p-2" />

        <div className="glass w-[26rem] p-5 text-xs">
          {error ? (
            <p className="text-red-300">{error}</p>
          ) : report ? (
            <>
              <dl className="space-y-1 font-mono text-[11px]">
                <Row k="backend" v={report.backend} />
                <Row
                  k="CSM shadows"
                  v={report.shadowsOk ? `ok (${report.cascades} cascades)` : 'FAILED'}
                />
                <Row k="TRAA built" v={report.traaEngaged ? 'ok' : 'FAILED'} />
                <Row k="TRAA max delta" v={report.traaMaxDelta.toFixed(1)} />
                <Row k="TRAA px changed" v={`${report.traaChangedPct.toFixed(2)} %`} />
                <Row k="residual · moving" v={report.movingResidual.toFixed(2)} />
                <Row k="residual · frozen" v={report.frozenResidual.toFixed(2)} />
                <Row k="ghost excess" v={report.ghostExcess.toFixed(2)} />
                <Row k="residual · 12x stress" v={report.stressResidual.toFixed(2)} />
                <Row k="stress excess" v={report.stressExcess.toFixed(2)} />
                <Row
                  k="accum 2f vs 32f"
                  v={`${report.accumMean.toFixed(2)} / max ${report.accumMax.toFixed(1)}`}
                />
                <Row k="draw calls" v={String(report.drawCalls)} />
                <Row k="frame (flushed)" v={`${report.frameMs.toFixed(2)} ms`} />
              </dl>
              <ul className="text-glass-muted mt-3 space-y-1">
                {report.notes.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-glass-faint">rendering and comparing…</p>
          )}
        </div>
      </div>
    </main>
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
