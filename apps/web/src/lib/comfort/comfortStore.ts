import { useSyncExternalStore } from 'react'
import { DEFAULT_DAMPING, DEFAULT_FOV, MAX_DAMPING, MAX_FOV, MIN_FOV } from './limits'

/**
 * The two comfort settings that are genuinely user taste, not an OS-level contract:
 * FOV and camera damping ("snappy ↔ floaty"). Reduced motion is handled separately and
 * directly by the engine (`lib/comfort/reducedMotion.ts`) — it follows the OS setting,
 * it isn't a slider a user sets here.
 *
 * Same `useSyncExternalStore` shape as `lib/hud/hudStore.ts`, for the same reason: a real
 * Zustand dependency isn't worth adding for two persisted numbers.
 */

export type ComfortState = { fov: number; damping: number }

const STORAGE_KEY = 'chill.comfort.v1'
export { MAX_DAMPING, MAX_FOV, MIN_FOV }

function loadPersisted(): ComfortState {
  const fallback = { fov: DEFAULT_FOV, damping: DEFAULT_DAMPING }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<ComfortState>
    return {
      fov: parsed.fov ?? fallback.fov,
      damping: parsed.damping ?? fallback.damping,
    }
  } catch {
    return fallback
  }
}

function persist(state: ComfortState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Private browsing / quota — settings just reset next session. Not worth surfacing.
  }
}

let state: ComfortState = loadPersisted()
const listeners = new Set<() => void>()

function set(next: Partial<ComfortState>): void {
  state = { ...state, ...next }
  persist(state)
  listeners.forEach((l) => l())
}

export function setFov(fov: number): void {
  set({ fov })
}

export function setDamping(damping: number): void {
  set({ damping })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const SERVER_SNAPSHOT: ComfortState = { fov: DEFAULT_FOV, damping: DEFAULT_DAMPING }
const getServerSnapshot = (): ComfortState => SERVER_SNAPSHOT

export function useComfortState(): ComfortState {
  return useSyncExternalStore(subscribe, () => state, getServerSnapshot)
}
