import { useSyncExternalStore } from 'react'
import type { AmbienceType } from './engine'
import type { LofiMood } from './generative'

export type AudioState = {
  masterVolume: number
  musicVolume: number
  musicMood: LofiMood
  ambienceVolume: number
  ambiencePreset: AmbienceType
  sfxVolume: number
  muted: boolean
}

const STORAGE_KEY = 'chill.audio.settings.v1'
const DEFAULT_STATE: AudioState = {
  masterVolume: 0.35,
  musicVolume: 0.5,
  musicMood: 'cozy-piano',
  ambienceVolume: 0.45,
  ambiencePreset: 'wind',
  sfxVolume: 0.6,
  muted: false,
}

export function loadPersistedAudioState(): AudioState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<AudioState>
    return {
      masterVolume:
        typeof parsed.masterVolume === 'number' ? parsed.masterVolume : DEFAULT_STATE.masterVolume,
      musicVolume:
        typeof parsed.musicVolume === 'number' ? parsed.musicVolume : DEFAULT_STATE.musicVolume,
      musicMood: parsed.musicMood ?? DEFAULT_STATE.musicMood,
      ambienceVolume:
        typeof parsed.ambienceVolume === 'number'
          ? parsed.ambienceVolume
          : DEFAULT_STATE.ambienceVolume,
      ambiencePreset: parsed.ambiencePreset ?? DEFAULT_STATE.ambiencePreset,
      sfxVolume:
        typeof parsed.sfxVolume === 'number' ? parsed.sfxVolume : DEFAULT_STATE.sfxVolume,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_STATE.muted,
    }
  } catch {
    return DEFAULT_STATE
  }
}

function persist(state: AudioState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

let state: AudioState = loadPersistedAudioState()
const listeners = new Set<() => void>()

function set(next: Partial<AudioState>): void {
  state = { ...state, ...next }
  persist(state)
  listeners.forEach((l) => l())
}

export function setMasterVolume(v: number): void {
  set({ masterVolume: Math.max(0, Math.min(1, v)) })
}

export function setMusicVolume(v: number): void {
  set({ musicVolume: Math.max(0, Math.min(1, v)) })
}

export function setMusicMood(mood: LofiMood): void {
  set({ musicMood: mood })
}

export function setAmbienceVolume(v: number): void {
  set({ ambienceVolume: Math.max(0, Math.min(1, v)) })
}

export function setAmbiencePreset(type: AmbienceType): void {
  set({ ambiencePreset: type })
}

export function setSfxVolume(v: number): void {
  set({ sfxVolume: Math.max(0, Math.min(1, v)) })
}

export function toggleMute(): void {
  set({ muted: !state.muted })
}

export function effectiveMasterVolume(s: AudioState): number {
  return s.muted ? 0 : s.masterVolume
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getServerSnapshot = (): AudioState => DEFAULT_STATE

export function useAudioState(): AudioState {
  return useSyncExternalStore(subscribe, () => state, getServerSnapshot)
}
