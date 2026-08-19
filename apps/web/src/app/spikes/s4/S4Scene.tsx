'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Behind the panels: a deliberately hostile backdrop — a fine high-frequency
 * checkerboard split into a blown-out bright half and a near-black half. Blur is a
 * low-pass filter, so a working `backdrop-filter` must visibly smooth the checks; and
 * the two halves show whether the panel stays legible over *both* extremes, which is
 * the actual hard problem (blur removes detail but preserves mean luminance).
 */
export function S4Scene() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let cleanup: (() => void) | null = null

    void (async () => {
      const THREE = await import('three/webgpu')
      const { Fn, uv, vec4, floor, float, select } = await import('three/tsl')
      if (disposed) return

      const size = await waitForSize(host)
      if (disposed || !size) return

      const renderer = new THREE.WebGPURenderer({ antialias: false })
      renderer.setPixelRatio(1)
      renderer.setSize(size.width, size.height)
      host.appendChild(renderer.domElement)
      await renderer.init()
      if (disposed) return renderer.dispose()

      const material = new THREE.NodeMaterial()
      material.fragmentNode = Fn(() => {
        const q = uv()
        const CHECK = 90 // fine enough that any blur is unmistakable
        const cx = floor(q.x.mul(CHECK))
        const cy = floor(q.y.mul(CHECK * 0.56))
        const odd = cx.add(cy).mod(2)
        // Left half: bright (mean L ~0.85). Right half: dark (mean L ~0.06).
        const bright = select(odd.equal(0), float(1.0), float(0.72))
        const dark = select(odd.equal(0), float(0.1), float(0.02))
        const v = select(q.x.lessThan(0.5), bright, dark)
        return vec4(v, v.mul(0.97), v.mul(0.9), 1)
      })()

      const quad = new THREE.QuadMesh(material)
      const draw = () => quad.render(renderer)
      draw()

      const ro = new ResizeObserver(([entry]) => {
        const w = Math.floor(entry?.contentRect.width ?? 0)
        const h = Math.floor(entry?.contentRect.height ?? 0)
        if (w === 0 || h === 0) return
        renderer.setSize(w, h)
        draw()
      })
      ro.observe(host)

      setReady(true)
      cleanup = () => {
        ro.disconnect()
        renderer.dispose()
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
    <div className="relative min-h-dvh w-full overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" />

      {error && <p className="glass absolute top-4 left-4 p-3 text-xs text-red-300">{error}</p>}

      {/* Panels straddle the bright/dark boundary on purpose. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
        <Panel
          label="A · no backdrop-filter (control)"
          className="border border-white/15 bg-white/10"
        />
        <Panel
          label="B · blur only"
          className="border border-white/15 bg-white/10 backdrop-blur-[26px]"
        />
        <Panel label="C · full glass utility" className="glass" />
      </div>

      <p className="text-glass-faint absolute bottom-4 left-4 text-[11px]">
        {ready ? 'canvas live · compare check sharpness inside each panel' : 'starting…'}
      </p>
    </div>
  )
}

function Panel({ label, className }: { label: string; className: string }) {
  return (
    <div className={`w-[52rem] rounded-2xl px-6 py-5 ${className}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs opacity-80">
        Body text at 12px over the same backdrop — legible on both halves?
      </p>
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
