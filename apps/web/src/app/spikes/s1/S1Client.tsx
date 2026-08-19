'use client'

import dynamic from 'next/dynamic'

/**
 * The `ssr: false` boundary. Next forbids this in a Server Component, so it must be
 * called from inside a Client Component — this file exists purely for that rule.
 */
const S1Scene = dynamic(() => import('./S1Scene').then((m) => m.S1Scene), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="text-glass-faint text-sm">loading engine…</p>
    </div>
  ),
})

export function S1Client() {
  return <S1Scene />
}
