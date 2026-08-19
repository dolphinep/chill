'use client'

import dynamic from 'next/dynamic'

const S2Check = dynamic(() => import('./S2Check').then((m) => m.S2Check), {
  ssr: false,
  loading: () => <p className="text-glass-faint p-8 text-sm">loading engine…</p>,
})

export function S2Client() {
  return <S2Check />
}
