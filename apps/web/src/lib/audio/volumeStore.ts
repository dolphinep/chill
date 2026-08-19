import { useSyncExternalStore } from 'react'

/**
 * Master volume + mute, persisted. Separate from `comfortStore` (FOV/damping) because
 * it's audio, not camera feel, and separate from the per-bus fades in `buses.ts` — this
 * is one user-facing multiplier on top of `AudioEngine`'s own `master` gain node, not a
 * replacement for the music/ambience mix those fades already do.
 */

export type VolumeState = { volume: number; muted: boolean }

const STORAGE_KEY = 'chill.volume.v1'
const DEFAULT_VOLUME = 0.35

function loadPersisted(): VolumeState {
  const fallback = { volume: DEFAULT_VOLUME, muted: false }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<VolumeState>
    return {
      volume: parsed.volume ?? fallback.volume,
      muted: parsed.muted ?? fallback.muted,
    }
  } catch {
    return fallback
  }
}

function persist(state: VolumeState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Private browsing / quota — the choice just doesn't survive a reload. Not fatal.
  }
}

let state: VolumeState = loadPersisted()
const listeners = new Set<() => void>()

function set(next: Partial<VolumeState>): void {
  state = { ...state, ...next }
  persist(state)
  listeners.forEach((l) => l())
}

export function setVolume(volume: number): void {
  set({ volume: Math.max(0, Math.min(1, volume)) })
}

export function toggleMute(): void {
  set({ muted: !state.muted })
}

/** What `AudioEngine.setMasterVolume` should actually be driven with — muting doesn't
 * forget the slider position, it just gates it to 0. */
export function effectiveVolume(s: VolumeState): number {
  return s.muted ? 0 : s.volume
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const SERVER_SNAPSHOT: VolumeState = { volume: DEFAULT_VOLUME, muted: false }
const getServerSnapshot = (): VolumeState => SERVER_SNAPSHOT

export function useVolumeState(): VolumeState {
  return useSyncExternalStore(subscribe, () => state, getServerSnapshot)
}
