'use client'

import { useState } from 'react'
import { getAvatarConfig } from '@/lib/avatar/avatarStore'
import { randomDisplayName } from '@/lib/avatar/randomName'
import { joinLan, startHosting, leaveLan, useLanSession } from '@/lib/lan/lanSessionStore'
import { useSceneryId } from '@/lib/scenery/sceneryStore'

function getWebShareUrl(roomName: string | null, passkey: string | null): string {
  if (typeof window === 'undefined') return ''
  const base = window.location.origin
  if (!roomName) return base
  const params = new URLSearchParams()
  params.set('room', roomName)
  if (passkey) {
    params.set('passkey', passkey)
  }
  return `${base}/?${params.toString()}`
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
  const isConnected = lanSession.mode !== 'solo'
  const label = isConnected
    ? `ห้อง "${lanSession.roomName || 'Multiplayer'}" (L)`
    : 'ห้องผู้เล่น Multiplayer (L)'

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
        {isConnected && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.9)] animate-pulse" />
        )}
      </button>
    </div>
  )
}

export function LanShareModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const lanSession = useLanSession()
  const sceneryId = useSceneryId()
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [displayName, setDisplayName] = useState(randomDisplayName)
  const [createRoomName, setCreateRoomName] = useState(
    () => `room-${Math.floor(1000 + Math.random() * 9000)}`,
  )
  const [createPasskey, setCreatePasskey] = useState('')
  const [joinRoomName, setJoinRoomName] = useState('')
  const [joinPasskey, setJoinPasskey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedWeb, setCopiedWeb] = useState(false)
  const [showPasskey, setShowPasskey] = useState(false)

  if (!isOpen) return null

  const isConnected = lanSession.mode !== 'solo'
  const totalPlayers = lanSession.roster.length + 1

  function updateBrowserUrl(roomName?: string, passkey?: string) {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (!roomName) {
      url.searchParams.delete('room')
      url.searchParams.delete('passkey')
      url.searchParams.delete('key')
    } else {
      url.searchParams.set('room', roomName)
      if (passkey) {
        url.searchParams.set('passkey', passkey)
      } else {
        url.searchParams.delete('passkey')
        url.searchParams.delete('key')
      }
    }
    window.history.replaceState(null, '', url.toString())
  }

  async function handleCreateRoom(): Promise<void> {
    const targetRoom = createRoomName.trim()
    if (!targetRoom) {
      setError('กรุณาระบุชื่อหรือรหัสห้อง')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await startHosting(
        displayName.trim() || randomDisplayName(),
        getAvatarConfig(),
        sceneryId,
        targetRoom,
        createPasskey.trim() || undefined,
      )
      updateBrowserUrl(targetRoom, createPasskey.trim() || undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ไม่สามารถสร้างห้องได้')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoinRoom(): Promise<void> {
    const targetRoom = joinRoomName.trim()
    if (!targetRoom) {
      setError('กรุณาระบุชื่อหรือรหัสห้องที่จะเข้าร่วม')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const hostname = window.location.hostname
      await joinLan(
        hostname,
        displayName.trim() || randomDisplayName(),
        getAvatarConfig(),
        sceneryId,
        targetRoom,
        joinPasskey.trim() || undefined,
      )
      updateBrowserUrl(targetRoom, joinPasskey.trim() || undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ไม่สามารถเข้าร่วมห้องได้')
    } finally {
      setBusy(false)
    }
  }

  function handleLeaveRoom(): void {
    leaveLan()
    updateBrowserUrl()
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
    const url = getWebShareUrl(lanSession.roomName, lanSession.passkey)
    copyText(url)
    setCopiedWeb(true)
    setTimeout(() => setCopiedWeb(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      {/* Click outside to close */}
      <div className="fixed inset-0" onClick={onClose} />

      <div
        className="glass relative z-10 flex w-full max-w-sm flex-col gap-4 p-5 text-white shadow-2xl rounded-3xl border border-white/15 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white shadow">
              <ShareIcon />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">ห้องผู้เล่น (Multiplayer)</h2>
              <p className="text-[10px] text-white/50">
                {isConnected ? 'กำลังออนไลน์อยู่ในห้อง' : 'สร้างหรือเข้าห้องด้วย Passkey'}
              </p>
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

        {/* CONNECTED VIEW */}
        {isConnected ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2.5 rounded-2xl bg-white/5 p-3.5 border border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)] shrink-0" />
                  <span className="text-xs font-bold text-white">
                    ห้อง: &ldquo;{lanSession.roomName || 'Private Room'}&rdquo;
                  </span>
                </div>
                <span className="text-[11px] text-emerald-300 font-mono font-medium">
                  {totalPlayers} คนในห้อง
                </span>
              </div>

              {lanSession.passkey && (
                <div className="flex items-center justify-between rounded-xl bg-black/40 px-3 py-1.5 border border-white/10 text-[11px]">
                  <span className="text-white/60">รหัสผ่านห้อง (Passkey):</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-amber-300">
                      {showPasskey ? lanSession.passkey : '••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPasskey((v) => !v)}
                      className="text-[10px] text-white/50 hover:text-white"
                    >
                      {showPasskey ? 'ซ่อน' : 'ดู'}
                    </button>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-white/60 leading-relaxed">
                ส่งลิงก์ด้านล่างให้เพื่อนเพื่อชวนเข้าห้องนี้ได้ทันที
              </p>

              {/* 1-Click Copy Invite Link */}
              <div className="flex items-center gap-2 pt-1">
                <code className="flex-1 min-w-0 truncate rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-[11px] text-white/90 font-mono">
                  {getWebShareUrl(lanSession.roomName, lanSession.passkey)}
                </code>
                <button
                  type="button"
                  onClick={handleCopyWebLink}
                  className="shrink-0 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 hover:text-white transition active:scale-95 shadow"
                >
                  {copiedWeb ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์'}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLeaveRoom}
              className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 px-3 text-xs font-semibold rounded-xl bg-white/10 hover:bg-red-500/20 border border-white/15 hover:border-red-400/40 text-white/80 hover:text-red-200 transition active:scale-95 shadow"
            >
              <span>ออกจากห้อง (กลับสู่โหมดคนเดียว)</span>
            </button>
          </div>
        ) : (
          /* SOLO VIEW: CREATE OR JOIN TABS */
          <div className="flex flex-col gap-3">
            {/* Tab switcher */}
            <div className="flex rounded-xl bg-black/30 p-1 border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setTab('create')
                  setError(null)
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                  tab === 'create'
                    ? 'bg-white/20 text-white shadow'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                สร้างห้องใหม่
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('join')
                  setError(null)
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                  tab === 'join'
                    ? 'bg-white/20 text-white shadow'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                เข้าร่วมห้อง
              </button>
            </div>

            {/* Display Name Input */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                ชื่อของคุณ (Display Name)
              </span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="ชื่อของคุณ"
                className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-white/40 transition"
              />
            </div>

            {tab === 'create' ? (
              /* CREATE ROOM FORM */
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                    ชื่อหรือรหัสห้อง (Room Code)
                  </span>
                  <input
                    type="text"
                    value={createRoomName}
                    onChange={(e) => setCreateRoomName(e.target.value)}
                    placeholder="เช่น chill-88, room-101"
                    className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-white/40 transition"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                      รหัสผ่านห้อง (Passkey)
                    </span>
                    <span className="text-[9px] text-white/40">(ไม่บังคับ / เว้นว่างได้)</span>
                  </div>
                  <input
                    type="text"
                    value={createPasskey}
                    onChange={(e) => setCreatePasskey(e.target.value)}
                    placeholder="เช่น 1234, chill (เพื่อนต้องใส่ก่อนเข้า)"
                    className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-white/40 transition"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleCreateRoom()}
                  disabled={busy || !createRoomName.trim()}
                  className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 px-3 text-xs font-semibold rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 hover:text-white transition active:scale-95 disabled:opacity-50 shadow-md"
                >
                  <span>{busy ? 'กำลังสร้างห้อง…' : 'สร้างห้อง'}</span>
                </button>
              </div>
            ) : (
              /* JOIN ROOM FORM */
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                    ชื่อหรือรหัสห้องที่ต้องการเข้า
                  </span>
                  <input
                    type="text"
                    value={joinRoomName}
                    onChange={(e) => setJoinRoomName(e.target.value)}
                    placeholder="เช่น chill-88, room-101"
                    className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-white/40 transition"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                    รหัสผ่านห้อง (Passkey)
                  </span>
                  <input
                    type="text"
                    value={joinPasskey}
                    onChange={(e) => setJoinPasskey(e.target.value)}
                    placeholder="ใส่รหัสผ่านหากห้องนั้นมีการตั้งไว้"
                    className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-white/40 transition"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleJoinRoom()}
                  disabled={busy || !joinRoomName.trim()}
                  className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 px-3 text-xs font-semibold rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-100 hover:text-white transition active:scale-95 disabled:opacity-50 shadow-md"
                >
                  <span>{busy ? 'กำลังเข้าร่วมห้อง…' : 'เข้าร่วมห้อง'}</span>
                </button>
              </div>
            )}

            {error && <p className="text-[11px] text-red-300 text-center">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

