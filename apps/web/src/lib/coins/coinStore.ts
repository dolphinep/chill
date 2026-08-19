import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'chill.frostholm.coins.v2'

export interface CoinState {
  collectedIds: string[]
  score: number
  highScore: number
  startTimeMs: number | null
  completedTimeMs: number | null
  bestTimeMs: number | null
}

function loadSavedState(): CoinState {
  if (typeof window === 'undefined') {
    return {
      collectedIds: [],
      score: 0,
      highScore: 0,
      startTimeMs: null,
      completedTimeMs: null,
      bestTimeMs: null,
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        collectedIds: Array.isArray(parsed.collectedIds) ? parsed.collectedIds : [],
        score: typeof parsed.score === 'number' ? parsed.score : 0,
        highScore: typeof parsed.highScore === 'number' ? parsed.highScore : 0,
        startTimeMs: typeof parsed.startTimeMs === 'number' ? parsed.startTimeMs : null,
        completedTimeMs: typeof parsed.completedTimeMs === 'number' ? parsed.completedTimeMs : null,
        bestTimeMs: typeof parsed.bestTimeMs === 'number' ? parsed.bestTimeMs : null,
      }
    }
  } catch {}
  return {
    collectedIds: [],
    score: 0,
    highScore: 0,
    startTimeMs: null,
    completedTimeMs: null,
    bestTimeMs: null,
  }
}

let currentState: CoinState = loadSavedState()
const listeners = new Set<() => void>()

function saveState(state: CoinState) {
  currentState = state
  listeners.forEach((l) => l())
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {}
  }
}

export const coinStore = {
  getSnapshot(): CoinState {
    return currentState
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  startTimer(): void {
    if (currentState.startTimeMs === null) {
      saveState({
        ...currentState,
        startTimeMs: Date.now(),
        completedTimeMs: null,
      })
    }
  },

  collectCoin(id: string, totalCoins: number, points = 100): boolean {
    if (currentState.collectedIds.includes(id)) return false

    const now = Date.now()
    const startTimeMs = currentState.startTimeMs ?? now
    const collectedIds = [...currentState.collectedIds, id]
    const score = currentState.score + points
    const highScore = Math.max(score, currentState.highScore)

    let completedTimeMs = currentState.completedTimeMs
    let bestTimeMs = currentState.bestTimeMs

    // Check if run completed
    if (collectedIds.length >= totalCoins && completedTimeMs === null) {
      completedTimeMs = Math.max(100, now - startTimeMs)
      if (bestTimeMs === null || completedTimeMs < bestTimeMs) {
        bestTimeMs = completedTimeMs
      }
    }

    saveState({
      collectedIds,
      score,
      highScore,
      startTimeMs,
      completedTimeMs,
      bestTimeMs,
    })
    return true
  },

  isCollected(id: string): boolean {
    return currentState.collectedIds.includes(id)
  },

  resetRun(): void {
    saveState({
      collectedIds: [],
      score: 0,
      highScore: currentState.highScore,
      startTimeMs: null,
      completedTimeMs: null,
      bestTimeMs: currentState.bestTimeMs,
    })
  },
}

export function useCoinStore(): CoinState {
  return useSyncExternalStore(coinStore.subscribe, coinStore.getSnapshot, () => ({
    collectedIds: [],
    score: 0,
    highScore: 0,
    startTimeMs: null,
    completedTimeMs: null,
    bestTimeMs: null,
  }))
}
