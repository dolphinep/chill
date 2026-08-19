import { useSyncExternalStore } from 'react'
import { DEFAULT_SCENERY_ID, SCENERY_REGISTRY } from './registry'
import type { SceneryId } from '@/types/models/scenery'
import { announceLanScenery } from '@/lib/lan/lanSessionStore'

/**
 * "Current scenery/room → nuqs (shareable)... favourite → Zustand persist" (plan).
 * Neither dependency is in this project (the HUD's own precedent — `hudStore.ts`,
 * `comfortStore.ts` — is `useSyncExternalStore` + `localStorage` instead of Zustand,
 * and there's no query-string routing layer set up yet to hang nuqs off). Persisted
 * choice only, for now; URL-shareable scenery is a real follow-up, not this one.
 *
 * Switching sceneries is a full `Engine` dispose + reconstruct (`EngineCanvas` remounts
 * on `sceneryId` change) rather than an in-place hot-swap — terrain, water, scatter,
 * and audio assets differ per archetype, and none of that machinery was built to be
 * torn down and rebuilt piecemeal while live. A clean remount is a few seconds of
 * reload, not a maintenance burden of a second code path for "swap scenery in place."
 */

const STORAGE_KEY = 'chill.scenery.v1'

function loadPersisted(): SceneryId {
  if (typeof window === 'undefined') return DEFAULT_SCENERY_ID
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw && raw in SCENERY_REGISTRY ? (raw as SceneryId) : DEFAULT_SCENERY_ID
  } catch {
    return DEFAULT_SCENERY_ID
  }
}

let state: SceneryId = loadPersisted()
const listeners = new Set<() => void>()

export function setSceneryId(id: SceneryId): void {
  state = id
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Private browsing / quota — the choice just doesn't survive a reload. Not fatal.
  }
  listeners.forEach((l) => l())
  announceLanScenery(id)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getServerSnapshot = (): SceneryId => DEFAULT_SCENERY_ID

export function useSceneryId(): SceneryId {
  return useSyncExternalStore(subscribe, () => state, getServerSnapshot)
}
