'use client'

import { useEffect, useRef, useState } from 'react'
import type { CompareResult } from '@/engine/debug/bakeAndCompare'
import { KAMAKURA_BAY } from '@/engine/terrain/HeightSpec'
import { sampleHeight } from '@/engine/terrain/HeightFieldCpu'

const RES = 256

export function S2Check() {
  const [results, setResults] = useState<CompareResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cpuNs, setCpuNs] = useState<number | null>(null)
  const cpuCanvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let disposed = false

    void (async () => {
      const THREE = await import('three/webgpu')
      const { runGoldenHeightCheck } = await import('@/engine/debug/goldenHeightCheck')
      if (disposed) return

      const renderer = new THREE.WebGPURenderer({ antialias: false })
      await renderer.init()
      if (disposed) return renderer.dispose()

      const spec = KAMAKURA_BAY
      const report = await runGoldenHeightCheck(renderer, spec, RES)
      const out = report.rungs

      if (disposed) return renderer.dispose()
      setResults(out)
      renderer.dispose()

      const N = 200_000
      const t0 = performance.now()
      let sink = 0
      for (let i = 0; i < N; i++) {
        sink += sampleHeight(spec, (i % 601) - 300, ((i * 7) % 601) - 300)
      }
      const t1 = performance.now()
      if (sink === Infinity) console.log('unreachable')
      setCpuNs(((t1 - t0) / N) * 1e6)

      drawHeightmap(cpuCanvas.current, spec.halfExtentM)
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))

    return () => {
      disposed = true
    }
  }, [])

  const allPassed = results.length > 0 && results.every((r) => r.passed)

  return (
    <main className="min-h-dvh p-8">
      <h1 className="mb-1 text-lg font-medium">S2 · CPU/GPU height parity</h1>
      <p className="text-glass-muted mb-6 text-sm">
        Gates the collision design. If the two evaluators cannot agree, the character cannot stand
        on GPU-generated terrain without readback.
      </p>

      <div className="flex flex-wrap items-start gap-6">
        <div className="glass w-[34rem] p-5 text-xs">
          {error ? (
            <p className="text-red-300">{error}</p>
          ) : results.length ? (
            <>
              <p
                className={`mb-4 text-sm font-medium ${allPassed ? 'text-emerald-300' : 'text-red-300'}`}
              >
                {allPassed ? 'ALL RUNGS PASSED' : 'DIVERGENCE — see the first failing rung'}
              </p>
              <table className="w-full font-mono text-[11px]">
                <thead className="text-glass-muted">
                  <tr>
                    <th className="text-left font-normal">rung</th>
                    <th className="text-right font-normal">max err</th>
                    <th className="text-right font-normal">tol</th>
                    <th className="text-right font-normal">gpu range</th>
                    <th className="text-right font-normal">str</th>
                    <th className="text-right font-normal">flip</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.label} className={r.passed ? 'text-emerald-300' : 'text-red-300'}>
                      <td className="py-0.5 pr-2 text-left">{r.label}</td>
                      <td className="text-right">{r.maxAbsError.toExponential(2)}</td>
                      <td className="text-glass-muted text-right">
                        {r.tolerance.toExponential(0)}
                      </td>
                      <td className="text-glass-muted text-right">
                        {fmt(r.gpuMin)}…{fmt(r.gpuMax)}
                      </td>
                      <td className="text-glass-muted text-right">{r.stride}</td>
                      <td className="text-glass-muted text-right">{r.flipYNeeded ? 'Y' : '·'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-glass-muted mt-3">
                cpu sample: {cpuNs === null ? '…' : `${cpuNs.toFixed(0)} ns`}
              </p>
            </>
          ) : (
            <p className="text-glass-faint">baking and diffing…</p>
          )}
        </div>

        <div className="glass p-5">
          <p className="text-glass-muted mb-3 text-xs">CPU evaluator · Kamakura Bay</p>
          <canvas
            ref={cpuCanvas}
            width={RES}
            height={RES}
            className="border-glass-edge rounded border"
            style={{ imageRendering: 'pixelated', width: 256, height: 256 }}
          />
        </div>
      </div>
    </main>
  )
}

const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—')

/** Eyeball check: numbers can agree on garbage, but an island should look like one. */
function drawHeightmap(canvas: HTMLCanvasElement | null, half: number) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const img = ctx.createImageData(RES, RES)
  const heights = new Float32Array(RES * RES)
  let lo = Infinity
  let hi = -Infinity

  for (let y = 0; y < RES; y++) {
    for (let x = 0; x < RES; x++) {
      const wx = ((x + 0.5) / RES) * 2 * half - half
      const wz = ((y + 0.5) / RES) * 2 * half - half
      const h = sampleHeight(KAMAKURA_BAY, wx, wz)
      heights[y * RES + x] = h
      if (h < lo) lo = h
      if (h > hi) hi = h
    }
  }

  for (let i = 0; i < heights.length; i++) {
    const h = heights[i]!
    const t = (h - lo) / (hi - lo || 1)
    const underwater = h < KAMAKURA_BAY.seaLevelM
    img.data[i * 4] = underwater ? 30 : 90 + t * 165
    img.data[i * 4 + 1] = underwater ? 70 + t * 60 : 100 + t * 140
    img.data[i * 4 + 2] = underwater ? 120 + t * 90 : 80 + t * 120
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}
