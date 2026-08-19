'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  AVATAR_PRESETS,
  type AccessoryStyle,
  type ChibiAvatarConfig,
  type EyeStyle,
  type HairStyle,
  type OutfitStyle,
} from '@/lib/avatar/avatarConfig'
import { useAvatarConfig, updateAvatarConfig } from '@/lib/avatar/avatarStore'
import { ChibiAvatarMesh } from '@/engine/character/ChibiAvatarMesh'
import { ChibiAnimator } from '@/engine/character/ChibiAnimator'
import type { EngineCommand } from '@/engine/core/Engine'

interface ChibiCustomizerModalProps {
  isOpen: boolean
  onClose: () => void
  command?: (cmd: EngineCommand) => void
}

type TabType = 'presets' | 'hair' | 'outfit' | 'accessories'

const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'bald', label: 'Bald / Shaved' },
  { id: 'bob', label: 'Classic Bob' },
  { id: 'spiky', label: 'Spiky Anime' },
  { id: 'bun', label: 'Top Bun' },
  { id: 'double-buns', label: 'Double Buns' },
  { id: 'ponytail', label: 'High Ponytail' },
  { id: 'curly', label: 'Curly Waves' },
  { id: 'floppy', label: 'Floppy Soft' },
]

const EYE_STYLES: { id: EyeStyle; label: string }[] = [
  { id: 'happy', label: 'Happy ^_^' },
  { id: 'anime', label: 'Anime Sparkle' },
  { id: 'wink', label: 'Wink ;)' },
  { id: 'dot', label: 'Minimal Dot' },
]

const OUTFIT_STYLES: { id: OutfitStyle; label: string }[] = [
  { id: 'cozy-hoodie', label: 'Cozy Hoodie' },
  { id: 'beach-robe', label: 'Beach Robe' },
  { id: 'sailor-tee', label: 'Sailor Tee' },
  { id: 'winter-coat', label: 'Winter Coat' },
  { id: 'monk-robe', label: 'Zen Monk Robe' },
]

const ACCESSORY_STYLES: { id: AccessoryStyle; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'cat-ears', label: 'Cat Ears' },
  { id: 'bunny-ears', label: 'Bunny Ears' },
  { id: 'glasses', label: 'Glasses' },
  { id: 'straw-hat', label: 'Straw Hat' },
  { id: 'beret', label: 'French Beret' },
  { id: 'headphones', label: 'DJ Headphones' },
  { id: 'scarf', label: 'Warm Scarf' },
  { id: 'backpack', label: 'Traveler Backpack' },
  { id: 'angel-wings', label: 'Angel Wings' },
]

const COLOR_SWATCHES = [
  '#ff7b9c', '#f72585', '#7209b7', '#3f37c9', '#4361ee',
  '#4895ef', '#560bad', '#06b6d4', '#10b981', '#84cc16',
  '#eab308', '#f97316', '#ef4444', '#475569', '#1e293b',
]

const EYE_SWATCHES = [
  '#2b2d42', '#0284c7', '#ec4899', '#10b981', '#7209b7', '#eab308', '#ef4444', '#475569',
]

const SKIN_SWATCHES = [
  '#ffdfc4', '#f3c4a5', '#e0ac69', '#c68642', '#8d5524',
]

function ColorSection({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string
  value: string
  swatches: string[]
  onChange: (color: string) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-white/70">{label}</label>
        <div className="flex items-center gap-1.5 bg-white/10 px-2 py-0.5 rounded-md border border-white/15 hover:bg-white/20 transition">
          <input
            type="color"
            value={value.startsWith('#') ? value : '#ffffff'}
            onChange={(e) => onChange(e.target.value)}
            className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
            title="Custom Color Wheel"
          />
          <span className="text-[10px] font-mono text-white/80 uppercase">{value}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {swatches.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            style={{ backgroundColor: color }}
            className={`h-6 w-6 rounded-full border-2 transition ${
              value === color ? 'border-white scale-110 shadow' : 'border-transparent hover:scale-105'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

export function StudioPreview({ config }: { config: ChibiAvatarConfig }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<ChibiAvatarMesh | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const width = container.clientWidth || 280
    const height = container.clientHeight || 360

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 10)
    camera.position.set(0, 0.65, 2.2)
    camera.lookAt(0, 0.55, 0)

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4)
    scene.add(ambientLight)

    const mainLight = new THREE.DirectionalLight(0xffffff, 2.2)
    mainLight.position.set(2, 4, 3)
    scene.add(mainLight)

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.2)
    rimLight.position.set(-2, 2, -2)
    scene.add(rimLight)

    // Avatar Instance
    const avatar = new ChibiAvatarMesh(config)
    avatar.group.position.set(0, 0.0, 0)
    scene.add(avatar.group)
    avatarRef.current = avatar

    const animator = new ChibiAnimator()
    let frameId: number
    let isDragging = false
    let prevX = 0

    const dom = renderer.domElement
    dom.style.touchAction = 'none'
    dom.style.width = '100%'
    dom.style.height = '100%'

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true
      prevX = e.clientX
      try {
        dom.setPointerCapture(e.pointerId)
      } catch {}
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return
      const deltaX = e.clientX - prevX
      avatar.group.rotation.y += deltaX * 0.015
      prevX = e.clientX
    }
    const onPointerUp = (e: PointerEvent) => {
      isDragging = false
      try {
        dom.releasePointerCapture(e.pointerId)
      } catch {}
    }

    dom.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)

    let clock = 0
    const animate = () => {
      clock += 0.016
      animator.update(avatar.rig, 'stand', 0, 0.016, clock)
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      dom.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      if (container.contains(dom)) container.removeChild(dom)
      avatar.dispose()
      renderer.dispose()
    }
    // Mount-only by design: this builds the scene/renderer once with whatever `config`
    // is at mount, and the effect below patches later changes via `updateConfig` —
    // adding `config` here would tear down and rebuild the whole THREE.js scene on
    // every color/style pick instead of patching it in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (avatarRef.current) {
      avatarRef.current.updateConfig(config)
    }
  }, [config])

  return (
    <div className="relative w-full h-full rounded-2xl bg-white/5 border border-white/15 overflow-hidden flex flex-col items-center justify-center backdrop-blur-md select-none touch-none">
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[10px] text-white/70 tracking-wider font-mono pointer-events-none select-none">
        DRAG TO ROTATE
      </div>
    </div>
  )
}

/** Pure — no store/engine dependency — so both the real modal's "Random" button and
 * the manual page's standalone demo can generate a random look the same way. */
export function randomizeAvatarConfig(): Partial<ChibiAvatarConfig> {
  const randomItem = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!
  const randomColor = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')

  const hairStyles: HairStyle[] = ['bald', 'bob', 'spiky', 'bun', 'double-buns', 'ponytail', 'curly', 'floppy']
  const eyeStyles: EyeStyle[] = ['happy', 'anime', 'wink', 'dot']
  const outfitStyles: OutfitStyle[] = ['cozy-hoodie', 'beach-robe', 'sailor-tee', 'winter-coat', 'monk-robe']
  const accessoryStyles: AccessoryStyle[] = ['none', 'cat-ears', 'bunny-ears', 'glasses', 'straw-hat', 'scarf', 'beret', 'headphones', 'backpack', 'angel-wings']

  return {
    hairStyle: randomItem(hairStyles),
    hairColor: randomItem(COLOR_SWATCHES),
    skinTone: randomItem(SKIN_SWATCHES),
    eyeStyle: randomItem(eyeStyles),
    eyeColor: randomItem(EYE_SWATCHES),
    outfitStyle: randomItem(outfitStyles),
    outfitColor: randomColor(),
    pantsColor: randomColor(),
    shoesColor: randomColor(),
    accessory: randomItem(accessoryStyles),
    accessoryColor: randomColor(),
  }
}

/**
 * The 3D viewport + tabbed controls — everything a caller needs to let someone
 * actually customize a chibi avatar, minus the modal chrome (header, copy/import,
 * close). Deliberately takes `config`/`onChange` rather than reaching for the global
 * avatar store itself, so it can be reused somewhere that must NOT touch the
 * player's real saved profile — e.g. the public manual page's demo, which persists
 * to the exact same `localStorage` key (`chill_chibi_avatar_config`) the live game
 * boots from; wiring that demo to the store would silently overwrite a visitor's
 * actual character the moment they clicked a preset.
 */
export function AvatarStudioPanel({
  config,
  onChange,
}: {
  config: ChibiAvatarConfig
  onChange: (patch: Partial<ChibiAvatarConfig>) => void
}) {
  const [activeTab, setActiveTab] = useState<TabType>('presets')

  return (
    <div className="grid h-105 grid-cols-1 gap-6 md:grid-cols-12">
      {/* Left Column: 3D Live Studio Viewport */}
      <div className="md:col-span-5 h-full">
        <StudioPreview config={config} />
      </div>

      {/* Right Column: Customization Controls */}
      <div className="md:col-span-7 flex flex-col h-full overflow-hidden">
        {/* Tabs */}
        <div className="flex gap-1.5 p-1 rounded-xl bg-white/5 border border-white/10 mb-4">
          {(
            [
              { id: 'presets', label: 'Presets' },
              { id: 'hair', label: 'Hair & Face' },
              { id: 'outfit', label: 'Outfit' },
              { id: 'accessories', label: 'Accessories' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white/20 text-white shadow-md'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Control Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-5 custom-scrollbar">
          {/* Presets Tab */}
          {activeTab === 'presets' && (
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(AVATAR_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => onChange(preset.config)}
                  className="flex flex-col p-3.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 transition-all text-left group"
                >
                  <div className="font-semibold text-sm text-white/90 group-hover:text-white">
                    {preset.name}
                  </div>
                  <div className="text-[11px] text-white/50 mt-1 capitalize">
                    {preset.config.hairStyle} • {preset.config.outfitStyle}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Hair & Face Tab */}
          {activeTab === 'hair' && (
            <div className="space-y-4">
              {/* Hair Style */}
              <div>
                <label className="text-xs font-medium text-white/70 block mb-2">Hair Style</label>
                <div className="grid grid-cols-4 gap-2">
                  {HAIR_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => onChange({ hairStyle: style.id })}
                      className={`py-2 px-2 text-[11px] rounded-lg border transition text-center ${
                        config.hairStyle === style.id
                          ? 'border-sky-400 bg-sky-500/20 text-white font-medium'
                          : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hair Color with Wheel */}
              <ColorSection
                label="Hair Color"
                value={config.hairColor}
                swatches={COLOR_SWATCHES}
                onChange={(color) => onChange({ hairColor: color })}
              />

              {/* Skin Tone with Wheel */}
              <ColorSection
                label="Skin Tone"
                value={config.skinTone}
                swatches={SKIN_SWATCHES}
                onChange={(color) => onChange({ skinTone: color })}
              />

              {/* Eye Style */}
              <div>
                <label className="text-xs font-medium text-white/70 block mb-2">Eye Expression</label>
                <div className="grid grid-cols-2 gap-2">
                  {EYE_STYLES.map((eye) => (
                    <button
                      key={eye.id}
                      onClick={() => onChange({ eyeStyle: eye.id })}
                      className={`py-2 px-3 text-xs rounded-lg border transition ${
                        config.eyeStyle === eye.id
                          ? 'border-sky-400 bg-sky-500/20 text-white font-medium'
                          : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {eye.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Eye Color with Wheel */}
              <ColorSection
                label="Eye Color"
                value={config.eyeColor}
                swatches={EYE_SWATCHES}
                onChange={(color) => onChange({ eyeColor: color })}
              />
            </div>
          )}

          {/* Outfit Tab */}
          {activeTab === 'outfit' && (
            <div className="space-y-4">
              {/* Outfit Style */}
              <div>
                <label className="text-xs font-medium text-white/70 block mb-2">Top Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {OUTFIT_STYLES.map((outfit) => (
                    <button
                      key={outfit.id}
                      onClick={() => onChange({ outfitStyle: outfit.id })}
                      className={`py-2 px-3 text-xs rounded-lg border transition ${
                        config.outfitStyle === outfit.id
                          ? 'border-sky-400 bg-sky-500/20 text-white font-medium'
                          : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {outfit.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Outfit Color with Wheel */}
              <ColorSection
                label="Top Color"
                value={config.outfitColor}
                swatches={COLOR_SWATCHES}
                onChange={(color) => onChange({ outfitColor: color })}
              />

              {/* Pants Color with Wheel */}
              <ColorSection
                label="Pants Color"
                value={config.pantsColor}
                swatches={COLOR_SWATCHES}
                onChange={(color) => onChange({ pantsColor: color })}
              />
            </div>
          )}

          {/* Accessories Tab */}
          {activeTab === 'accessories' && (
            <div className="space-y-4">
              {/* Accessory Type */}
              <div>
                <label className="text-xs font-medium text-white/70 block mb-2">Head / Body Accessory</label>
                <div className="grid grid-cols-3 gap-2">
                  {ACCESSORY_STYLES.map((acc) => (
                    <button
                      key={acc.id}
                      onClick={() => onChange({ accessory: acc.id })}
                      className={`py-2 px-3 text-xs rounded-lg border transition ${
                        config.accessory === acc.id
                          ? 'border-sky-400 bg-sky-500/20 text-white font-medium'
                          : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {acc.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accessory Color with Wheel */}
              {config.accessory !== 'none' && (
                <ColorSection
                  label="Accessory Color"
                  value={config.accessoryColor}
                  swatches={COLOR_SWATCHES}
                  onChange={(color) => onChange({ accessoryColor: color })}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ChibiCustomizerModal({ isOpen, onClose, command }: ChibiCustomizerModalProps) {
  const config = useAvatarConfig()
  const [copied, setCopied] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleUpdate = (patch: Partial<ChibiAvatarConfig>) => {
    updateAvatarConfig(patch)
    command?.({ type: 'updateAvatarConfig', config: patch })
  }

  const handleCopyStyle = () => {
    void navigator.clipboard.writeText(JSON.stringify(config, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleImportStyle = () => {
    try {
      setImportError(null)
      const parsed = JSON.parse(importText)
      if (typeof parsed === 'object' && parsed !== null) {
        handleUpdate(parsed as Partial<ChibiAvatarConfig>)
        setIsImporting(false)
        setImportText('')
      }
    } catch {
      setImportError('Invalid JSON avatar config')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 transition-all">
      <div className="glass relative w-full max-w-4xl overflow-hidden rounded-3xl border border-white/15 p-6 shadow-2xl backdrop-blur-2xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <h2 className="text-lg font-bold tracking-tight text-white/90">Avatar Studio</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyStyle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium text-white/90 hover:text-white border border-white/15 transition active:scale-95"
              title="Copy current style as JSON code"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
            <button
              onClick={() => setIsImporting(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium text-white/90 hover:text-white border border-white/15 transition active:scale-95"
              title="Import style code"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Import
            </button>
            <button
              onClick={() => handleUpdate(randomizeAvatarConfig())}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium text-white/90 hover:text-white border border-white/15 transition active:scale-95"
              title="Generate random character"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Random
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Main Content Layout: 3D Viewport on Left, Control Panel on Right */}
        <div className="mt-5">
          <AvatarStudioPanel config={config} onChange={handleUpdate} />
        </div>

        {/* Footer */}
        <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-[11px] text-white/40">Customizations saved locally in browser</span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/15 hover:bg-white/25 font-medium text-xs text-white transition active:scale-95"
          >
            Done
          </button>
        </div>

        {/* Import Dialog Overlay */}
        {isImporting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-md p-6">
            <div className="glass flex w-full max-w-md flex-col gap-3 p-5 rounded-2xl border border-white/20 text-white shadow-2xl">
              <h3 className="text-sm font-semibold text-white">Import Avatar Style Code</h3>
              <p className="text-xs text-white/60">Paste your avatar JSON style code below to apply it instantly:</p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='{"hairStyle": "bun", "hairColor": "#475569", ...}'
                className="w-full h-32 p-3 text-xs font-mono rounded-xl bg-white/10 border border-white/15 focus:outline-none focus:border-white/40 text-white placeholder-white/30 resize-none"
              />
              {importError && <p className="text-xs text-rose-400">{importError}</p>}
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIsImporting(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportStyle}
                  className="px-4 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-medium text-white transition"
                >
                  Apply Style
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
