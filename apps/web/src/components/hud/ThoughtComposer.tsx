'use client'

import { useEffect, useRef, useState } from 'react'
import { graphemeCount, MAX_GRAPHEMES, truncateGraphemes } from '@/lib/thoughts/graphemes'
import { useHudActivity } from '@/lib/hud/useHudActivity'
import { useHudHidden } from '@/lib/hud/hudStore'

/**
 * "A message in a bottle, not a tweet." Bottom-centre, collapsed to a hairline until `T`
 * expands it — the plan's own framing for where this sits in the HUD.
 *
 * v0.1 is local-only: no daily moon meter (that's a shared-quota concept, and solo rooms
 * have no quota per the plan), no server round-trip. "Cooldown" here is purely "your own
 * previous thought hasn't finished dissolving yet" — `ThoughtField`'s one-bloom-per-author
 * rule — shown as a calm caption rather than a literal progress bar, since there's no
 * single well-defined "full" duration to measure it against (it's whichever of the 2.5s
 * calm-limiter gate or the ~90s decay gate is still open).
 *
 * Takes a plain `cooldownS`/`onSubmit` rather than `EngineCommand`/`stats` on purpose —
 * the plan calls for "the same thought feed" in Still mode, which has no `Engine`
 * instance at all. Keeping this component's contract engine-agnostic is what makes it
 * literally the same component in both places instead of a near-duplicate.
 */

export function ThoughtComposer({
  cooldownS,
  onSubmit,
}: {
  cooldownS: number
  onSubmit: (text: string) => void
}) {
  const hidden = useHudHidden()
  const { ambient } = useHudActivity()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open) return
      if (e.code !== 'KeyT' || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function close(): void {
    setOpen(false)
    setText('')
  }

  function submit(): void {
    // `cooldownS` only gates when `ThoughtField` *blooms* a post, not whether it can be
    // queued — blocking the send here too would make "still lingering…" silently
    // swallow the post instead of it waiting its turn, defeating the point of having a
    // pending queue at all.
    const trimmed = text.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    close()
  }

  if (hidden) return null

  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 transition-opacity duration-300 ease-out"
      style={{ opacity: open || !ambient ? 1 : 0 }}
    >
      {open ? (
        <div className="glass flex w-80 flex-col gap-2 p-3">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(truncateGraphemes(e.target.value, MAX_GRAPHEMES))}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
              if (e.key === 'Enter') submit()
            }}
            placeholder="Leave a thought…"
            className="font-thought text-glass-foreground w-full bg-transparent text-sm outline-none placeholder:text-glass-faint"
          />
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-glass-faint">
              {cooldownS > 0 ? 'still lingering…' : 'Enter to send · Esc to cancel'}
            </span>
            <span className="text-glass-muted">
              {graphemeCount(text)}/{MAX_GRAPHEMES}
            </span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-glass-faint pointer-events-auto text-[13px]"
        >
          T to leave a thought
        </button>
      )}
    </div>
  )
}
