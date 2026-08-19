'use client'

import dynamic from 'next/dynamic'

const S57Scene = dynamic(() => import('./S57Scene').then((m) => m.S57Scene), {
  ssr: false,
  loading: () => <p className="text-glass-faint p-8 text-sm">loading engine…</p>,
})

export function S57Client() {
  return <S57Scene />
}
