import { useSyncExternalStore } from 'react'

/**
 * "Offer it as a deliberate choice in settings, not just an error state" (plan, Still
 * mode). Persisted so the choice survives a reload — someone on a locked-down laptop
 * shouldn't have to re-pick it every visit.
 */

const STORAGE_KEY = 'chill.stillMode.v1'

function loadPersisted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let state = loadPersisted()
const listeners = new Set<() => void>()

export function setStillMode(next: boolean): void {
  state = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  } catch {
    // Private browsing / quota — the choice just doesn't survive a reload. Not fatal.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getServerSnapshot = (): boolean => false

export function useStillMode(): boolean {
  return useSyncExternalStore(subscribe, () => state, getServerSnapshot)
}
