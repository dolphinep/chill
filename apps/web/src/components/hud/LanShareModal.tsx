'use client'

import { useEffect, useState } from 'react'
import { getAvatarConfig } from '@/lib/avatar/avatarStore'
import { randomDisplayName } from '@/lib/avatar/randomName'
import { leaveLan, startHosting, useLanSession } from '@/lib/lan/lanSessionStore'
import { useSceneryId } from '@/lib/scenery/sceneryStore'
import { SCENERY_REGISTRY } from '@/lib/scenery/registry'

/**
 * Hosting lives here, not in `ComfortSettings` — a LAN session is something you start
 * once and then want a quick, glanceable "am I live, what's the link" affordance for,
 * not a setting you dig through a panel to check.
 */

/** `?room=` is purely a label for whoever's reading the link before they click it (or
 * confirming after) — it's not how the guest's browser finds the host; that's still
 * `address`, auto-filled from `location.hostname` the moment they open it. */
function shareUrl(address: string, roomName: string | null): string {
  const base = `http://${address}:3100`
  return roomName ? `${base}/?room=${encodeURIComponent(roomName)}` : base
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5L8.6 10.5" strokeLinecap="round" />
    </svg>
  )
}

export function LanDockIcon({ onClick }: { onClick: () => void }) {
  const lanSession = useLanSession()
  const hosting = lanSession.mode === 'hosting'
  const guest = lanSession.mode === 'guest'
  const label = hosting
    ? 'Hosting — copy link (L)'
    : guest
      ? 'Connected to room (L)'
      : 'LAN Multiplayer (L)'
  return (
    <div className="group relative flex flex-col items-center">
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none px-3 py-1 text-xs font-medium text-white bg-slate-950/90 backdrop-blur-md rounded-lg whitespace-nowrap shadow-2xl border border-white/20 z-50 after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-slate-950/90">
        {label}
      </div>
      <button
        type="button"
        title={label}
        onClick={onClick}
        className="relative flex flex-col items-center justify-center pt-2 pb-1.5 px-2.5 rounded-xl text-white/80 hover:text-white hover:bg-white/15 active:scale-95 transition min-w-10.5"
        aria-label={label}
      >
        <ShareIcon />
        <span className="text-[9px] font-mono font-medium tracking-tight text-white/50 group-hover:text-white/90 transition-colors mt-1 leading-none">
          L
        </span>
        {(hosting || guest) && (
          <span
            className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ${
              hosting
                ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.9)] animate-pulse'
                : 'bg-sky-400 shadow-[0_0_4px_rgba(56,189,248,0.9)]'
            }`}
          />
        )}
      </button>
    </div>
  )
}

export function LanShareModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const lanSession = useLanSession()
  const sceneryId = useSceneryId()
  const [displayName, setDisplayName] = useState(randomDisplayName)
  const [roomName, setRoomName] = useState('')
  const [shareAddresses, setShareAddresses] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let active = true
    fetch('/api/lan/info')
      .then((res) => res.json() as Promise<{ addresses: string[] }>)
      .then((info) => {
        if (active && Array.isArray(info.addresses)) {
          setShareAddresses(info.addresses)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [isOpen])

  if (!isOpen) return null

  const currentSceneryName = SCENERY_REGISTRY[sceneryId]?.place ?? sceneryId

  async function handleStartHosting(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/lan/info')
      const info = (await res.json()) as { addresses: string[] }
      if (Array.isArray(info.addresses)) {
        setShareAddresses(info.addresses)
      }
      await startHosting(
        displayName.trim() || 'Host',
        getAvatarConfig(),
        sceneryId,
        roomName.trim() || 'Room',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start hosting')
    } finally {
      setBusy(false)
    }
  }

  function copyText(text: string): boolean {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {})
      return true
    }
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    document.body.removeChild(textarea)
    return ok
  }

  function handleCopy(url: string, index: number): void {
    copyText(url)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex((v) => (v === index ? null : v)), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass flex w-full max-w-sm flex-col gap-4 p-5 text-white shadow-2xl rounded-2xl border border-white/15">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <ShareIcon />
            <h2 className="text-sm font-medium text-white/95">LAN Multiplayer</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {lanSession.mode === 'guest' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
              <span className="text-white/90 font-medium">
                {lanSession.roomName ? `Connected to "${lanSession.roomName}"` : 'Connected as Guest'}
              </span>
              <span className="text-white/50">
                · {lanSession.roster.length} {lanSession.roster.length === 1 ? 'friend' : 'friends'}
              </span>
            </div>
            <p className="text-xs text-white/70">
              You are currently connected as a guest. The host controls the active scenery.
            </p>
            <button
              type="button"
              onClick={() => leaveLan()}
              className="px-3 py-2 text-xs font-medium rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white transition"
            >
              Leave session
            </button>
          </div>
        )}

        {lanSession.mode === 'solo' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 border border-white/10 text-xs">
              <span className="text-white/60">Active Scenery:</span>
              <span className="text-white font-medium text-right">{currentSceneryName}</span>
            </div>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="glass px-3 py-2 text-xs outline-none rounded-xl"
            />
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Room name (e.g. Cozy Stargazing)"
              className="glass px-3 py-2 text-xs outline-none rounded-xl"
            />
            <button
              type="button"
              onClick={() => void handleStartHosting()}
              disabled={busy}
              className="px-3 py-2 text-xs font-medium rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-white transition disabled:opacity-50"
            >
              {busy ? 'Starting…' : 'Start hosting'}
            </button>
            {error && <p className="text-[11px] text-red-300">{error}</p>}
          </div>
        )}

        {lanSession.mode === 'hosting' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-white/90 font-medium">
                  {lanSession.roomName ? `Hosting "${lanSession.roomName}"` : 'Hosting'}
                </span>
                <span className="text-white/50">
                  · {lanSession.roster.length} {lanSession.roster.length === 1 ? 'friend' : 'friends'}
                </span>
              </div>
              <span className="text-[10px] text-white/60 bg-white/10 px-2 py-0.5 rounded-md font-medium">
                {currentSceneryName}
              </span>
            </div>
            {shareAddresses.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-white/60">
                  Share this link on the same WiFi — it opens straight into the room, no
                  address or room name to type:
                </span>
                {shareAddresses.map((a, i) => (
                  <div key={a} className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-[11px] text-white/85">
                      {shareUrl(a, lanSession.roomName)}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopy(shareUrl(a, lanSession.roomName), i)}
                      className="shrink-0 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white transition"
                    >
                      {copiedIndex === i ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-white/50">No LAN address detected on this machine.</p>
            )}
            <button
              type="button"
              onClick={() => leaveLan()}
              className="px-3 py-2 text-xs font-medium rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white transition"
            >
              Stop hosting
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
