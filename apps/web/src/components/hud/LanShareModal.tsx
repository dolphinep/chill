'use client'

import { useEffect, useState } from 'react'
import { getAvatarConfig } from '@/lib/avatar/avatarStore'
import { randomDisplayName } from '@/lib/avatar/randomName'
import { leaveLan, startHosting, joinLan, useLanSession } from '@/lib/lan/lanSessionStore'
import { useSceneryId } from '@/lib/scenery/sceneryStore'
import { SCENERY_REGISTRY } from '@/lib/scenery/registry'

function getWebShareUrl(roomName: string | null): string {
  if (typeof window === 'undefined') return ''
  const base = window.location.origin
  return roomName ? `${base}/?room=${encodeURIComponent(roomName)}` : base
}

function getLanShareUrl(address: string, roomName: string | null): string {
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
      : 'Multiplayer Rooms (L)'
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
  const [copiedWeb, setCopiedWeb] = useState(false)
  const [copiedLanIndex, setCopiedLanIndex] = useState<number | null>(null)

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
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  async function handleStartHosting(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await startHosting(
        displayName.trim() || 'Host',
        getAvatarConfig(),
        sceneryId,
        roomName.trim() || 'Cozy Room',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create room')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoinRoom(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const targetRoom = roomName.trim() || 'Cozy Room'
      const hostname = window.location.hostname
      await joinLan(
        hostname,
        displayName.trim() || randomDisplayName(),
        getAvatarConfig(),
        sceneryId,
        targetRoom,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join room')
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

  function handleCopyWebLink(): void {
    const url = getWebShareUrl(lanSession.roomName)
    copyText(url)
    setCopiedWeb(true)
    setTimeout(() => setCopiedWeb(false), 2000)
  }

  function handleCopyLan(url: string, index: number): void {
    copyText(url)
    setCopiedLanIndex(index)
    setTimeout(() => setCopiedLanIndex((v) => (v === index ? null : v)), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      {/* Click outside to close */}
      <div className="fixed inset-0" onClick={onClose} />

      <div
        className="glass relative z-10 flex w-full max-w-sm flex-col gap-4 p-5 text-white shadow-2xl rounded-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white shadow">
              <ShareIcon />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">Multiplayer Rooms</h2>
              <p className="text-[10px] text-white/50">Play together in real-time 3D</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* GUEST MODE VIEW */}
        {lanSession.mode === 'guest' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5 border border-white/10 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400 animate-pulse shrink-0" />
                <span className="text-white font-semibold">
                  {lanSession.roomName ? `"${lanSession.roomName}"` : 'Guest Room'}
                </span>
              </div>
              <span className="text-white/50 text-[11px]">
                {lanSession.roster.length} {lanSession.roster.length === 1 ? 'friend' : 'friends'} online
              </span>
            </div>

            {/* Share link to invite others to this room too */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-white/60 font-medium">Invite others with link:</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[11px] text-white/90 font-mono">
                  {getWebShareUrl(lanSession.roomName)}
                </code>
                <button
                  type="button"
                  onClick={handleCopyWebLink}
                  className="shrink-0 px-3 py-2 text-xs font-semibold rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white transition active:scale-95"
                >
                  {copiedWeb ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-white/60 leading-relaxed">
              You are connected as a guest. The room host controls the active scenery.
            </p>

            <button
              type="button"
              onClick={() => leaveLan()}
              className="mt-1 px-4 py-2.5 text-xs font-semibold rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 hover:text-white transition active:scale-95"
            >
              Leave Room
            </button>
          </div>
        )}

        {/* SOLO MODE VIEW: CREATE OR JOIN ROOM */}
        {lanSession.mode === 'solo' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 border border-white/10 text-xs">
              <span className="text-white/60">Scenery:</span>
              <span className="text-white font-medium text-right">{currentSceneryName}</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/40 focus:border-white/30 focus:outline-none transition"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                Room Name / Code
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Cozy Stargazing, Room 101"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/40 focus:border-white/30 focus:outline-none transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => void handleStartHosting()}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 hover:text-white transition active:scale-95 disabled:opacity-50 shadow-md"
              >
                <span>{busy ? 'Creating…' : 'Create Room'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleJoinRoom()}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 hover:text-white transition active:scale-95 disabled:opacity-50 shadow-md"
              >
                <span>{busy ? 'Joining…' : 'Join Room'}</span>
              </button>
            </div>

            {error && <p className="text-[11px] text-red-300 text-center">{error}</p>}
          </div>
        )}

        {/* HOSTING MODE VIEW */}
        {lanSession.mode === 'hosting' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5 border border-white/10 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-white font-semibold">
                  {lanSession.roomName ? `"${lanSession.roomName}"` : 'Your Room'}
                </span>
                <span className="text-[10px] text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-400/30 font-bold">
                  HOST
                </span>
              </div>
              <span className="text-white/50 text-[11px]">
                {lanSession.roster.length} {lanSession.roster.length === 1 ? 'friend' : 'friends'} online
              </span>
            </div>

            {/* Public Web Share Link */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-white/70 font-medium">
                Share this link with friends to join:
              </span>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[11px] text-white/90 font-mono">
                  {getWebShareUrl(lanSession.roomName)}
                </code>
                <button
                  type="button"
                  onClick={handleCopyWebLink}
                  className="shrink-0 px-3 py-2 text-xs font-semibold rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-white transition active:scale-95"
                >
                  {copiedWeb ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Local WiFi LAN links (shown only when running locally on localhost/LAN dev) */}
            {isLocalHost && shareAddresses.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2">
                <span className="text-[10px] text-white/50">Local WiFi IP link (LAN):</span>
                {shareAddresses.map((a, i) => (
                  <div key={a} className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[10px] text-white/70 font-mono">
                      {getLanShareUrl(a, lanSession.roomName)}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopyLan(getLanShareUrl(a, lanSession.roomName), i)}
                      className="shrink-0 px-2 py-1 text-[10px] font-medium rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white transition"
                    >
                      {copiedLanIndex === i ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => leaveLan()}
              className="mt-1 px-4 py-2.5 text-xs font-semibold rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 hover:text-white transition active:scale-95"
            >
              Stop Hosting (Close Room)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

