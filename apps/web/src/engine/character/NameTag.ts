import * as THREE from 'three/webgpu'

/**
 * A billboarded name label floating above an avatar or companion pet — `THREE.Sprite`
 * always faces the camera on its own, so no per-frame look-at code is needed here.
 *
 * Text is rasterised to a `CanvasTexture` using modern cozy Thai-friendly typography.
 */
const DEFAULT_FONT_PX = 36
const PADDING_X_PX = 24
const CANVAS_HEIGHT_PX = 56
const DEFAULT_WORLD_HEIGHT_M = 0.26

function getFont(fontPx = DEFAULT_FONT_PX): string {
  return `600 ${fontPx}px "Quicksand", "Plus Jakarta Sans", "Sukhumvit Set", "Noto Sans Thai", "Thonburi", -apple-system, system-ui, sans-serif`
}

export interface NameTagConfig {
  worldHeightM?: number
  fontPx?: number
  paddingXPx?: number
  bgColor?: string
  textColor?: string
}

export class NameTag {
  readonly sprite: THREE.Sprite
  #texture: THREE.CanvasTexture
  #material: THREE.SpriteMaterial
  #canvas: HTMLCanvasElement
  #worldHeightM: number
  #fontPx: number
  #paddingXPx: number
  #bgColor: string
  #textColor: string

  constructor(name: string, config?: NameTagConfig) {
    this.#worldHeightM = config?.worldHeightM ?? DEFAULT_WORLD_HEIGHT_M
    this.#fontPx = config?.fontPx ?? DEFAULT_FONT_PX
    this.#paddingXPx = config?.paddingXPx ?? PADDING_X_PX
    this.#bgColor = config?.bgColor ?? 'rgba(15, 20, 32, 0.50)'
    this.#textColor = config?.textColor ?? '#ffffff'

    this.#canvas = document.createElement('canvas')
    this.#canvas.height = CANVAS_HEIGHT_PX
    this.#texture = new THREE.CanvasTexture(this.#canvas)
    this.#texture.colorSpace = THREE.SRGBColorSpace
    this.#texture.minFilter = THREE.LinearFilter
    this.#texture.magFilter = THREE.LinearFilter

    this.#material = new THREE.SpriteMaterial({
      map: this.#texture,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    })
    this.sprite = new THREE.Sprite(this.#material)
    this.setName(name)
  }

  /** Re-rasterises the label */
  setName(name: string): void {
    const measureCtx = this.#canvas.getContext('2d')
    if (!measureCtx) return
    measureCtx.font = getFont(this.#fontPx)
    const textWidthPx = measureCtx.measureText(name).width

    this.#canvas.width = Math.max(64, Math.ceil(textWidthPx + this.#paddingXPx * 2))
    const ctx = this.#canvas.getContext('2d')
    if (!ctx) return

    ctx.font = getFont(this.#fontPx)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    const w = this.#canvas.width
    const h = this.#canvas.height

    // Glass pill background
    ctx.fillStyle = this.#bgColor
    ctx.beginPath()
    ctx.roundRect(0, 0, w, h, h / 2)
    ctx.fill()

    // Subtle border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(1, 1, w - 2, h - 2, (h - 2) / 2)
    ctx.stroke()

    // Text with soft shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 1
    ctx.fillStyle = this.#textColor
    ctx.fillText(name, w / 2, h / 2 + 1)

    this.#texture.needsUpdate = true
    const aspect = w / h
    this.sprite.scale.set(this.#worldHeightM * aspect, this.#worldHeightM, 1)
  }

  dispose(): void {
    this.#texture.dispose()
    this.#material.dispose()
  }
}
