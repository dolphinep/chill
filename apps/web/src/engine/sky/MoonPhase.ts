import * as THREE from 'three/webgpu'
import * as Astronomy from 'astronomy-engine'

export interface MoonPhaseInfo {
  phaseDeg: number
  phaseFraction: number
  phaseName: string
  phaseNameEn: string
  moonAgeDays: number
  waxing: boolean
}

/**
 * Returns astronomical Moon phase details for any given Date using `astronomy-engine`.
 */
export function getMoonPhaseInfo(date: Date): MoonPhaseInfo {
  const phaseDeg = Astronomy.MoonPhase(date)
  const illum = Astronomy.Illumination(Astronomy.Body.Moon, date)
  const fraction = illum.phase_fraction
  const synodicMonthDays = 29.53058770576
  const moonAgeDays = (phaseDeg / 360) * synodicMonthDays
  const waxing = phaseDeg < 180

  let phaseName = ''
  let phaseNameEn = ''

  if (phaseDeg < 15 || phaseDeg >= 345) {
    phaseName = 'จันทร์ดับ / แรม 15 ค่ำ'
    phaseNameEn = 'New Moon'
  } else if (phaseDeg < 75) {
    const kram = Math.round((phaseDeg / 180) * 15)
    phaseName = `ข้างขึ้น ${kram} ค่ำ (เสี้ยว)`
    phaseNameEn = 'Waxing Crescent'
  } else if (phaseDeg < 105) {
    phaseName = 'ข้างขึ้น 8 ค่ำ (ครึ่งดวงแรก)'
    phaseNameEn = 'First Quarter'
  } else if (phaseDeg < 165) {
    const kram = Math.round((phaseDeg / 180) * 15)
    phaseName = `ข้างขึ้น ${kram} ค่ำ (ค่อนดวง)`
    phaseNameEn = 'Waxing Gibbous'
  } else if (phaseDeg < 195) {
    phaseName = 'วันเพ็ญ 15 ค่ำ (จันทร์เต็มดวง)'
    phaseNameEn = 'Full Moon'
  } else if (phaseDeg < 255) {
    const kram = Math.round(((360 - phaseDeg) / 180) * 15)
    phaseName = `ข้างแรม ${kram} ค่ำ (ค่อนดวง)`
    phaseNameEn = 'Waning Gibbous'
  } else if (phaseDeg < 285) {
    phaseName = 'ข้างแรม 8 ค่ำ (ครึ่งดวงหลัง)'
    phaseNameEn = 'Last Quarter'
  } else {
    const kram = Math.round(((360 - phaseDeg) / 180) * 15)
    phaseName = `ข้างแรม ${kram} ค่ำ (เสี้ยว)`
    phaseNameEn = 'Waning Crescent'
  }

  return {
    phaseDeg,
    phaseFraction: fraction,
    phaseName,
    phaseNameEn,
    moonAgeDays,
    waxing,
  }
}

/**
 * Procedurally generates a pure luminous silhouette of celestial light according to the real moon phase.
 * No surface texture, craters, or noise — purely glowing, ethereal light.
 */
function renderLunarCanvas(canvas: HTMLCanvasElement, phaseDeg: number): void {
  const size = canvas.width
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, size, size)

  const radius = size * 0.44
  const cx = size / 2
  const cy = size / 2

  const phi = (phaseDeg * Math.PI) / 180
  const Lx = Math.sin(phi)
  const Lz = -Math.cos(phi)

  const imgData = ctx.createImageData(size, size)
  const data = imgData.data

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = (px - cx) / radius
      const dy = (py - cy) / radius
      const rSq = dx * dx + dy * dy

      if (rSq > 1.0) continue // Outside moon boundary

      const r = Math.sqrt(rSq)
      const nz = Math.sqrt(1.0 - rSq)

      // Direct solar illumination on sphere normal (N · L)
      const nDotL = dx * Lx + nz * Lz

      // Smooth terminator transition for pure light
      const litFactor = Math.max(0, Math.min(1, (nDotL + 0.03) / 0.06))

      if (litFactor <= 0) continue

      // Edge antialiasing for crisp smooth circular boundary
      let edgeAlpha = 1.0
      if (r > 0.95) {
        edgeAlpha = Math.max(0, (1.0 - r) / 0.05)
      }

      const alpha = litFactor * edgeAlpha

      const idx = (py * size + px) * 4

      // Pure glowing celestial white light (#f8fafc / #ffffff)
      data[idx] = 250 // R
      data[idx + 1] = 252 // G
      data[idx + 2] = 255 // B
      data[idx + 3] = Math.round(alpha * 255)
    }
  }

  ctx.putImageData(imgData, 0, 0)
}

export class RealisticMoon {
  readonly group = new THREE.Group()

  #canvas: HTMLCanvasElement
  #texture: THREE.CanvasTexture
  #moonMesh: THREE.Mesh
  #haloSprite: THREE.Sprite
  #haloMat: THREE.SpriteMaterial
  #date: Date

  constructor(date: Date = new Date()) {
    this.#date = date

    // 1. Pure Luminous Moon Phase Mesh
    this.#canvas = document.createElement('canvas')
    this.#canvas.width = 512
    this.#canvas.height = 512

    this.#texture = new THREE.CanvasTexture(this.#canvas)
    this.#texture.colorSpace = THREE.SRGBColorSpace

    const geo = new THREE.PlaneGeometry(80, 80)
    const mat = new THREE.MeshBasicMaterial({
      map: this.#texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    })
    this.#moonMesh = new THREE.Mesh(geo, mat)
    this.#moonMesh.renderOrder = -88
    this.group.add(this.#moonMesh)

    // 2. Original Ethereal Celestial Halo (Silver-Blue Atmospheric Glow)
    const haloCanvas = document.createElement('canvas')
    haloCanvas.width = 128
    haloCanvas.height = 128
    const haloCtx = haloCanvas.getContext('2d')
    if (haloCtx) {
      const grad = haloCtx.createRadialGradient(64, 64, 0, 64, 64, 64)
      grad.addColorStop(0, 'rgba(248, 250, 252, 0.95)')
      grad.addColorStop(0.28, 'rgba(186, 230, 253, 0.45)')
      grad.addColorStop(0.68, 'rgba(56, 189, 248, 0.12)')
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      haloCtx.fillStyle = grad
      haloCtx.fillRect(0, 0, 128, 128)
    }
    const haloTex = new THREE.CanvasTexture(haloCanvas)
    this.#haloMat = new THREE.SpriteMaterial({
      map: haloTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    })
    this.#haloSprite = new THREE.Sprite(this.#haloMat)
    this.#haloSprite.position.set(0, 0, -2)
    this.group.add(this.#haloSprite)

    this.group.renderOrder = -90
    this.setDate(date)
  }

  get phaseInfo(): MoonPhaseInfo {
    return getMoonPhaseInfo(this.#date)
  }

  setDate(date: Date): void {
    this.#date = date
    const info = this.phaseInfo

    // Re-render pure glowing light canvas matching astronomical phase
    renderLunarCanvas(this.#canvas, info.phaseDeg)
    this.#texture.needsUpdate = true

    // Dynamic Halo scaling & opacity matching illumination fraction
    const haloScale = 150 + info.phaseFraction * 50
    this.#haloSprite.scale.set(haloScale, haloScale, 1)
    this.#haloMat.opacity = Math.max(0.35, info.phaseFraction * 0.95)
  }

  dispose(): void {
    this.#moonMesh.geometry.dispose()
    ;(this.#moonMesh.material as THREE.Material).dispose()
    this.#texture.dispose()
    this.#haloSprite.geometry.dispose()
    this.#haloMat.dispose()
  }
}
