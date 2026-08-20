'use client'

import { useEffect } from 'react'

/**
 * "Never `play()` while suspended... show one small glass pill bottom-right... one click
 * fades the bed in over 3s. Never nags, never modals."
 *
 * Also unlocks on the first real pointerdown/keydown anywhere — WASD-ing or dragging to
 * look is already a user gesture, so most people never actually see this long enough to
 * read it. The click affordance is the fallback for someone who lands and just watches.
 */

export function AutoplayPill({ unlocked, onUnlock }: { unlocked: boolean; onUnlock: () => void }) {
  useEffect(() => {
    if (unlocked) return
    window.addEventListener('pointerdown', onUnlock, { once: true })
    window.addEventListener('keydown', onUnlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', onUnlock)
      window.removeEventListener('keydown', onUnlock)
    }
  }, [unlocked, onUnlock])

  return (
    <button
      type="button"
      onClick={onUnlock}
      aria-hidden={unlocked}
      tabIndex={unlocked ? -1 : 0}
      className="glass text-glass-foreground absolute right-6 bottom-6 flex items-center gap-2 px-4 py-2.5 text-xs transition-opacity duration-500 ease-out"
      style={{ opacity: unlocked ? 0 : 1, pointerEvents: unlocked ? 'none' : 'auto' }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        className="audio-pill-breathe h-3.5 w-3.5"
      >
        <path d="M4 9v6h3l5 4V5L7 9H4Z" fill="currentColor" stroke="none" />
        <path d="M16 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
        <path d="M18.5 6a8.5 8.5 0 0 1 0 12" strokeLinecap="round" opacity={0.6} />
      </svg>
      sound is ready
    </button>
  )
}
