'use client'

import dynamic from 'next/dynamic'

const S3Scene = dynamic(() => import('./S3Scene').then((m) => m.S3Scene), {
  ssr: false,
  loading: () => <p className="text-glass-faint p-8 text-sm">loading engine…</p>,
})

export function S3Client() {
  return <S3Scene />
}
