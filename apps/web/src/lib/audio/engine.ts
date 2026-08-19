import * as THREE from 'three/webgpu'
import {
  getAudioContext,
  getAudioContextState,
  resumeAudioContext,
  subscribeAudioContextState,
} from './context'
import { buildBusGraph, type BusGraph } from './buses'
import { setFader } from './faders'
import { createGenerativeMusic, type GenerativeMusic, type LofiMood } from './generative'
import {
  AmbienceBed,
  FootstepPlayer,
  GullEmitter,
  loadBuffers,
  ShorelineEmitters,
} from './emitters'

/**
 * Ties the bus graph, generative music, ambience bed, and world emitters into one thing
 * `engine/core/Engine.ts` can own and drive every frame — the audio equivalent of
 * `SandField`. Lives under `lib/audio/`, not `engine/`, per the plan's tree (`engine/`
 * stays framework-free by convention; this module has zero React in it either way, so
 * `Engine.ts` importing it costs nothing).
 */

/** Per-scenery asset URLs — "audio: stems + bed + emitters + footstep sets" is part of
 * the plan's own `Scenery` data shape, not a fixed set of files this module owns. Empty
 * arrays are a real, supported choice: Frostholm Ridge has no shoreline and no
 * incidental wildlife sound, and passing `[]` there is simpler than a separate
 * "does this scenery even have waves" flag. */
export type SceneryAudioAssets = {
  bedUrl: string
  waveUrls: string[]
  footstepUrls: string[]
  incidentalUrls: string[]
}

/** "Ambience is tied to place" (1.5s) vs "music is emotional and should linger" (6s) —
 * different fade rates on purpose; matching them makes a scenery change feel like
 * channel-surfing. The pill's own "fades the bed in over 3s" is a distinct, slower,
 * one-time reveal — not the same number as the place-to-place crossfade. */
const BED_UNLOCK_FADE_MS = 3000
const MUSIC_UNLOCK_FADE_MS = 6000

import { ProceduralAmbience, type AmbienceType } from './proceduralAmbience'
import { loadPersistedAudioState } from './audioStore'

export type { AmbienceType }

export class AudioEngine {
  #ctx: AudioContext
  #buses: BusGraph
  #listener: THREE.AudioListener
  #music: GenerativeMusic
  #bed: AmbienceBed
  #procedural: ProceduralAmbience
  #shoreline: ShorelineEmitters
  #footsteps: FootstepPlayer
  #gulls: GullEmitter
  #unlocked = false
  #unsubscribeContextState: () => void
  #lastX = 0
  #lastZ = 0
  #hasLast = false

  #assets: SceneryAudioAssets

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    shorelinePoints: { x: number; z: number }[],
    seaLevelM: number,
    assets: SceneryAudioAssets,
  ) {
    this.#assets = assets
    this.#ctx = getAudioContext()
    this.#buses = buildBusGraph(this.#ctx)

    // Load and apply persisted audio volume settings on startup
    const persisted = loadPersistedAudioState()
    const masterVol = persisted.muted ? 0 : persisted.masterVolume
    setFader(this.#buses.master.gain, this.#ctx, masterVol, 0)
    setFader(this.#buses.musicBus.gain, this.#ctx, persisted.musicVolume, 0)
    setFader(this.#buses.ambienceBus.gain, this.#ctx, persisted.ambienceVolume, 0)

    this.#listener = new THREE.AudioListener()
    camera.add(this.#listener)

    this.#shoreline = new ShorelineEmitters(this.#listener, scene, shorelinePoints, seaLevelM)
    this.#footsteps = new FootstepPlayer(this.#ctx, this.#buses.worldBus)
    this.#gulls = new GullEmitter(this.#ctx, this.#buses.worldBus)
    this.#bed = new AmbienceBed(this.#ctx, assets.bedUrl, this.#buses.ambienceBus)
    this.#procedural = new ProceduralAmbience(this.#ctx, this.#buses.ambienceBus)
    this.#music = createGenerativeMusic(this.#ctx, this.#buses.musicBus)

    this.#music.setMood(persisted.musicMood)
    this.#procedural.setAmbience(persisted.ambiencePreset)

    // Silent until playback actually starts — never audible before a real user gesture.
    setFader(this.#buses.ambienceBus.gain, this.#ctx, 0, 0)
    setFader(this.#buses.musicBus.gain, this.#ctx, 0, 0)

    // The context can reach 'running' without ever going through `unlock()` — a
    // high-media-engagement origin, or a browser/flag with relaxed autoplay, can hand us
    // a context that's already running at construction, with no 'statechange' transition
    // to observe (there was nothing to transition from). `unlock()` covers the normal
    // gesture-gated path; this covers "it was never actually locked to begin with."
    this.#unsubscribeContextState = subscribeAudioContextState(() => this.#tryStart())
    this.#tryStart()

    void this.#loadAssets()
  }

  async #loadAssets(): Promise<void> {
    const [waves, footsteps, gulls] = await Promise.all([
      loadBuffers(this.#ctx, this.#assets.waveUrls),
      loadBuffers(this.#ctx, this.#assets.footstepUrls),
      loadBuffers(this.#ctx, this.#assets.incidentalUrls),
    ])
    this.#shoreline.setBuffers(waves)
    this.#footsteps.setBuffers(footsteps)
    this.#gulls.setBuffers(gulls)
    // Assets may finish loading after unlock() already fired (or before) — either order
    // is fine since start() on an empty-buffer emitter is a no-op that re-arms once
    // buffers land, but if we're already unlocked the schedulers need kicking now.
    if (this.#unlocked) {
      this.#shoreline.start()
      this.#gulls.start()
    }
  }

  /** Build the context eagerly, but never play while suspended: call this only from
   * inside a real user-gesture event handler (click/keydown/pointerdown). */
  async unlock(): Promise<boolean> {
    const running = await resumeAudioContext()
    this.#tryStart()
    return running
  }

  /** Idempotent: starts playback the first time the context is actually 'running',
   * however it got there, and does nothing on every call after. */
  #tryStart(): void {
    if (this.#unlocked || getAudioContextState() !== 'running') return
    this.#unlocked = true
    this.#bed.play()
    this.#music.start()
    this.#shoreline.start()
    this.#gulls.start()
    const persisted = loadPersistedAudioState()
    setFader(this.#buses.ambienceBus.gain, this.#ctx, persisted.ambienceVolume, BED_UNLOCK_FADE_MS)
    setFader(this.#buses.musicBus.gain, this.#ctx, persisted.musicVolume, MUSIC_UNLOCK_FADE_MS)
    setFader(this.#buses.worldBus.gain, this.#ctx, persisted.sfxVolume, 80)
    setFader(this.#buses.uiBus.gain, this.#ctx, persisted.sfxVolume, 80)
  }

  get unlocked(): boolean {
    return this.#unlocked
  }

  /** One user-facing multiplier on top of everything else — the music/ambience/duck
   * fades elsewhere in this class are a mix, not a volume knob. Short ramp (not an
   * instant `.value =`) so dragging a slider doesn't click. */
  setMasterVolume(v: number): void {
    setFader(this.#buses.master.gain, this.#ctx, v, 80)
  }

  setMusicVolume(v: number): void {
    setFader(this.#buses.musicBus.gain, this.#ctx, v, 80)
  }

  setAmbienceVolume(v: number): void {
    setFader(this.#buses.ambienceBus.gain, this.#ctx, v, 80)
  }

  setSfxVolume(v: number): void {
    setFader(this.#buses.worldBus.gain, this.#ctx, v, 80)
    setFader(this.#buses.uiBus.gain, this.#ctx, v, 80)
  }

  setMusicMood(mood: LofiMood): void {
    this.#music.setMood(mood)
  }

  setAmbiencePreset(type: AmbienceType): void {
    this.#procedural.setAmbience(type)
  }

  playThrowSound(type: 'snow' | 'sand' | 'soil'): void {
    if (!this.#unlocked || this.#ctx.state !== 'running') return
    const now = this.#ctx.currentTime
    const osc = this.#ctx.createOscillator()
    const gain = this.#ctx.createGain()
    const filter = this.#ctx.createBiquadFilter()

    osc.type = 'sine'
    const startFreq = type === 'snow' ? 450 : type === 'sand' ? 380 : 300
    osc.frequency.setValueAtTime(startFreq, now)
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.22)

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(type === 'snow' ? 2200 : 1600, now)

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.18, now + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.#buses.worldBus)

    osc.start(now)
    osc.stop(now + 0.25)
  }

  playImpactSound(type: 'snow' | 'sand' | 'soil'): void {
    if (!this.#unlocked || this.#ctx.state !== 'running') return
    const now = this.#ctx.currentTime
    const osc = this.#ctx.createOscillator()
    const gain = this.#ctx.createGain()
    const filter = this.#ctx.createBiquadFilter()

    osc.type = type === 'snow' ? 'triangle' : 'sine'
    const startFreq = type === 'snow' ? 180 : type === 'sand' ? 140 : 110
    osc.frequency.setValueAtTime(startFreq, now)
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.16)

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(type === 'snow' ? 1400 : 900, now)

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.24, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.#buses.worldBus)

    osc.start(now)
    osc.stop(now + 0.2)
  }

  playPropPlaceSound(type: string): void {
    if (!this.#unlocked || this.#ctx.state !== 'running') return
    const now = this.#ctx.currentTime
    const osc = this.#ctx.createOscillator()
    const gain = this.#ctx.createGain()
    const filter = this.#ctx.createBiquadFilter()

    osc.type = type === 'campfire' ? 'sawtooth' : type === 'firework' ? 'sine' : 'triangle'
    osc.frequency.setValueAtTime(type === 'campfire' ? 240 : 160, now)
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.12)

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1200, now)

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.22, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.#buses.worldBus)

    osc.start(now)
    osc.stop(now + 0.16)
  }

  playFireworkSound(): void {
    if (!this.#unlocked || this.#ctx.state !== 'running') return
    const now = this.#ctx.currentTime

    // 1. Launch Whoosh
    const launchOsc = this.#ctx.createOscillator()
    const launchGain = this.#ctx.createGain()
    launchOsc.type = 'sine'
    launchOsc.frequency.setValueAtTime(220, now)
    launchOsc.frequency.exponentialRampToValueAtTime(780, now + 0.6)
    launchGain.gain.setValueAtTime(0.01, now)
    launchGain.gain.linearRampToValueAtTime(0.16, now + 0.1)
    launchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65)
    launchOsc.connect(launchGain)
    launchGain.connect(this.#buses.worldBus)
    launchOsc.start(now)
    launchOsc.stop(now + 0.7)

    // 2. Sky Explosion Boom (delayed ~0.95s)
    const boomTime = now + 0.95
    const boomOsc = this.#ctx.createOscillator()
    const boomGain = this.#ctx.createGain()
    const boomFilter = this.#ctx.createBiquadFilter()
    boomOsc.type = 'triangle'
    boomOsc.frequency.setValueAtTime(110, boomTime)
    boomOsc.frequency.exponentialRampToValueAtTime(30, boomTime + 0.4)
    boomFilter.type = 'lowpass'
    boomFilter.frequency.setValueAtTime(600, boomTime)
    boomGain.gain.setValueAtTime(0.001, boomTime)
    boomGain.gain.linearRampToValueAtTime(0.35, boomTime + 0.03)
    boomGain.gain.exponentialRampToValueAtTime(0.001, boomTime + 0.6)
    boomOsc.connect(boomFilter)
    boomFilter.connect(boomGain)
    boomGain.connect(this.#buses.worldBus)
    boomOsc.start(boomTime)
    boomOsc.stop(boomTime + 0.7)
  }

  playZenSound(): void {
    if (!this.#unlocked || this.#ctx.state !== 'running') return
    const now = this.#ctx.currentTime
    const osc = this.#ctx.createOscillator()
    const gain = this.#ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(528, now) // Solfeggio 528Hz calming tone
    osc.frequency.exponentialRampToValueAtTime(520, now + 1.2)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.18, now + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6)
    osc.connect(gain)
    gain.connect(this.#buses.worldBus)
    osc.start(now)
    osc.stop(now + 1.7)
  }

  playRadioSound(): void {
    if (!this.#unlocked || this.#ctx.state !== 'running') return
    const now = this.#ctx.currentTime
    const osc = this.#ctx.createOscillator()
    const gain = this.#ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(320, now)
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.08)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.1, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    osc.connect(gain)
    gain.connect(this.#buses.worldBus)
    osc.start(now)
    osc.stop(now + 0.15)
  }

  playTeaSound(): void {
    if (!this.#unlocked || this.#ctx.state !== 'running') return
    const now = this.#ctx.currentTime
    const osc = this.#ctx.createOscillator()
    const gain = this.#ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(800, now)
    osc.frequency.exponentialRampToValueAtTime(350, now + 0.09)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.12, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)
    osc.connect(gain)
    gain.connect(this.#buses.worldBus)
    osc.start(now)
    osc.stop(now + 0.12)
  }

  playVolleyballHitSound(spike = false): void {
    if (!this.#unlocked || this.#ctx.state !== 'running') return
    const now = this.#ctx.currentTime
    const osc = this.#ctx.createOscillator()
    const gain = this.#ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(spike ? 280 : 200, now)
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.1)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(spike ? 0.35 : 0.22, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    osc.connect(gain)
    gain.connect(this.#buses.worldBus)
    osc.start(now)
    osc.stop(now + 0.14)
  }

  playVolleyballWhistleSound(): void {
    if (!this.#unlocked || this.#ctx.state !== 'running') return
    const now = this.#ctx.currentTime
    const osc = this.#ctx.createOscillator()
    const gain = this.#ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(2400, now)
    osc.frequency.setValueAtTime(2800, now + 0.06)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.16, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
    osc.connect(gain)
    gain.connect(this.#buses.worldBus)
    osc.start(now)
    osc.stop(now + 0.28)
  }

  playVolleyballWinSound(): void {
    if (!this.#unlocked || this.#ctx.state !== 'running') return
    const now = this.#ctx.currentTime
    const freqs = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6 fanfare
    freqs.forEach((freq, idx) => {
      const osc = this.#ctx.createOscillator()
      const gain = this.#ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now + idx * 0.12)
      gain.gain.setValueAtTime(0.001, now + idx * 0.12)
      gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.12 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.45)
      osc.connect(gain)
      gain.connect(this.#buses.worldBus)
      osc.start(now + idx * 0.12)
      osc.stop(now + idx * 0.12 + 0.5)
    })
  }

  playSkeetLaunchSound(): void {
    if (!this.#unlocked || this.#ctx.state !== 'running') return
    const now = this.#ctx.currentTime
    const osc = this.#ctx.createOscillator()
    const gain = this.#ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(160, now)
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.09)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.22, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)
    osc.connect(gain)
    gain.connect(this.#buses.worldBus)
    osc.start(now)
    osc.stop(now + 0.18)
  }

  playSkeetShatterSound(): void {
    if (!this.#unlocked || this.#ctx.state !== 'running') return
    const now = this.#ctx.currentTime
    // High-pitched ceramic shatter pop
    const osc1 = this.#ctx.createOscillator()
    const osc2 = this.#ctx.createOscillator()
    const gain = this.#ctx.createGain()
    osc1.type = 'sine'
    osc2.type = 'square'
    osc1.frequency.setValueAtTime(1800, now)
    osc1.frequency.exponentialRampToValueAtTime(450, now + 0.15)
    osc2.frequency.setValueAtTime(820, now)
    osc2.frequency.exponentialRampToValueAtTime(220, now + 0.12)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.25, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(this.#buses.worldBus)
    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + 0.24)
    osc2.stop(now + 0.24)
  }

  /** Called once per rendered frame with the local player's current ground position and
   * speed — drives footstep cadence. Window-blur/tab-hidden does NOT pause any of this;
   * the whole premise of the ambience bed and generative music is that they keep going. */
  update(x: number, z: number, speed: number, grounded: boolean): void {
    if (!this.#hasLast) {
      this.#lastX = x
      this.#lastZ = z
      this.#hasLast = true
    }
    const dist = Math.hypot(x - this.#lastX, z - this.#lastZ)
    this.#lastX = x
    this.#lastZ = z
    if (grounded) this.#footsteps.update(dist, speed)
  }

  dispose(): void {
    this.#unsubscribeContextState()
    this.#music.dispose()
    this.#bed.dispose()
    this.#procedural.dispose()
    this.#shoreline.dispose()
    this.#gulls.stop()
    this.#listener.parent?.remove(this.#listener)
  }
}
