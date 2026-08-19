'use client'

import React, { useEffect, useState, useRef } from 'react'
import type { EngineCommand } from '@/engine/core/Engine'
import type { PropType } from '@/engine/props/PropField'
import { generateSignpostPoem } from '@/lib/ai/localAi'

interface PropItem {
  type: PropType
  key: string
  name: string
  desc: string
  icon: React.ReactNode
}

const PROP_ITEMS: PropItem[] = [
  {
    type: 'campfire',
    key: '1',
    name: 'กองไฟ',
    desc: 'กองไฟอบอุ่น',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        className="h-4 w-4 text-white/80"
      >
        <path
          d="M12 3c1 3-2 5-2 8a4 4 0 008 0c0-3-3-5-2-8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M5 21l14-4M19 21L5 17" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: 'firework',
    key: '2',
    name: 'ดอกไม้ไฟ',
    desc: 'พลุสว่างไสว',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        className="h-4 w-4 text-white/80"
      >
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4" strokeLinecap="round" />
        <path
          d="M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    type: 'sign',
    key: '3',
    name: 'ป้ายไม้',
    desc: 'ข้อความกำหนดเอง',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        className="h-4 w-4 text-white/80"
      >
        <rect
          x="4"
          y="4"
          width="16"
          height="10"
          rx="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 14v7" strokeLinecap="round" />
        <path d="M8 8h8M8 11h5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: 'lantern',
    key: '4',
    name: 'โคมไฟหิน',
    desc: 'โคมไฟสวนญี่ปุ่น',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        className="h-4 w-4 text-white/80"
      >
        <path d="M7 8h10l-2-3H9L7 8z" strokeLinejoin="round" />
        <rect x="8" y="8" width="8" height="8" rx="1" strokeLinecap="round" />
        <path d="M12 16v5M9 21h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: 'bench',
    key: '5',
    name: 'ม้านั่งไม้',
    desc: 'ที่นั่งพักผ่อน',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        className="h-4 w-4 text-white/80"
      >
        <rect x="3" y="10" width="18" height="4" rx="1" strokeLinecap="round" />
        <path d="M6 14v6M18 14v6" strokeLinecap="round" strokeWidth={1.8} />
      </svg>
    ),
  },
  {
    type: 'tent',
    key: '6',
    name: 'เต็นท์แคมป์',
    desc: 'ที่พักผ่อน',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        className="h-4 w-4 text-white/80"
      >
        <path d="M19 21L12 4 5 21" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 4v17M8 21l4-7 4 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: 'tea_table',
    key: '7',
    name: 'โต๊ะน้ำชา',
    desc: 'โต๊ะนั่งจิบชา',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        className="h-4 w-4 text-white/80"
      >
        <rect x="4" y="11" width="16" height="3" rx="1" strokeLinecap="round" />
        <path d="M6 14v4M18 14v4M10 8h4M12 5v3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: 'sakura_pot',
    key: '8',
    name: 'บอนไซซากุระ',
    desc: 'กระถางซากุระ',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        className="h-4 w-4 text-white/80"
      >
        <path d="M12 18v-5M9 13c0-3 3-5 3-5s3 2 3 5" strokeLinecap="round" />
        <path d="M7 18h10l-1 3H8l-1-3z" strokeLinejoin="round" />
        <circle cx="12" cy="7" r="3" fill="currentColor" fillOpacity={0.2} />
      </svg>
    ),
  },
  {
    type: 'quote_billboard',
    key: 'B',
    name: 'ป้ายคำคมประจำวัน',
    desc: 'ป้ายข้อความ AI',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        className="h-4 w-4 text-white/80"
      >
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20l4-4 4 4M12 16v4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export function PropPaletteModal({
  onClose,
  command,
}: {
  onClose: () => void
  command?: (cmd: EngineCommand) => void
}) {
  const [signInputOpen, setSignInputOpen] = useState(false)
  const [signText, setSignText] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handlePlace = (type: PropType, text?: string) => {
    command?.({ type: 'placeProp', propType: type, text })
    if (type === 'sign') {
      setSignInputOpen(false)
      setSignText('')
    }
    onClose()
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (signInputOpen) return

      if (e.code === 'Digit1') {
        handlePlace('campfire')
      } else if (e.code === 'Digit2') {
        handlePlace('firework')
      } else if (e.code === 'Digit3') {
        setSignInputOpen(true)
      } else if (e.code === 'Digit4') {
        handlePlace('lantern')
      } else if (e.code === 'Digit5') {
        handlePlace('bench')
      } else if (e.code === 'Digit6') {
        handlePlace('tent')
      } else if (e.code === 'Digit7') {
        handlePlace('tea_table')
      } else if (e.code === 'Digit8') {
        handlePlace('sakura_pot')
      } else if (e.code === 'KeyB') {
        handlePlace('quote_billboard')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, signInputOpen])

  useEffect(() => {
    if (signInputOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [signInputOpen])

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="animate-in fade-in zoom-in-95 fixed bottom-24 left-1/2 z-40 flex w-92.5 -translate-x-1/2 flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/90 p-3 text-white shadow-2xl backdrop-blur-xl duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-1 pb-1.5">
          <span className="text-[11px] font-medium tracking-wider text-white/50 uppercase">
            วางสิ่งของ (Place Prop)
          </span>
          <span className="font-mono text-[10px] text-white/40">1-8 · B</span>
        </div>

        {signInputOpen ? (
          <div className="animate-in fade-in flex flex-col gap-2 rounded-xl border border-white/10 bg-white/4 p-2.5 duration-100">
            <div className="flex items-center justify-between text-[11px] text-white/70">
              <span>ข้อความบนป้าย:</span>
              <button
                type="button"
                onClick={() => setSignInputOpen(false)}
                className="text-[10px] text-white/40 hover:text-white"
              >
                ยกเลิก
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                maxLength={60}
                value={signText}
                onChange={(e) => setSignText(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    handlePlace('sign', signText)
                  } else if (e.key === 'Escape') {
                    setSignInputOpen(false)
                  }
                }}
                onKeyUp={(e) => e.stopPropagation()}
                placeholder="พิมพ์ข้อความบนป้าย..."
                className="flex-1 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
              />
              <button
                type="button"
                disabled={aiGenerating}
                onClick={async () => {
                  setAiGenerating(true)
                  try {
                    const poem = await generateSignpostPoem()
                    setSignText(poem)
                  } finally {
                    setAiGenerating(false)
                  }
                }}
                title="สร้างกลอน / ข้อความด้วย AI"
                className="border-glass-edge hover:bg-glass-foreground/15 text-glass-foreground flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition active:scale-95 disabled:opacity-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  className="h-3.5 w-3.5"
                >
                  <path
                    d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                    strokeLinecap="round"
                  />
                </svg>
                <span>{aiGenerating ? '…' : 'กลอน AI'}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => handlePlace('sign', signText)}
              className="w-full rounded-lg bg-white/15 py-1.5 text-[11px] font-medium text-white transition hover:bg-white/25 active:scale-95"
            >
              ปักป้ายข้อความ (Enter)
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {PROP_ITEMS.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => {
                  if (item.type === 'sign') {
                    setSignInputOpen(true)
                  } else {
                    handlePlace(item.type)
                  }
                }}
                className="group relative flex flex-col items-center justify-center rounded-xl border border-transparent bg-white/3 p-2 text-center transition hover:border-white/15 hover:bg-white/8 active:bg-white/12"
              >
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded border border-white/10 bg-white/8 font-mono text-[9px] font-semibold text-white/60 transition group-hover:bg-white/18 group-hover:text-white">
                  {item.key}
                </span>
                <div className="mb-1 text-white/70 transition-transform duration-150 group-hover:scale-110 group-hover:text-white">
                  {item.icon}
                </div>
                <span className="w-full truncate text-[11px] font-medium text-white/90 group-hover:text-white">
                  {item.name}
                </span>
                <span className="w-full truncate text-[9px] leading-tight text-white/40">
                  {item.desc}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
