import { useSyncExternalStore } from 'react'
import { type ChibiAvatarConfig, DEFAULT_AVATAR_CONFIG } from './avatarConfig'
export type { ChibiAvatarConfig }

const STORAGE_KEY = 'chill_chibi_avatar_config'

function loadPersistedConfig(): ChibiAvatarConfig {
  if (typeof window === 'undefined') return DEFAULT_AVATAR_CONFIG
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_AVATAR_CONFIG
    const parsed = JSON.parse(raw) as Partial<ChibiAvatarConfig>
    return { ...DEFAULT_AVATAR_CONFIG, ...parsed }
  } catch {
    return DEFAULT_AVATAR_CONFIG
  }
}

let currentConfig: ChibiAvatarConfig = loadPersistedConfig()
const listeners = new Set<() => void>()

export function getAvatarConfig(): ChibiAvatarConfig {
  return currentConfig
}

export function updateAvatarConfig(next: Partial<ChibiAvatarConfig>): ChibiAvatarConfig {
  currentConfig = { ...currentConfig, ...next }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(currentConfig))
  } catch {
    // Ignore quota/private mode errors
  }
  listeners.forEach((l) => l())
  return currentConfig
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getServerSnapshot = (): ChibiAvatarConfig => DEFAULT_AVATAR_CONFIG

export function useAvatarConfig(): ChibiAvatarConfig {
  return useSyncExternalStore(subscribe, () => currentConfig, getServerSnapshot)
}
