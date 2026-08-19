import * as THREE from 'three/webgpu'
import type { EyeStyle } from '@/lib/avatar/avatarConfig'

export interface ChibiFaceStyle {
  eyeStyle: EyeStyle
  eyeColor: string
  skinTone: string
}

/**
 * Procedural 1024x512 Canvas Face Texture mapped seamlessly onto the Head Sphere.
 * Front of Sphere in Three.js SphereGeometry (+Z) is at UV u = 0.25 (X = 256).
 */
export class ChibiFaceTexture {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly texture: THREE.CanvasTexture

  #style: ChibiFaceStyle
  #blinkTimer = 3.5
  #blinkProgress = 0 // 0 = open, 1 = fully closed
  #isBlinking = false
  #doubleBlink = false
  #needsRedraw = true

  constructor(initialStyle: ChibiFaceStyle) {
    this.#style = { ...initialStyle }

    this.canvas = document.createElement('canvas')
    this.canvas.width = 1024
    this.canvas.height = 512
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2d context for face canvas')
    this.ctx = ctx

    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.generateMipmaps = true
    this.texture.minFilter = THREE.LinearMipmapLinearFilter
    this.texture.magFilter = THREE.LinearFilter

    this.redraw()
  }

  setStyle(patch: Partial<ChibiFaceStyle>): void {
    let changed = false
    if (patch.eyeStyle && patch.eyeStyle !== this.#style.eyeStyle) {
      this.#style.eyeStyle = patch.eyeStyle
      changed = true
    }
    if (patch.eyeColor && patch.eyeColor !== this.#style.eyeColor) {
      this.#style.eyeColor = patch.eyeColor
      changed = true
    }
    if (patch.skinTone && patch.skinTone !== this.#style.skinTone) {
      this.#style.skinTone = patch.skinTone
      changed = true
    }
    if (changed) {
      this.#needsRedraw = true
    }
  }

  update(dt: number): void {
    // --- Natural Blinking Cycle ---
    if (!this.#isBlinking) {
      this.#blinkTimer -= dt
      if (this.#blinkTimer <= 0) {
        this.#isBlinking = true
        this.#blinkProgress = 0
        this.#doubleBlink = Math.random() < 0.28 // 28% chance of double blink
      }
    } else {
      // Blink animation speed (~0.16s total blink duration)
      this.#blinkProgress += dt * 14.0
      this.#needsRedraw = true

      if (this.#blinkProgress >= 2.0) {
        if (this.#doubleBlink) {
          this.#doubleBlink = false
          this.#blinkProgress = 0
        } else {
          this.#isBlinking = false
          this.#blinkProgress = 0
          this.#blinkTimer = 2.8 + Math.random() * 3.5 // Random interval between 2.8s - 6.3s
        }
      }
    }

    if (this.#needsRedraw) {
      this.redraw()
      this.#needsRedraw = false
    }
  }

  redraw(): void {
    const { ctx, canvas } = this
    const w = canvas.width
    const h = canvas.height

    ctx.clearRect(0, 0, w, h)

    // Fill entire sphere texture seamlessly with chosen skin tone
    ctx.fillStyle = this.#style.skinTone
    ctx.fillRect(0, 0, w, h)

    // Calculate eye openness (0 = closed, 1 = fully open)
    let openness = 1.0
    if (this.#isBlinking) {
      const phase = this.#blinkProgress <= 1.0 ? this.#blinkProgress : 2.0 - this.#blinkProgress
      openness = Math.max(0, 1.0 - phase)
    }

    // Front center of Sphere (+Z) is at X = 256 (u = 0.25)
    const faceCenterX = w * 0.25
    const eyeSpacing = 58
    const leftEyeX = faceCenterX - eyeSpacing
    const rightEyeX = faceCenterX + eyeSpacing
    const eyeY = h * 0.53
    const eyeRadius = 35

    // --- Rosy Gradient Blush on Cheeks ---
    this.#drawBlush(ctx, faceCenterX - 85, h * 0.62, 34)
    this.#drawBlush(ctx, faceCenterX + 85, h * 0.62, 34)

    // --- Draw Eyes ---
    if (this.#style.eyeStyle === 'happy') {
      this.#drawHappyEye(ctx, leftEyeX, eyeY, eyeRadius * 0.9)
      this.#drawHappyEye(ctx, rightEyeX, eyeY, eyeRadius * 0.9)
    } else if (this.#style.eyeStyle === 'wink') {
      this.#drawSparkleEye(ctx, leftEyeX, eyeY, eyeRadius, openness)
      this.#drawWinkEye(ctx, rightEyeX, eyeY, eyeRadius * 0.9)
    } else if (this.#style.eyeStyle === 'dot') {
      this.#drawDotEye(ctx, leftEyeX, eyeY, 16, openness)
      this.#drawDotEye(ctx, rightEyeX, eyeY, 16, openness)
    } else {
      // Default: Anime Sparkle Eyes
      this.#drawSparkleEye(ctx, leftEyeX, eyeY, eyeRadius, openness)
      this.#drawSparkleEye(ctx, rightEyeX, eyeY, eyeRadius, openness)
    }

    // --- Cute Petite Smile ---
    this.#drawMouth(ctx, faceCenterX, h * 0.70)

    this.texture.needsUpdate = true
  }

  #drawBlush(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
    ctx.save()
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
    grad.addColorStop(0, 'rgba(255, 95, 130, 0.40)')
    grad.addColorStop(0.6, 'rgba(255, 120, 150, 0.18)')
    grad.addColorStop(1, 'rgba(255, 140, 160, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  #drawSparkleEye(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    openness: number,
  ): void {
    ctx.save()
    ctx.translate(x, y)

    if (openness <= 0.08) {
      // Closed eye curve with cute eyelashes
      ctx.strokeStyle = '#1e1e24'
      ctx.lineWidth = 6.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(0, 0, radius * 0.65, 0.2 * Math.PI, 0.8 * Math.PI, false)
      ctx.stroke()
      ctx.restore()
      return
    }

    ctx.scale(1.0, openness)

    // Outer Eye Shape / Sclera Base
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(0, 0, radius * 0.85, radius * 1.05, 0, 0, Math.PI * 2)
    ctx.fill()

    // Iris Gradient (Dark at top -> Vibrant chosen color -> Warm highlight at bottom)
    const irisGrad = ctx.createLinearGradient(0, -radius, 0, radius)
    irisGrad.addColorStop(0, '#0f172a')
    irisGrad.addColorStop(0.45, this.#style.eyeColor)
    irisGrad.addColorStop(1, '#ffffff')

    ctx.fillStyle = irisGrad
    ctx.beginPath()
    ctx.ellipse(0, 2, radius * 0.72, radius * 0.95, 0, 0, Math.PI * 2)
    ctx.fill()

    // Pupil (Deep center shadow)
    ctx.fillStyle = '#090d16'
    ctx.beginPath()
    ctx.ellipse(0, 0, radius * 0.38, radius * 0.52, 0, 0, Math.PI * 2)
    ctx.fill()

    // Primary Highlight Sparkle (Top-Right)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
    ctx.beginPath()
    ctx.ellipse(radius * 0.28, -radius * 0.35, radius * 0.28, radius * 0.28, 0, 0, Math.PI * 2)
    ctx.fill()

    // Secondary Micro-Sparkle (Bottom-Left)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.80)'
    ctx.beginPath()
    ctx.ellipse(-radius * 0.24, radius * 0.38, radius * 0.16, radius * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()

    // Upper Eyelash / Anime Arch
    ctx.strokeStyle = '#1e1b4b'
    ctx.lineWidth = 6.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(0, -2, radius * 0.88, 1.15 * Math.PI, 1.85 * Math.PI, false)
    ctx.stroke()

    // Tiny delicate side lash flick
    ctx.beginPath()
    ctx.moveTo(radius * 0.72, -radius * 0.35)
    ctx.lineTo(radius * 0.98, -radius * 0.58)
    ctx.stroke()

    ctx.restore()
  }

  #drawHappyEye(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
    ctx.save()
    ctx.translate(x, y)
    ctx.strokeStyle = '#1e1b4b'
    ctx.lineWidth = 7.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(0, 4, radius * 0.75, 1.15 * Math.PI, 1.85 * Math.PI, false)
    ctx.stroke()
    ctx.restore()
  }

  #drawWinkEye(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
    ctx.save()
    ctx.translate(x, y)
    ctx.strokeStyle = '#1e1b4b'
    ctx.lineWidth = 7.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-radius * 0.75, 4)
    ctx.lineTo(0, -5)
    ctx.lineTo(radius * 0.75, 4)
    ctx.stroke()

    // Cute star sparkle near wink
    ctx.fillStyle = '#f59e0b'
    this.#drawMiniStar(ctx, radius * 0.95, -radius * 0.5, 8)
    ctx.restore()
  }

  #drawDotEye(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    openness: number,
  ): void {
    ctx.save()
    ctx.translate(x, y)
    if (openness <= 0.1) {
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-radius, 0)
      ctx.lineTo(radius, 0)
      ctx.stroke()
    } else {
      ctx.scale(1.0, openness)
      ctx.fillStyle = '#1e293b'
      ctx.beginPath()
      ctx.ellipse(0, 0, radius, radius * 1.25, 0, 0, Math.PI * 2)
      ctx.fill()

      // Small upper shine
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(radius * 0.3, -radius * 0.35, radius * 0.35, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  #drawMiniStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.beginPath()
    for (let i = 0; i < 4; i++) {
      ctx.lineTo(Math.cos(((18 + i * 90) * Math.PI) / 180) * r, -Math.sin(((18 + i * 90) * Math.PI) / 180) * r)
      ctx.lineTo(Math.cos(((63 + i * 90) * Math.PI) / 180) * (r * 0.4), -Math.sin(((63 + i * 90) * Math.PI) / 180) * (r * 0.4))
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  #drawMouth(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save()
    ctx.translate(x, y)
    ctx.strokeStyle = '#991b1b'
    ctx.fillStyle = '#f87171'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(0, 0, 12, 0.1 * Math.PI, 0.9 * Math.PI, false)
    ctx.stroke()
    ctx.restore()
  }

  dispose(): void {
    this.texture.dispose()
  }
}
