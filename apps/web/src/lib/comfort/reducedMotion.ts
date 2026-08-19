/**
 * `prefers-reduced-motion` as a behavioural contract, not a CSS switch (plan, Accessibility
 * & comfort) — the engine reads the OS signal directly and turns down water/foliage
 * amplitude by half. No react/next import: `engine/` needs to call this directly, and
 * `engine/` is ESLint-forbidden from importing anything that pulls React into its module
 * graph (same reasoning as `lib/audio/context.ts`).
 */

const QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(QUERY).matches
}

/** Fires on every OS-level change for as long as the app stays open — the contract holds
 * even if the setting flips mid-session, not just at load. */
export function subscribeReducedMotion(listener: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mql = window.matchMedia(QUERY)
  const handler = () => listener(mql.matches)
  mql.addEventListener('change', handler)
  return () => mql.removeEventListener('change', handler)
}
