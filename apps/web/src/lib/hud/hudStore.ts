import { useSyncExternalStore } from 'react'

/**
 * The hint ledger + hide-all flag, as one small external store.
 *
 * The plan calls for "Zustand" — a real dependency was not worth adding for state this
 * small. `useSyncExternalStore` is the same subscribe/snapshot shape a Zustand store
 * boils down to internally; this is that shape without the package.
 *
 * Persisted to `localStorage` so "shown 3 times" and "hide-all" survive a reload —
 * without that, a hint a user already dismissed forever would come right back.
 */

type HintId = 'stand-up' | 'hide-all-toast'

type HudState = {
  hidden: boolean
  /** The one hint allowed to be visible at a time — plan rule: never two simultaneously. */
  activeHint: HintId | null
  hintCounts: Record<string, number>
  hintDone: Record<string, boolean>
  lastHintAt: number
}

const STORAGE_KEY = 'chill.hud.v1'
const MAX_SHOWS = 3
const GLOBAL_COOLDOWN_MS = 20_000

function loadPersisted(): Pick<HudState, 'hintCounts' | 'hintDone'> {
  if (typeof window === 'undefined') return { hintCounts: {}, hintDone: {} }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { hintCounts: {}, hintDone: {} }
    const parsed = JSON.parse(raw) as Partial<HudState>
    return { hintCounts: parsed.hintCounts ?? {}, hintDone: parsed.hintDone ?? {} }
  } catch {
    return { hintCounts: {}, hintDone: {} }
  }
}

function persist(state: HudState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ hintCounts: state.hintCounts, hintDone: state.hintDone }),
    )
  } catch {
    // Private browsing / quota — the ledger just resets each session. Not worth surfacing.
  }
}

let state: HudState = { hidden: false, activeHint: null, lastHintAt: 0, ...loadPersisted() }
const listeners = new Set<() => void>()

function set(next: Partial<HudState>): void {
  state = { ...state, ...next }
  persist(state)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): HudState {
  return state
}

export function toggleHidden(): void {
  set({ hidden: !state.hidden })
}

/**
 * Claim the single "currently showing" hint slot for `id`, if the ledger allows it:
 * under the per-hint show cap, not already permanently dismissed, nothing else showing,
 * and past the global cooldown since the last hint. Returns whether the claim succeeded.
 */
export function tryShowHint(id: HintId): boolean {
  if (state.activeHint !== null) return false
  if (state.hintDone[id]) return false
  if ((state.hintCounts[id] ?? 0) >= MAX_SHOWS) return false
  if (Date.now() - state.lastHintAt < GLOBAL_COOLDOWN_MS) return false

  set({
    activeHint: id,
    lastHintAt: Date.now(),
    hintCounts: { ...state.hintCounts, [id]: (state.hintCounts[id] ?? 0) + 1 },
  })
  return true
}

export function dismissHint(id: HintId): void {
  if (state.activeHint === id) set({ activeHint: null })
}

/** Permanently suppress a hint — e.g. once the action it was nudging toward happens. */
export function markHintDone(id: HintId): void {
  set({
    hintDone: { ...state.hintDone, [id]: true },
    activeHint: state.activeHint === id ? null : state.activeHint,
  })
}

const SERVER_SNAPSHOT: HudState = {
  hidden: false,
  activeHint: null,
  hintCounts: {},
  hintDone: {},
  lastHintAt: 0,
}
const getServerSnapshot = (): HudState => SERVER_SNAPSHOT

export function useHudHidden(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).hidden
}

export function useActiveHint(): HintId | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).activeHint
}
