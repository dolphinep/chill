/**
 * Web Audio API procedural ambient sound generators for:
 * 1. Alpine Mountain Breeze & Wind Gusts
 * 2. Rhythmic Ocean Shore Wave Swells & Sandy Surf
 * 3. Cozy Falling Rain
 * 4. Crackling Warm Campfire
 * 5. Summer Night Crickets
 */

export type AmbienceType = 'wind' | 'waves' | 'rain' | 'fire' | 'crickets'

export class ProceduralAmbience {
  #ctx: AudioContext
  #masterGain: GainNode

  // Wind nodes
  #windNoise?: AudioBufferSourceNode
  #windFilter?: BiquadFilterNode
  #windGain?: GainNode
  #windTimer?: number

  // Ocean Wave nodes
  #waveNoise?: AudioBufferSourceNode
  #waveFilter?: BiquadFilterNode
  #waveGain?: GainNode
  #waveTimer?: number

  // Rain nodes
  #rainGain?: GainNode
  #rainNoise?: AudioBufferSourceNode

  // Fire nodes
  #fireGain?: GainNode
  #fireNoise?: AudioBufferSourceNode
  #fireTimer?: number

  // Crickets nodes
  #cricketGain?: GainNode
  #cricketOsc1?: OscillatorNode
  #cricketOsc2?: OscillatorNode
  #cricketTimer?: number

  #activeType: AmbienceType = 'wind'

  constructor(ctx: AudioContext, parentNode: AudioNode) {
    this.#ctx = ctx
    this.#masterGain = ctx.createGain()
    this.#masterGain.gain.setValueAtTime(1, ctx.currentTime)
    this.#masterGain.connect(parentNode)
  }

  setAmbience(type: AmbienceType): void {
    if (this.#activeType === type) return
    this.stop()
    this.#activeType = type

    if (type === 'wind') this.#startWind()
    else if (type === 'waves') this.#startWaves()
    else if (type === 'rain') this.#startRain()
    else if (type === 'fire') this.#startFire()
    else if (type === 'crickets') this.#startCrickets()
  }

  #startWind(): void {
    const bufferSize = this.#ctx.sampleRate * 3
    const buffer = this.#ctx.createBuffer(1, bufferSize, this.#ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let lastOut = 0.0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      const val = (lastOut + 0.04 * white) / 1.04
      data[i] = val * 1.8
      lastOut = val
    }

    const noise = this.#ctx.createBufferSource()
    noise.buffer = buffer
    noise.loop = true

    const filter = this.#ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(420, this.#ctx.currentTime)
    filter.Q.setValueAtTime(1.8, this.#ctx.currentTime)

    const gain = this.#ctx.createGain()
    gain.gain.setValueAtTime(0.25, this.#ctx.currentTime)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(this.#masterGain)
    noise.start()

    this.#windNoise = noise
    this.#windFilter = filter
    this.#windGain = gain

    // Dynamic wind gust modulation
    const gust = () => {
      if (this.#activeType !== 'wind') return
      const now = this.#ctx.currentTime
      const gustDur = 3 + Math.random() * 3
      const targetFreq = 300 + Math.random() * 450
      const targetGain = 0.2 + Math.random() * 0.25

      filter.frequency.linearRampToValueAtTime(targetFreq, now + gustDur * 0.5)
      filter.frequency.linearRampToValueAtTime(380, now + gustDur)
      gain.gain.linearRampToValueAtTime(targetGain, now + gustDur * 0.5)
      gain.gain.linearRampToValueAtTime(0.2, now + gustDur)

      this.#windTimer = window.setTimeout(gust, gustDur * 1000)
    }
    gust()
  }

  #startWaves(): void {
    // Ocean surf: dual noise sources (deep rumble + crashing hiss)
    const bufferSize = this.#ctx.sampleRate * 4
    const buffer = this.#ctx.createBuffer(1, bufferSize, this.#ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.6
    }

    const noise = this.#ctx.createBufferSource()
    noise.buffer = buffer
    noise.loop = true

    const filter = this.#ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(180, this.#ctx.currentTime)

    const gain = this.#ctx.createGain()
    gain.gain.setValueAtTime(0.05, this.#ctx.currentTime)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(this.#masterGain)
    noise.start()

    this.#waveNoise = noise
    this.#waveFilter = filter
    this.#waveGain = gain

    // Rhythmic ocean wave swell and crash cycle (every 6–8s)
    const swell = () => {
      if (this.#activeType !== 'waves') return
      const now = this.#ctx.currentTime
      const waveDur = 6.5 + Math.random() * 2.5

      // 1. Swell builds (0s -> 2.5s)
      filter.frequency.setValueAtTime(180, now)
      filter.frequency.exponentialRampToValueAtTime(1100, now + 2.5)
      gain.gain.setValueAtTime(0.08, now)
      gain.gain.linearRampToValueAtTime(0.48, now + 2.5)

      // 2. Wave crash & foam hiss (2.5s -> 4.5s)
      filter.frequency.exponentialRampToValueAtTime(2200, now + 3.2)
      filter.frequency.exponentialRampToValueAtTime(450, now + 5.0)

      // 3. Backwash recedes across sand (5.0s -> waveDur)
      gain.gain.linearRampToValueAtTime(0.18, now + 4.8)
      gain.gain.linearRampToValueAtTime(0.04, now + waveDur)

      this.#waveTimer = window.setTimeout(swell, waveDur * 1000)
    }
    swell()
  }

  #startRain(): void {
    const bufferSize = this.#ctx.sampleRate * 2
    const buffer = this.#ctx.createBuffer(1, bufferSize, this.#ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.96900 * b2 + white * 0.1538520
      b3 = 0.86650 * b3 + white * 0.3104856
      b4 = 0.55000 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.0168980
      const val = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
      data[i] = val
      b6 = white * 0.115926
    }

    const noise = this.#ctx.createBufferSource()
    noise.buffer = buffer
    noise.loop = true

    const filter = this.#ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1200, this.#ctx.currentTime)

    const gain = this.#ctx.createGain()
    gain.gain.setValueAtTime(0.35, this.#ctx.currentTime)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(this.#masterGain)
    noise.start()

    this.#rainNoise = noise
    this.#rainGain = gain
  }

  #startFire(): void {
    const bufferSize = this.#ctx.sampleRate * 2
    const buffer = this.#ctx.createBuffer(1, bufferSize, this.#ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let lastOut = 0.0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      const val = ((lastOut + 0.02 * white) / 1.02) * 3.5
      data[i] = val
      lastOut = val / 3.5
    }

    const noise = this.#ctx.createBufferSource()
    noise.buffer = buffer
    noise.loop = true

    const filter = this.#ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(450, this.#ctx.currentTime)

    const gain = this.#ctx.createGain()
    gain.gain.setValueAtTime(0.4, this.#ctx.currentTime)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(this.#masterGain)
    noise.start()

    this.#fireNoise = noise
    this.#fireGain = gain

    // Organic warm fire crackle micro-sparks (no synthetic triangle tone pops!)
    const pop = () => {
      if (this.#activeType !== 'fire') return
      const now = this.#ctx.currentTime
      const popLen = 0.005 + Math.random() * 0.012
      const popBuf = this.#ctx.createBuffer(1, Math.floor(this.#ctx.sampleRate * popLen), this.#ctx.sampleRate)
      const popData = popBuf.getChannelData(0)
      for (let i = 0; i < popData.length; i++) {
        popData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (popData.length * 0.3))
      }
      const popSrc = this.#ctx.createBufferSource()
      popSrc.buffer = popBuf

      const popFilter = this.#ctx.createBiquadFilter()
      popFilter.type = 'bandpass'
      popFilter.frequency.setValueAtTime(1500 + Math.random() * 2500, now)
      popFilter.Q.setValueAtTime(1.5, now)

      const popGain = this.#ctx.createGain()
      popGain.gain.setValueAtTime(0.08 + Math.random() * 0.12, now)

      popSrc.connect(popFilter)
      popFilter.connect(popGain)
      popGain.connect(this.#masterGain)
      popSrc.start(now)

      const nextDelay = 120 + Math.random() * 450
      this.#fireTimer = window.setTimeout(pop, nextDelay)
    }
    pop()
  }

  #startCrickets(): void {
    const gain = this.#ctx.createGain()
    gain.gain.setValueAtTime(0.12, this.#ctx.currentTime)

    const osc1 = this.#ctx.createOscillator()
    const osc2 = this.#ctx.createOscillator()
    osc1.type = 'sine'
    osc2.type = 'sine'
    osc1.frequency.setValueAtTime(4600, this.#ctx.currentTime)
    osc2.frequency.setValueAtTime(4800, this.#ctx.currentTime)

    const modGain = this.#ctx.createGain()
    modGain.gain.setValueAtTime(0.12, this.#ctx.currentTime)

    osc1.connect(modGain)
    osc2.connect(modGain)
    modGain.connect(gain)
    gain.connect(this.#masterGain)

    osc1.start()
    osc2.start()

    this.#cricketOsc1 = osc1
    this.#cricketOsc2 = osc2
    this.#cricketGain = gain

    const chirp = () => {
      if (this.#activeType !== 'crickets') return
      const now = this.#ctx.currentTime
      modGain.gain.cancelScheduledValues(now)
      modGain.gain.setValueAtTime(0, now)
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.04
        modGain.gain.setValueAtTime(0.15, t)
        modGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025)
      }
      const nextDelay = 700 + Math.random() * 1400
      this.#cricketTimer = window.setTimeout(chirp, nextDelay)
    }
    chirp()
  }

  stop(): void {
    if (this.#windTimer) clearTimeout(this.#windTimer)
    if (this.#waveTimer) clearTimeout(this.#waveTimer)
    if (this.#fireTimer) clearTimeout(this.#fireTimer)
    if (this.#cricketTimer) clearTimeout(this.#cricketTimer)

    try { this.#windNoise?.stop(); this.#windNoise?.disconnect() } catch {}
    try { this.#waveNoise?.stop(); this.#waveNoise?.disconnect() } catch {}
    try { this.#rainNoise?.stop(); this.#rainNoise?.disconnect() } catch {}
    try { this.#fireNoise?.stop(); this.#fireNoise?.disconnect() } catch {}
    try { this.#cricketOsc1?.stop(); this.#cricketOsc1?.disconnect() } catch {}
    try { this.#cricketOsc2?.stop(); this.#cricketOsc2?.disconnect() } catch {}
  }

  dispose(): void {
    this.stop()
    this.#masterGain.disconnect()
  }
}
