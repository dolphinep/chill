'use client'

import { useEffect, useRef, useState } from 'react'
import type { EngineCommand } from '@/engine/core/Engine'
import { graphemeCount, MAX_GRAPHEMES, truncateGraphemes } from '@/lib/thoughts/graphemes'
import { useLanSession, type ChatMessage } from '@/lib/lan/lanSessionStore'

const QUICK_PHRASES = [
  '👋 Hello!',
  '✨ So cozy~',
  '⛷️ Let’s ski!',
  '🏐 Volleyball match!',
  '🍵 Tea by the fire',
  '💖 Thank you!',
]

const PLAYER_COLORS = [
  'text-[#f2c879]', // Warm Gold
  'text-cyan-300',   // Sky Cyan
  'text-pink-300',   // Sakura Pink
  'text-emerald-300',// Mint Green
  'text-purple-300', // Lavender
  'text-amber-300',  // Warm Amber
  'text-rose-300',   // Coral Rose
]

function getPlayerColor(sid: number): string {
  return PLAYER_COLORS[Math.abs(sid) % PLAYER_COLORS.length] || 'text-[#f2c879]'
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Enhanced Real-time Multiplayer Chat with:
 * - Enter shortcut to open & focus
 * - Unread message notifications & Toast Preview
 * - Quick Action Emotes
 * - Distinct player badges & Starry Night styling
 */
export function LanChat({ command }: { command: (cmd: EngineCommand) => void }) {
  const lanSession = useLanSession()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [latestToast, setLatestToast] = useState<ChatMessage | null>(null)
  
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastMsgCountRef = useRef(lanSession.chatMessages.length)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openChat = () => {
    setOpen(true)
    setUnreadCount(0)
    setLatestToast(null)
  }

  // Listen for Enter key to open chat when in multiplayer
  useEffect(() => {
    if (lanSession.mode === 'solo') return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if meta/ctrl/alt is held
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const activeEl = document.activeElement as HTMLElement | null
      const isTyping =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable)

      if (e.key === 'Enter') {
        if (!open && !isTyping) {
          e.preventDefault()
          openChat()
        }
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lanSession.mode, open])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      // Slight delay to allow DOM render
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  // Auto-scroll on new messages & show toast when closed
  useEffect(() => {
    const currentCount = lanSession.chatMessages.length
    const diff = currentCount - lastMsgCountRef.current
    lastMsgCountRef.current = currentCount

    if (diff > 0 && currentCount > 0) {
      const latest = lanSession.chatMessages[currentCount - 1]
      if (latest && !open) {
        setUnreadCount((prev) => prev + diff)
        setLatestToast(latest)
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
        toastTimeoutRef.current = setTimeout(() => setLatestToast(null), 5000)
      }
    }

    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [lanSession.chatMessages, open])

  if (lanSession.mode === 'solo') return null

  const peerCount = lanSession.roster.length + 1

  function submitMessage(msgText?: string): void {
    const messageToSend = (msgText ?? text).trim()
    if (!messageToSend) return
    command({ type: 'postThought', text: messageToSend })
    setText('')
    if (!open) setOpen(true)
  }

  return (
    <div className="fixed right-4 bottom-24 z-40 flex flex-col items-end gap-2.5 select-none font-sans">
      {/* Floating Toast Notification Preview when Chat is Closed */}
      {!open && latestToast && (
        <div
          onClick={() => {
            setOpen(true)
            setLatestToast(null)
          }}
          className="flex cursor-pointer items-start gap-2 max-w-xs rounded-2xl border border-[#f2c879]/40 bg-[#1c132e]/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl transition hover:scale-105 active:scale-95 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f2c879]/20 text-[#f2c879] text-xs font-bold">
            💬
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center justify-between gap-1">
              <span className={`text-xs font-semibold truncate ${getPlayerColor(latestToast.sid)}`}>
                {latestToast.name}
              </span>
              <span className="text-[10px] text-white/40">{formatTime(latestToast.atMs)}</span>
            </div>
            <p className="text-xs text-white/90 truncate">{latestToast.text}</p>
          </div>
        </div>
      )}

      {/* Main Expanded Chat Panel */}
      {open && (
        <div className="flex h-96 w-80 sm:w-92 flex-col rounded-3xl border border-white/15 bg-[#181126]/95 p-4 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5 px-1">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#f2c879]/20 text-[#f2c879] text-xs">
                💬
              </div>
              <div>
                <h3 className="text-xs font-bold tracking-wide text-white">Player Chat</h3>
                <span className="text-[10px] text-[#f2c879]/80 font-mono">
                  {peerCount} player{peerCount > 1 ? 's' : ''} in {lanSession.roomName || 'room'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/40 font-mono hidden sm:inline">
                <kbd className="rounded border border-white/20 bg-white/10 px-1 py-0.5">Esc</kbd> close
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="h-4 w-4"
                >
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages Scroll List */}
          <div
            ref={listRef}
            className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-1 py-3 custom-scrollbar text-xs"
          >
            {lanSession.chatMessages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center p-4 text-white/40">
                <span className="text-2xl mb-1">🍵</span>
                <p className="text-xs font-medium text-white/60">No messages yet</p>
                <p className="text-[11px] mt-0.5 text-white/40">
                  Say hi to {lanSession.roster.length === 0 ? 'the room' : 'your friends'}!
                </p>
              </div>
            ) : (
              lanSession.chatMessages.map((m) => {
                const isYou = m.name === 'You'
                const playerColor = getPlayerColor(m.sid)

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col gap-0.5 ${isYou ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 px-1">
                      <span
                        className={`text-[10px] font-bold ${
                          isYou ? 'text-[#f2c879]' : playerColor
                        }`}
                      >
                        {m.name}
                      </span>
                      <span className="text-[9px] text-white/40">{formatTime(m.atMs)}</span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs leading-relaxed wrap-break-word shadow-md ${
                        isYou
                          ? 'bg-[#f2c879]/20 text-white border border-[#f2c879]/35 rounded-tr-xs'
                          : 'bg-white/10 text-white/95 border border-white/10 rounded-tl-xs'
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Quick Emote / Action Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 px-1 border-t border-white/10 no-scrollbar">
            {QUICK_PHRASES.map((phrase, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => submitMessage(phrase)}
                className="shrink-0 rounded-full border border-white/15 bg-white/5 hover:bg-white/15 px-2.5 py-0.5 text-[10px] font-medium text-white/80 transition active:scale-95"
              >
                {phrase}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div className="pt-1.5">
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(truncateGraphemes(e.target.value, MAX_GRAPHEMES))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitMessage()
                }}
                placeholder="Type a message... (Enter to send)"
                className="w-full rounded-2xl border border-white/15 bg-black/40 pl-3 pr-10 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-[#f2c879]/60 transition"
              />

              <button
                type="button"
                onClick={() => submitMessage()}
                disabled={!text.trim()}
                title="Send message"
                className="absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-xl bg-[#f2c879] text-slate-950 transition hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  className="h-3.5 w-3.5"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between px-1.5 pt-1 text-[10px] text-white/40">
              <span>Press <kbd className="font-mono text-white/60">Enter</kbd> to send</span>
              <span>
                {graphemeCount(text)}/{MAX_GRAPHEMES}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toggle Button with Unread Badge */}
      <button
        type="button"
        onClick={() => {
          if (!open) openChat()
          else setOpen(false)
        }}
        aria-expanded={open}
        aria-label="Multiplayer Chat (Enter)"
        title="Multiplayer Chat (Enter)"
        className={`group relative flex h-11 w-11 items-center justify-center rounded-2xl border shadow-2xl backdrop-blur-xl transition hover:scale-110 active:scale-95 ${
          open
            ? 'border-[#f2c879] bg-[#f2c879]/20 text-[#f2c879]'
            : 'border-white/20 bg-[#1c132e]/90 text-white/90 hover:border-[#f2c879]/50'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className="h-5 w-5"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>

        {/* Unread Counter Badge */}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-lg animate-bounce">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}

        {/* Keybinding Indicator */}
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-md border border-white/20 bg-slate-900 text-[8px] font-mono font-bold text-[#f2c879]">
          ↵
        </span>
      </button>
    </div>
  )
}
