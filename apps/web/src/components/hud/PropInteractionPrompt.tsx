import React, { useEffect, useState } from 'react'
import type { EngineCommand } from '@/engine/core/Engine'
import type { EngineEvents } from '@/engine/core/EngineEventBus'
import {
  checkChromePromptAiReady,
  type ChromePromptAiStatus,
  generateDailyAdultQuote,
  type QuoteCategory,
} from '@/lib/ai/localAi'
import { ChromeAiGuide } from './ChromeAiGuide'

export function PropInteractionPrompt({
  nearbyProp,
  command,
}: {
  nearbyProp: EngineEvents['nearbyProp']
  command?: (cmd: EngineCommand) => void
}) {
  const [readingSign, setReadingSign] = useState<{ text?: string; authorName?: string } | null>(
    null,
  )

  // Daily Quote Billboard Dialog state
  const [billboardOpen, setBillboardOpen] = useState<{
    propId: string
    text?: string
    authorName?: string
  } | null>(null)
  const [activeCategory, setActiveCategory] = useState<QuoteCategory>('all')
  const [isGeneratingQuote, setIsGeneratingQuote] = useState(false)
  const [isEditingQuote, setIsEditingQuote] = useState(false)
  const [customQuoteText, setCustomQuoteText] = useState('')
  const [aiStatus, setAiStatus] = useState<ChromePromptAiStatus | null>(null)
  const [showAiGuide, setShowAiGuide] = useState(false)

  useEffect(() => {
    if (billboardOpen) {
      void checkChromePromptAiReady().then(setAiStatus)
    }
  }, [billboardOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const active =
        typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
      if (
        (target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)) ||
        (active &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable))
      ) {
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.code === 'Escape') {
        if (readingSign) {
          setReadingSign(null)
          return
        }
        if (billboardOpen) {
          setBillboardOpen(null)
          setIsEditingQuote(false)
          return
        }
        if (nearbyProp?.type === 'volleyball_court' && nearbyProp.myTeam) {
          command?.({
            type: 'volleyballAction',
            courtId: nearbyProp.id,
            action: 'leave',
          })
          return
        }
        if (nearbyProp?.type === 'skeet_stand') {
          command?.({ type: 'skeetAction', action: 'reset' })
          return
        }
      }

      if (e.code === 'KeyF' && nearbyProp?.type === 'volleyball_court') {
        e.preventDefault()
        command?.({
          type: 'volleyballAction',
          courtId: nearbyProp.id,
          action: 'hit',
          spike: true,
        })
        return
      }

      if (e.code === 'KeyG' && nearbyProp) {
        e.preventDefault()
        if (nearbyProp.type === 'quote_billboard') {
          setBillboardOpen({
            propId: nearbyProp.id,
            text: nearbyProp.text,
            authorName: nearbyProp.authorName,
          })
          setIsEditingQuote(false)
        } else if (nearbyProp.type === 'skeet_stand') {
          command?.({ type: 'skeetAction', action: 'start' })
        } else if (nearbyProp.type === 'sign') {
          setReadingSign({ text: nearbyProp.text, authorName: nearbyProp.authorName })
        } else if (nearbyProp.type === 'bench' || nearbyProp.type === 'tent') {
          command?.({ type: 'sitOnProp', propId: nearbyProp.id })
        } else if (nearbyProp.type === 'tea_table') {
          command?.({
            type: 'sitOnProp',
            propId: nearbyProp.id,
            seatIndex: nearbyProp.seatIndex ?? 0,
          })
        } else if (nearbyProp.type === 'volleyball_court') {
          if (!nearbyProp.myTeam) {
            command?.({
              type: 'volleyballAction',
              courtId: nearbyProp.id,
              action: 'join',
              team: nearbyProp.teamSide ?? 'red',
            })
          } else {
            command?.({
              type: 'volleyballAction',
              courtId: nearbyProp.id,
              action: 'start',
            })
          }
        } else {
          command?.({ type: 'interactProp', propId: nearbyProp.id })
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nearbyProp, readingSign, billboardOpen, command])

  // Clear modals if player walks away. Adjusted during render, not in an effect —
  // `nearbyProp` only changes reference when the engine's own dedup (`nearbyKey` in
  // `Engine.ts`) says something meaningful changed, so this only fires on a real
  // transition, not every poll. See https://react.dev/learn/you-might-not-need-an-effect
  const [prevNearbyProp, setPrevNearbyProp] = useState(nearbyProp)
  if (nearbyProp !== prevNearbyProp) {
    setPrevNearbyProp(nearbyProp)
    if (!nearbyProp) {
      if (readingSign) setReadingSign(null)
      if (billboardOpen) setBillboardOpen(null)
    }
  }

  // 1. Signpost Reading Dialog Modal
  if (readingSign) {
    return (
      <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm duration-150">
        <div
          className="glass relative flex w-full max-w-sm flex-col gap-3 p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-glass-edge flex items-center justify-between border-b pb-2">
            <h3 className="text-glass-foreground text-[13px] font-medium">Signpost</h3>
            <button
              type="button"
              onClick={() => {
                setReadingSign(null)
              }}
              aria-label="Close"
              className="text-glass-faint hover:text-glass-foreground p-1 transition"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-4 w-4"
              >
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-2 py-1">
            <p className="text-glass-foreground text-sm leading-relaxed font-medium">
              &ldquo;{readingSign.text || 'Cozy Spot'}&rdquo;
            </p>
            {readingSign.authorName && (
              <span className="text-glass-faint text-[11px] italic">
                — {readingSign.authorName}
              </span>
            )}
          </div>

          <div className="border-glass-edge flex items-center justify-end gap-2 border-t pt-2">
            <button
              type="button"
              onClick={() => {
                setReadingSign(null)
              }}
              className="border-glass-edge hover:bg-glass-foreground/10 text-glass-faint hover:text-glass-foreground rounded-md border px-3 py-1.5 text-xs transition"
            >
              Close (Esc)
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 2. Large Daily Quote Billboard Modal
  if (billboardOpen) {
    const currentQuote = billboardOpen.text || 'Work hard, rest well, and take a moment to breathe.'

    const categories: { key: QuoteCategory; label: string }[] = [
      { key: 'all', label: 'All' },
      { key: 'working', label: 'Work & Life' },
      { key: 'teen', label: 'Youth & Ambition' },
      { key: 'burnout', label: 'Mindfulness' },
      { key: 'funny', label: 'Witty' },
    ]

    const isAiReady = !!aiStatus?.isAvailable

    return (
      <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm duration-150">
        <div
          className="glass relative flex w-full max-w-lg flex-col gap-3.5 p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-glass-edge flex items-center justify-between border-b pb-2">
            <div>
              <h3 className="text-glass-foreground text-[13px] font-medium">
                Daily Inspiration Billboard
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setBillboardOpen(null)
                setIsEditingQuote(false)
                setShowAiGuide(false)
              }}
              aria-label="Close"
              className="text-glass-faint hover:text-glass-foreground p-1 transition"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-4 w-4"
              >
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* AI Enablement Warning & Instructions Guide */}
          {!isAiReady && (
            <ChromeAiGuide
              aiStatus={aiStatus}
              show={showAiGuide}
              onToggle={() => setShowAiGuide((v) => !v)}
            />
          )}

          {/* Quote Card */}
          <div className="border-glass-edge bg-glass-foreground/5 relative flex flex-col gap-2 rounded-xl border p-4 text-center">
            <p className="text-glass-foreground text-sm leading-relaxed font-medium">
              {isGeneratingQuote ? (
                <span className="text-glass-muted animate-pulse">
                  Generating fresh quote with AI…
                </span>
              ) : (
                `“${currentQuote}”`
              )}
            </p>

            <div className="text-glass-faint text-[11px] italic">
              {billboardOpen.authorName || '— Chill Daily Billboard'}
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveCategory(cat.key)}
                className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                  activeCategory === cat.key
                    ? 'border-glass-fg bg-glass-foreground/20 text-glass-foreground font-semibold'
                    : 'border-glass-edge text-glass-faint hover:text-glass-foreground hover:bg-glass-foreground/5'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Custom Edit Input */}
          {isEditingQuote && (
            <div className="flex w-full items-center gap-2 pt-1">
              <input
                type="text"
                maxLength={85}
                value={customQuoteText}
                onChange={(e) => setCustomQuoteText(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter' && customQuoteText.trim()) {
                    command?.({
                      type: 'updatePropText',
                      propId: billboardOpen.propId,
                      text: customQuoteText.trim(),
                      authorName: 'Written by Player',
                    })
                    setBillboardOpen((prev) =>
                      prev
                        ? {
                            ...prev,
                            text: customQuoteText.trim(),
                            authorName: 'Written by Player',
                          }
                        : null,
                    )
                    setIsEditingQuote(false)
                  }
                }}
                placeholder="Type custom quote..."
                className="border-glass-edge bg-glass-foreground/5 text-glass-foreground placeholder:text-glass-faint flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (customQuoteText.trim()) {
                    command?.({
                      type: 'updatePropText',
                      propId: billboardOpen.propId,
                      text: customQuoteText.trim(),
                      authorName: 'Written by Player',
                    })
                    setBillboardOpen((prev) =>
                      prev
                        ? {
                            ...prev,
                            text: customQuoteText.trim(),
                            authorName: 'Written by Player',
                          }
                        : null,
                    )
                  }
                  setIsEditingQuote(false)
                }}
                className="border-glass-edge hover:bg-glass-foreground/15 text-glass-foreground rounded-lg border px-3 py-1.5 text-xs font-medium"
              >
                Save
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="border-glass-edge flex items-center justify-between border-t pt-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isGeneratingQuote}
                onClick={async () => {
                  setIsGeneratingQuote(true)
                  try {
                    const res = await generateDailyAdultQuote(activeCategory, !isAiReady)
                    command?.({
                      type: 'updatePropText',
                      propId: billboardOpen.propId,
                      text: res.quote,
                      authorName: res.categoryLabel,
                    })
                    setBillboardOpen((prev) =>
                      prev
                        ? {
                            ...prev,
                            text: res.quote,
                            authorName: res.categoryLabel,
                          }
                        : null,
                    )
                  } catch {
                    setShowAiGuide(true)
                  } finally {
                    setIsGeneratingQuote(false)
                  }
                }}
                className="border-glass-edge hover:bg-glass-foreground/15 text-glass-foreground flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition active:scale-95 disabled:opacity-50"
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
                <span>
                  {isGeneratingQuote
                    ? 'Generating…'
                    : isAiReady
                      ? 'AI New Quote'
                      : 'New Quote'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCustomQuoteText(billboardOpen.text || '')
                  setIsEditingQuote((v) => !v)
                }}
                className="border-glass-edge hover:bg-glass-foreground/10 text-glass-faint hover:text-glass-foreground rounded-md border px-2.5 py-1.5 text-xs transition"
              >
                Edit
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setBillboardOpen(null)
                setIsEditingQuote(false)
                setShowAiGuide(false)
              }}
              className="border-glass-edge hover:bg-glass-foreground/10 text-glass-faint hover:text-glass-foreground rounded-md border px-3 py-1.5 text-xs transition"
            >
              Close (Esc)
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!nearbyProp) return null

  // Dedicated Skeet Shooting Range HUD
  if (nearbyProp.type === 'skeet_stand') {
    const isProgress = nearbyProp.matchState === 'in_rally'
    const isGameOver = nearbyProp.matchState === 'game_over'
    const wave = nearbyProp.skeetWave ?? 1
    const totalWaves = nearbyProp.skeetTotalWaves ?? 10
    const hits = nearbyProp.skeetHits ?? 0
    const total = nearbyProp.skeetTotal ?? 0
    const acc = total > 0 ? Math.round((hits / total) * 100) : 0

    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 pointer-events-auto fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2 duration-150">
        {/* Live Skeet Stats Billboard */}
        <div className="flex items-center gap-3 rounded-full border border-orange-500/40 bg-slate-950/90 px-4 py-1.5 text-white shadow-2xl backdrop-blur-xl">
          <span className="text-xs font-bold tracking-wide text-orange-400">SKEET SHOOTING</span>
          {isProgress && (
            <>
              <span className="text-xs text-white/40">·</span>
              <span className="text-xs font-medium text-amber-300">
                WAVE {wave}/{totalWaves}
              </span>
              <span className="text-xs text-white/40">·</span>
              <span className="text-xs font-bold text-emerald-400">
                HITS {hits}/{total} ({acc}%)
              </span>
            </>
          )}
          {isGameOver && (
            <>
              <span className="text-xs text-white/40">·</span>
              <span className="text-xs font-bold text-yellow-300">
                FINAL: {hits}/{total} ({acc}%)
              </span>
            </>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!isProgress ? (
            <button
              type="button"
              onClick={() => {
                command?.({ type: 'skeetAction', action: 'start' })
              }}
              className="group flex items-center gap-2.5 rounded-full border border-orange-500/40 bg-orange-950/80 px-5 py-2.5 text-white shadow-2xl backdrop-blur-xl transition hover:bg-orange-900/90 active:scale-95"
            >
              <span className="text-xs font-medium tracking-wide text-white/90 group-hover:text-white">
                {isGameOver ? 'Play Again (10 Waves)' : 'Start Shootout (10 Waves)'}
              </span>
              <span className="flex h-5 w-5 items-center justify-center rounded-md border border-white/30 bg-white/20 font-mono text-[10px] font-bold text-white">
                G
              </span>
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-full border border-orange-500/30 bg-slate-950/85 px-4 py-2 text-white shadow-2xl backdrop-blur-xl">
                <span className="text-xs text-orange-200">
                  Left-Click or [F] to Throw Sandballs at Flying Clays
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  command?.({ type: 'skeetAction', action: 'reset' })
                }}
                className="group flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/70 px-3 py-2 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95"
              >
                <span>Stop</span>
                <span className="font-mono text-[9px] text-white/40">(Esc)</span>
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Dedicated Volleyball Court HUD
  if (nearbyProp.type === 'volleyball_court') {
    const isJoined = Boolean(nearbyProp.myTeam)
    const side = nearbyProp.teamSide ?? 'red'
    const teamName = side === 'blue' ? 'Blue' : 'Red'
    const isRally = nearbyProp.matchState === 'in_rally'
    const isGameOver = nearbyProp.matchState === 'game_over'

    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 pointer-events-auto fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2 duration-150">
        {/* Live Score Billboard */}
        <div className="flex items-center gap-3 rounded-full border border-sky-400/30 bg-slate-950/90 px-4 py-1.5 text-white shadow-2xl backdrop-blur-xl">
          <span className="text-xs font-bold tracking-wide text-rose-400">
            RED {nearbyProp.scoreRed ?? 0}
          </span>
          <span className="text-xs text-white/40">vs</span>
          <span className="text-xs font-bold tracking-wide text-sky-400">
            {nearbyProp.scoreBlue ?? 0} BLUE
          </span>
          {isGameOver && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
              WIN: {nearbyProp.winner?.toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isJoined ? (
            <button
              type="button"
              onClick={() => {
                command?.({
                  type: 'volleyballAction',
                  courtId: nearbyProp.id,
                  action: 'join',
                  team: side,
                })
              }}
              className="group flex items-center gap-2.5 rounded-full border border-rose-500/30 bg-slate-950/85 px-4 py-2 text-white shadow-2xl backdrop-blur-xl transition hover:bg-slate-900/90 active:scale-95"
            >
              <span className="text-xs font-medium tracking-wide text-white/90 group-hover:text-white">
                Join Team {teamName}
              </span>
              <span className="flex h-5 w-5 items-center justify-center rounded-md border border-white/30 bg-white/20 font-mono text-[10px] font-bold text-white">
                G
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  command?.({
                    type: 'volleyballAction',
                    courtId: nearbyProp.id,
                    action: 'start',
                  })
                }}
                className="group flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/80 px-4 py-2 text-emerald-100 shadow-2xl backdrop-blur-xl transition hover:bg-emerald-900/90 active:scale-95"
              >
                <span className="text-sm">{isRally ? '⚡' : '▶'}</span>
                <span className="text-xs font-medium tracking-wide">
                  {isGameOver
                    ? 'Start Next Set'
                    : isRally
                      ? 'Rally in progress'
                      : 'Start Match (5 Pts)'}
                </span>
                <span className="flex h-5 w-5 items-center justify-center rounded-md border border-white/30 bg-white/20 font-mono text-[10px] font-bold text-white">
                  G
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  command?.({
                    type: 'volleyballAction',
                    courtId: nearbyProp.id,
                    action: 'hit',
                    spike: true,
                  })
                }}
                className="group flex items-center gap-2 rounded-full border border-sky-500/30 bg-slate-950/85 px-3.5 py-2 text-white shadow-2xl backdrop-blur-xl transition hover:bg-slate-900/90 active:scale-95"
              >
                <span className="text-xs font-medium tracking-wide text-white/90">Spike</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-md border border-white/30 bg-white/20 font-mono text-[10px] font-bold text-white">
                  F
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  command?.({
                    type: 'volleyballAction',
                    courtId: nearbyProp.id,
                    action: 'leave',
                  })
                }}
                className="group flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/70 px-3 py-2 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95"
              >
                <span>Leave</span>
                <span className="font-mono text-[9px] text-white/40">(Esc)</span>
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  let actionLabel = 'Interact'
  const hotkey = 'G'

  if (nearbyProp.type === 'campfire') {
    actionLabel = nearbyProp.active ? 'Extinguish Campfire' : 'Light Campfire'
  } else if (nearbyProp.type === 'lantern') {
    actionLabel = nearbyProp.active ? 'Turn Off Lantern' : 'Turn On Lantern'
  } else if (nearbyProp.type === 'bench') {
    actionLabel = 'Sit on Bench'
  } else if (nearbyProp.type === 'tent') {
    actionLabel = 'Sit in Tent'
  } else if (nearbyProp.type === 'tea_table') {
    actionLabel = `Sit on Cushion ${nearbyProp.seatIndex === 1 ? '(Right)' : '(Left)'}`
  } else if (nearbyProp.type === 'sakura_pot') {
    actionLabel = 'Admire Sakura'
  } else if (nearbyProp.type === 'firework') {
    actionLabel = 'Launch Firework'
  } else if (nearbyProp.type === 'sign') {
    actionLabel = 'Read Sign'
  } else if (nearbyProp.type === 'companion') {
    actionLabel = 'Talk / Pet Companion'
  } else if (nearbyProp.type === 'quote_billboard') {
    actionLabel = 'Daily Quote Billboard'
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 pointer-events-auto fixed bottom-24 left-1/2 z-30 -translate-x-1/2 duration-150">
      <button
        type="button"
        onClick={() => {
          if (nearbyProp.type === 'quote_billboard') {
            setBillboardOpen({
              propId: nearbyProp.id,
              text: nearbyProp.text,
              authorName: nearbyProp.authorName,
            })
            setIsEditingQuote(false)
          } else if (nearbyProp.type === 'sign') {
            setReadingSign({ text: nearbyProp.text, authorName: nearbyProp.authorName })
          } else if (nearbyProp.type === 'bench' || nearbyProp.type === 'tent') {
            command?.({ type: 'sitOnProp', propId: nearbyProp.id })
          } else if (nearbyProp.type === 'tea_table') {
            command?.({
              type: 'sitOnProp',
              propId: nearbyProp.id,
              seatIndex: nearbyProp.seatIndex ?? 0,
            })
          } else {
            command?.({ type: 'interactProp', propId: nearbyProp.id })
          }
        }}
        className="glass group text-glass-foreground flex items-center gap-2 px-3.5 py-1.5 text-xs shadow-lg transition active:scale-95"
      >
        <span className="font-medium tracking-wide">{actionLabel}</span>
        <span className="border-glass-edge bg-glass-foreground/15 text-glass-foreground flex h-4.5 min-w-4.5 items-center justify-center rounded px-1 font-mono text-[10px] font-bold">
          {hotkey}
        </span>
      </button>
    </div>
  )
}
