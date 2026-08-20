export type LofiMood =
  | 'cozy-piano'
  | 'guitar-lofi'
  | 'chill-synthwave'
  | 'japanese-zen'
  | 'midnight-ambient'
  | 'deep-focus'

export type GenerativeMusic = {
  start(): void
  stop(): void
  setMood(mood: LofiMood): void
  dispose(): void
}

/** Converts note name like 'C4', 'F#3', 'Bb3' to frequency in Hz */
function noteToFreq(note: string): number {
  const noteNames: Record<string, number> = {
    C: 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
  }
  const match = note.match(/^([A-Ga-g][#b]?)([0-9])$/)
  if (!match || !match[1] || !match[2]) return 440
  const name = match[1].toUpperCase()
  const octave = parseInt(match[2], 10)
  const semitone = noteNames[name] ?? 0
  const midi = (octave + 1) * 12 + semitone
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function createGenerativeMusic(ctx: AudioContext, destination: AudioNode): GenerativeMusic {
  let activeMood: LofiMood = 'cozy-piano'
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false

  // Master output bus for music
  const masterGain = ctx.createGain()
  masterGain.gain.setValueAtTime(0.6, ctx.currentTime)

  // Lush stereo feedback delay / ambient reverb
  const delay = ctx.createDelay()
  delay.delayTime.setValueAtTime(0.36, ctx.currentTime)
  const delayFeedback = ctx.createGain()
  delayFeedback.gain.setValueAtTime(0.36, ctx.currentTime)
  const delayFilter = ctx.createBiquadFilter()
  delayFilter.type = 'lowpass'
  delayFilter.frequency.setValueAtTime(2000, ctx.currentTime)

  delay.connect(delayFeedback)
  delayFeedback.connect(delayFilter)
  delayFilter.connect(delay)
  delay.connect(masterGain)

  masterGain.connect(destination)

  // 1. Cozy Piano Notes (Mellow Lydian keys)
  const PIANO_NOTES = ['D3', 'F#3', 'A3', 'B3', 'D4', 'E4', 'F#4', 'A4', 'B4', 'D5']

  // 2. Jazz Guitar Chords
  const GUITAR_CHORDS = [
    ['C3', 'G3', 'B3', 'E4', 'G4'], // Cmaj7
    ['A2', 'E3', 'G3', 'C4', 'E4'], // Am7
    ['D3', 'F3', 'A3', 'C4', 'F4'], // Dm7
    ['G2', 'D3', 'F3', 'B3', 'E4'], // G7
  ]
  let guitarIndex = 0

  // 3. Synthwave notes
  const SYNTH_NOTES = ['A2', 'C3', 'E3', 'G3', 'A3', 'B3', 'C4', 'E4', 'G4', 'A4']

  // 4. Japanese Zen Koto scale (Insen / Hirajoshi pentatonic)
  const ZEN_NOTES = ['D3', 'Eb3', 'G3', 'A3', 'Bb3', 'D4', 'Eb4', 'G4', 'A4', 'Bb4', 'D5']

  // 5. Midnight Space Ambient (Deep 5th Drone & Glass Chimes)
  const AMBIENT_CHIMES = ['E4', 'B4', 'E5', 'F#5', 'G#5', 'B5', 'E6']

  // 6. Deep Focus Drone — deliberately the narrowest, sparsest mood of the six. Every
  // other mood plays chords/arpeggios/scale runs (melodic movement that gives the ear
  // something to actively follow), which is fine for ambient relaxation but is exactly
  // what background-music research flags as the risk for demanding cognitive work:
  // the more a piece of music behaves like a "song" — melody, harmonic change,
  // lyrics — the more it competes for the same attention/working-memory resources as
  // reading or writing. This mood only ever plays the tonic, its fifth, and the
  // octave above — the most consonant, least "surprising" interval set possible — as
  // long, slow, widely-spaced tones, so there's a sense of a calm presence in the room
  // without anything melodic enough to actually listen to.
  const FOCUS_DRONE_NOTES = ['C3', 'G3', 'C4']

  function playVoice(
    freq: number,
    dur: number,
    instrument: 'piano' | 'guitar' | 'synth' | 'koto' | 'ambient',
    gainMult = 1.0,
  ): void {
    if (!running || ctx.state !== 'running') return
    const now = ctx.currentTime

    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const vGain = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    if (instrument === 'piano') {
      osc1.type = 'sine'
      osc2.type = 'triangle'
      osc1.frequency.setValueAtTime(freq, now)
      osc2.frequency.setValueAtTime(freq * 1.0015, now)

      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(1400, now)
      filter.frequency.exponentialRampToValueAtTime(350, now + dur)

      vGain.gain.setValueAtTime(0.0001, now)
      vGain.gain.linearRampToValueAtTime(0.32 * gainMult, now + 0.035)
      vGain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    } else if (instrument === 'guitar') {
      // Warm acoustic pluck: triangle with highpass pluck transient
      osc1.type = 'triangle'
      osc2.type = 'sawtooth'
      osc1.frequency.setValueAtTime(freq, now)
      osc2.frequency.setValueAtTime(freq * 1.002, now)

      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(2400, now)
      filter.frequency.exponentialRampToValueAtTime(600, now + dur * 0.6)

      vGain.gain.setValueAtTime(0.0001, now)
      vGain.gain.linearRampToValueAtTime(0.26 * gainMult, now + 0.015)
      vGain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    } else if (instrument === 'synth') {
      // 80s analog synthwave: detuned sawtooth + warm resonant filter
      osc1.type = 'sawtooth'
      osc2.type = 'triangle'
      osc1.frequency.setValueAtTime(freq, now)
      osc2.frequency.setValueAtTime(freq * 1.006, now)

      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(1800, now)
      filter.Q.setValueAtTime(3.0, now)
      filter.frequency.exponentialRampToValueAtTime(400, now + dur)

      vGain.gain.setValueAtTime(0.0001, now)
      vGain.gain.linearRampToValueAtTime(0.24 * gainMult, now + 0.04)
      vGain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    } else if (instrument === 'koto') {
      // Japanese Koto Harp: sharp pluck with rich acoustic bell harmonics
      osc1.type = 'triangle'
      osc2.type = 'sine'
      osc1.frequency.setValueAtTime(freq, now)
      osc2.frequency.setValueAtTime(freq * 2.001, now) // octave harmonic

      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(freq * 1.5, now)
      filter.Q.setValueAtTime(2.2, now)

      vGain.gain.setValueAtTime(0.0001, now)
      vGain.gain.linearRampToValueAtTime(0.38 * gainMult, now + 0.008)
      vGain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    } else {
      // Midnight Space Ambient: glass chime + deep pad
      osc1.type = 'sine'
      osc2.type = 'sine'
      osc1.frequency.setValueAtTime(freq, now)
      osc2.frequency.setValueAtTime(freq * 2.0, now)

      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(3200, now)

      vGain.gain.setValueAtTime(0.0001, now)
      vGain.gain.linearRampToValueAtTime(0.22 * gainMult, now + 0.4)
      vGain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    }

    osc1.connect(filter)
    osc2.connect(filter)
    filter.connect(vGain)
    vGain.connect(masterGain)
    vGain.connect(delay)

    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + dur + 0.1)
    osc2.stop(now + dur + 0.1)
  }

  function playStep(): void {
    if (!running) return

    if (activeMood === 'cozy-piano') {
      // Melodic piano notes
      const n1 = PIANO_NOTES[Math.floor(Math.random() * PIANO_NOTES.length)]!
      playVoice(noteToFreq(n1), 3.2, 'piano')
      if (Math.random() > 0.4) {
        const n2 = PIANO_NOTES[Math.floor(Math.random() * PIANO_NOTES.length)]!
        setTimeout(() => {
          if (running && activeMood === 'cozy-piano') {
            playVoice(noteToFreq(n2), 2.8, 'piano', 0.8)
          }
        }, 320)
      }
      const nextGap = 2000 + Math.random() * 2200
      timer = setTimeout(playStep, nextGap)
    } else if (activeMood === 'guitar-lofi') {
      // Fingerpicked acoustic guitar arpeggios
      const chord = GUITAR_CHORDS[guitarIndex % GUITAR_CHORDS.length]!
      guitarIndex++
      chord.forEach((n, idx) => {
        setTimeout(() => {
          if (running && activeMood === 'guitar-lofi') {
            playVoice(noteToFreq(n), 3.8, 'guitar', 0.9)
          }
        }, idx * 160)
      })
      const nextGap = 3200 + Math.random() * 1400
      timer = setTimeout(playStep, nextGap)
    } else if (activeMood === 'chill-synthwave') {
      // 80s Dreamy Synthwave arpeggios
      const n1 = SYNTH_NOTES[Math.floor(Math.random() * SYNTH_NOTES.length)]!
      playVoice(noteToFreq(n1), 2.0, 'synth')
      const n2 = SYNTH_NOTES[Math.floor(Math.random() * SYNTH_NOTES.length)]!
      setTimeout(() => {
        if (running && activeMood === 'chill-synthwave') {
          playVoice(noteToFreq(n2), 2.0, 'synth', 0.85)
        }
      }, 240)
      const nextGap = 1500 + Math.random() * 1600
      timer = setTimeout(playStep, nextGap)
    } else if (activeMood === 'japanese-zen') {
      // Peaceful Asian Koto Harp
      const n1 = ZEN_NOTES[Math.floor(Math.random() * ZEN_NOTES.length)]!
      playVoice(noteToFreq(n1), 3.5, 'koto', 1.0)
      if (Math.random() > 0.35) {
        const n2 = ZEN_NOTES[Math.floor(Math.random() * ZEN_NOTES.length)]!
        setTimeout(() => {
          if (running && activeMood === 'japanese-zen') {
            playVoice(noteToFreq(n2), 3.2, 'koto', 0.85)
          }
        }, 220)
      }
      const nextGap = 2400 + Math.random() * 2600
      timer = setTimeout(playStep, nextGap)
    } else if (activeMood === 'midnight-ambient') {
      // Midnight Space Ambient: Shimmering glass chimes + deep drone
      const n1 = AMBIENT_CHIMES[Math.floor(Math.random() * AMBIENT_CHIMES.length)]!
      playVoice(noteToFreq(n1), 5.0, 'ambient', 0.8)
      // Deep sub-bass pad
      playVoice(noteToFreq('E2'), 6.5, 'ambient', 0.6)
      const nextGap = 3500 + Math.random() * 2500
      timer = setTimeout(playStep, nextGap)
    } else {
      // Deep Focus Drone — one long, quiet tone from a 3-note set (tonic/5th/octave),
      // spaced much further apart than any other mood (see `FOCUS_DRONE_NOTES`'s own
      // comment). No chord stacking, no arpeggio, no second voice layered on top —
      // the silence between notes is the point, not something to fill.
      const n1 = FOCUS_DRONE_NOTES[Math.floor(Math.random() * FOCUS_DRONE_NOTES.length)]!
      playVoice(noteToFreq(n1), 11.0, 'ambient', 0.5)
      const nextGap = 7000 + Math.random() * 4000
      timer = setTimeout(playStep, nextGap)
    }
  }

  return {
    start(): void {
      if (running) return
      running = true
      playStep()
    },
    stop(): void {
      running = false
      if (timer) clearTimeout(timer)
    },
    setMood(mood: LofiMood): void {
      activeMood = mood
      if (timer) clearTimeout(timer)
      if (running) {
        playStep()
      }
    },
    dispose(): void {
      running = false
      if (timer) clearTimeout(timer)
      try {
        masterGain.disconnect()
      } catch {}
      try {
        delay.disconnect()
      } catch {}
    },
  }
}
