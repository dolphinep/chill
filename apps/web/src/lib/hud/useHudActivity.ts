import { useEffect, useState } from 'react'

/**
 * Ambient/active: chrome is a guest, not a resident. `false` (active) on any input;
 * `true` (ambient — chrome fades to zero) after 8s of none, or immediately on blur.
 *
 * The plan's other ambient rule — "suppressed while any HUD element has focus" — has no
 * focusable HUD element yet (no settings panel, no palette); there is nothing to wire
 * that guard to until one exists, so it is not implemented rather than implemented
 * against nothing.
 */

const AMBIENT_AFTER_MS = 8000

export function useHudActivity(): { ambient: boolean } {
  const [ambient, setAmbient] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const wake = () => {
      setAmbient(false)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setAmbient(true), AMBIENT_AFTER_MS)
    }
    const sleep = () => {
      if (timer) clearTimeout(timer)
      setAmbient(true)
    }

    const onVisibility = () => {
      if (document.hidden) sleep()
    }

    wake()
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }))
    window.addEventListener('blur', sleep)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (timer) clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, wake))
      window.removeEventListener('blur', sleep)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return { ambient }
}
