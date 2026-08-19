import * as THREE from 'three/webgpu'

/**
 * World-anchored sound: the ambience bed, shoreline wave crashes, footsteps, and gulls.
 *
 * **Ambience bed streams**, everything else decodes fully. The bed plays for the entire
 * session non-stop, so `MediaElementAudioSource` (backed by an `<audio>` tag that streams
 * off disk) is the only sane choice — decoding a whole session's worth of audio into one
 * `AudioBuffer` up front would be its own kind of memory leak. One-shots are short and
 * replayed constantly, so they're the opposite case: decode once at load, then every
 * subsequent play is a cheap `AudioBufferSourceNode` with no network/decode latency.
 */

const DETUNE_RANGE = 0.08 // ±8%, per plan

async function decodeBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url)
  const arrayBuffer = await res.arrayBuffer()
  return ctx.decodeAudioData(arrayBuffer)
}

function detuneRate(): number {
  return 1 + (Math.random() * 2 - 1) * DETUNE_RANGE
}

function playBuffer(ctx: AudioContext, buffer: AudioBuffer, destination: AudioNode, rate: number): void {
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = rate
  source.connect(destination)
  source.start()
}

// --- ambience bed -----------------------------------------------------------

export class AmbienceBed {
  #element: HTMLAudioElement
  #gain: GainNode

  constructor(ctx: AudioContext, url: string, destination: AudioNode) {
    this.#element = new Audio(url)
    this.#element.loop = true
    this.#element.crossOrigin = 'anonymous'
    const source = ctx.createMediaElementSource(this.#element)
    this.#gain = ctx.createGain()
    source.connect(this.#gain)
    this.#gain.connect(destination)
  }

  /** Must be called from within a real user-gesture handler — browsers reject `play()`
   * on a suspended/ungestured context otherwise. */
  play(): void {
    // `dispose()` racing a still-pending `play()` (React's dev-mode double-effect does
    // this reliably) rejects with `AbortError: play() request was interrupted by pause()`
    // — an expected outcome of disposing mid-play, not a real failure worth surfacing.
    this.#element.play().catch(() => {})
  }

  dispose(): void {
    this.#element.pause()
    this.#element.src = ''
  }
}

// --- shoreline wave crashes (positional, HRTF, capped) -----------------------

const MAX_SHORE_EMITTERS = 8
const SHORE_MIN_GAP_S = 5
const SHORE_MAX_GAP_S = 12

export class ShorelineEmitters {
  #audios: THREE.PositionalAudio[] = []
  #timers: ReturnType<typeof setTimeout>[] = []
  #buffers: AudioBuffer[] = []
  #running = false

  constructor(
    listener: THREE.AudioListener,
    scene: THREE.Scene,
    points: { x: number; z: number }[],
    seaLevelM: number,
  ) {
    const step = Math.max(1, Math.floor(points.length / MAX_SHORE_EMITTERS))
    const chosen = points.filter((_, i) => i % step === 0).slice(0, MAX_SHORE_EMITTERS)
    for (const p of chosen) {
      const audio = new THREE.PositionalAudio(listener)
      audio.setRefDistance(8)
      audio.setRolloffFactor(1)
      audio.setMaxDistance(150)
      audio.setDistanceModel('inverse')
      audio.panner.panningModel = 'HRTF'
      audio.position.set(p.x, seaLevelM, p.z)
      scene.add(audio)
      this.#audios.push(audio)
    }
  }

  setBuffers(buffers: AudioBuffer[]): void {
    this.#buffers = buffers
  }

  start(): void {
    if (this.#running || this.#buffers.length === 0) return
    this.#running = true
    for (const audio of this.#audios) this.#scheduleNext(audio)
  }

  stop(): void {
    this.#running = false
    for (const t of this.#timers) clearTimeout(t)
    this.#timers = []
  }

  dispose(): void {
    this.stop()
    for (const audio of this.#audios) {
      audio.parent?.remove(audio)
      audio.disconnect()
    }
  }

  #scheduleNext(audio: THREE.PositionalAudio): void {
    const gapMs = (SHORE_MIN_GAP_S + Math.random() * (SHORE_MAX_GAP_S - SHORE_MIN_GAP_S)) * 1000
    const timer = setTimeout(() => {
      if (!this.#running) return
      const buffer = this.#buffers[Math.floor(Math.random() * this.#buffers.length)]!
      audio.setBuffer(buffer)
      audio.setPlaybackRate(detuneRate())
      audio.play()
      this.#scheduleNext(audio)
    }, gapMs)
    this.#timers.push(timer)
  }
}

// --- footsteps (round-robin one-shot, triggered by stride distance) ---------

const STRIDE_LENGTH_M = 1.3
const MIN_SPEED_FOR_STEPS = 0.3

export class FootstepPlayer {
  #ctx: AudioContext
  #destination: AudioNode
  #buffers: AudioBuffer[] = []
  #traveled = 0
  #nextIndex = 0

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.#ctx = ctx
    this.#destination = destination
  }

  setBuffers(buffers: AudioBuffer[]): void {
    this.#buffers = buffers
  }

  /** `distanceM` is how far the character moved this step — the caller already has that
   * from position deltas, no reason to re-derive it from speed * dt here. */
  update(distanceM: number, speed: number): void {
    if (this.#buffers.length === 0 || speed < MIN_SPEED_FOR_STEPS) {
      this.#traveled = 0
      return
    }
    this.#traveled += distanceM
    if (this.#traveled < STRIDE_LENGTH_M) return
    this.#traveled = 0
    const buffer = this.#buffers[this.#nextIndex]!
    this.#nextIndex = (this.#nextIndex + 1) % this.#buffers.length
    playBuffer(this.#ctx, buffer, this.#destination, detuneRate())
  }
}

// --- gulls (sparse, incidental, loosely-positioned via stereo pan) ----------

const GULL_MIN_GAP_S = 15
const GULL_MAX_GAP_S = 40

export class GullEmitter {
  #ctx: AudioContext
  #panner: StereoPannerNode
  #buffers: AudioBuffer[] = []
  #timer: ReturnType<typeof setTimeout> | null = null
  #running = false

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.#ctx = ctx
    this.#panner = ctx.createStereoPanner()
    this.#panner.connect(destination)
  }

  setBuffers(buffers: AudioBuffer[]): void {
    this.#buffers = buffers
  }

  start(): void {
    if (this.#running) return
    this.#running = true
    this.#scheduleNext()
  }

  stop(): void {
    this.#running = false
    if (this.#timer) clearTimeout(this.#timer)
  }

  #scheduleNext(): void {
    const gapMs = (GULL_MIN_GAP_S + Math.random() * (GULL_MAX_GAP_S - GULL_MIN_GAP_S)) * 1000
    this.#timer = setTimeout(() => {
      if (!this.#running || this.#buffers.length === 0) return
      this.#panner.pan.value = Math.random() * 1.2 - 0.6
      const buffer = this.#buffers[Math.floor(Math.random() * this.#buffers.length)]!
      playBuffer(this.#ctx, buffer, this.#panner, detuneRate())
      this.#scheduleNext()
    }, gapMs)
  }
}

export async function loadBuffers(ctx: AudioContext, urls: string[]): Promise<AudioBuffer[]> {
  return Promise.all(urls.map((u) => decodeBuffer(ctx, u)))
}
