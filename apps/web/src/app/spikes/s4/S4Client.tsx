'use client'

import dynamic from 'next/dynamic'

const S4Scene = dynamic(() => import('./S4Scene').then((m) => m.S4Scene), {
  ssr: false,
  loading: () => <p className="text-glass-faint p-8 text-sm">loading engine…</p>,
})

export function S4Client() {
  return <S4Scene />
}
