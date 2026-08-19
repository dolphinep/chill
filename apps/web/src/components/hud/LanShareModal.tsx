'use client'

import { useState } from 'react'
import { getAvatarConfig } from '@/lib/avatar/avatarStore'
import { randomDisplayName } from '@/lib/avatar/randomName'
import { joinLan, useLanSession } from '@/lib/lan/lanSessionStore'
import { useSceneryId } from '@/lib/scenery/sceneryStore'

function getWebShareUrl(roomName: string | null): string {
  if (typeof window === 'undefined') return ''
  const base = window.location.origin
  if (!roomName || roomName.toLowerCase() === 'lobby') {
    return base
  }
  return `${base}/?room=${encodeURIComponent(roomName)}`
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
  const isLobby = !lanSession.roomName || lanSession.roomName.toLowerCase() === 'lobby'
  const isConnected = lanSession.mode !== 'solo'
  const label = isConnected
    ? isLobby
      ? 'ห้องสาธารณะ Lobby (L)'
      : `ห้องส่วนตัว "${lanSession.roomName}" (L)`
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
          <span
            className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ${
              isLobby
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
  const [roomInput, setRoomInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedWeb, setCopiedWeb] = useState(false)
  const [showJoinCustom, setShowJoinCustom] = useState(false)

  if (!isOpen) return null

  const isLobby = !lanSession.roomName || lanSession.roomName.toLowerCase() === 'lobby'
  const isConnected = lanSession.mode !== 'solo'
  const totalPlayers = lanSession.roster.length + 1

  function updateBrowserUrl(roomName?: string) {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (!roomName || roomName.toLowerCase() === 'lobby') {
      url.searchParams.delete('room')
    } else {
      url.searchParams.set('room', roomName)
    }
    window.history.replaceState(null, '', url.toString())
  }

  async function handleJoinRoom(targetRoom: string): Promise<void> {
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
      )
      updateBrowserUrl(targetRoom)
      setShowJoinCustom(false)
      setRoomInput('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ไม่สามารถเข้าร่วมห้องได้')
    } finally {
      setBusy(false)
    }
  }

  function handleCreatePrivateRoom(): void {
    const code = `room-${Math.floor(1000 + Math.random() * 9000)}`
    void handleJoinRoom(code)
  }

  function handleReturnToLobby(): void {
    void handleJoinRoom('Lobby')
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
              <p className="text-[10px] text-white/50">เล่นร่วมกันแบบ Real-time ในโลก 3D</p>
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

        {/* Current Room Status Card */}
        <div className="flex flex-col gap-2.5 rounded-2xl bg-white/5 p-3.5 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  isConnected
                    ? isLobby
                      ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                      : 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]'
                    : 'bg-white/30'
                }`}
              />
              <span className="text-xs font-bold text-white">
                {isConnected
                  ? isLobby
                    ? 'ห้องสาธารณะ (Public Lobby)'
                    : `ห้องส่วนตัว "${lanSession.roomName}"`
                  : 'โหมดเล่นคนเดียว (Solo)'}
              </span>
            </div>
            <span className="text-[11px] text-emerald-300 font-mono font-medium">
              {isConnected ? `${totalPlayers} คนในห้อง` : 'Solo'}
            </span>
          </div>

          <p className="text-[11px] text-white/60 leading-relaxed">
            {isLobby
              ? 'ทุกคนที่เปิดเว็บจะเข้ามาเจอกันในห้องนี้โดยอัตโนมัติ'
              : 'คุณกำลังอยู่ในห้องส่วนตัว สามารถส่งลิงก์ด้านล่างเพื่อชวนเพื่อนมาเล่นด้วยกันได้'}
          </p>

          {/* 1-Click Copy Invite Link */}
          {isConnected && (
            <div className="flex items-center gap-2 pt-1">
              <code className="flex-1 min-w-0 truncate rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-[11px] text-white/90 font-mono">
                {getWebShareUrl(lanSession.roomName)}
              </code>
              <button
                type="button"
                onClick={handleCopyWebLink}
                className="shrink-0 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 hover:text-white transition active:scale-95 shadow"
              >
                {copiedWeb ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์'}
              </button>
            </div>
          )}
        </div>

        {/* Room Switch & Creation Controls */}
        <div className="flex flex-col gap-2">
          {/* If currently in private room, provide button to return to Lobby */}
          {!isLobby && isConnected && (
            <button
              type="button"
              onClick={handleReturnToLobby}
              disabled={busy}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-3 text-xs font-semibold rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 transition active:scale-95 shadow-md"
            >
              <span>กลับสู่ห้องสาธารณะ (Public Lobby)</span>
            </button>
          )}

          {/* If currently in Lobby, provide button to create private room */}
          {isLobby && (
            <button
              type="button"
              onClick={handleCreatePrivateRoom}
              disabled={busy}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-3 text-xs font-semibold rounded-xl bg-[#f2c879]/20 hover:bg-[#f2c879]/30 border border-[#f2c879]/40 text-[#f2c879] transition active:scale-95 shadow-md"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              <span>สร้างห้องส่วนตัวสำหรับเล่นกับเพื่อน</span>
            </button>
          )}

          {/* Toggle Custom Room Input */}
          {!showJoinCustom ? (
            <button
              type="button"
              onClick={() => setShowJoinCustom(true)}
              className="text-[11px] text-white/50 hover:text-white/90 py-1 transition text-center"
            >
              + เข้าร่วมห้องอื่นด้วยรหัสห้อง (Join Room Code)
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3 border border-white/10 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/70 font-medium">ระบุชื่อหรือรหัสห้อง:</span>
                <button
                  type="button"
                  onClick={() => setShowJoinCustom(false)}
                  className="text-[10px] text-white/40 hover:text-white"
                >
                  ยกเลิก
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-white/70 font-medium">ชื่อของคุณ (Display Name):</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="ชื่อที่ต้องการแสดง"
                  className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-white/40 transition"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-white/70 font-medium">ระบุชื่อหรือรหัสห้อง:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && roomInput.trim()) {
                        void handleJoinRoom(roomInput.trim())
                      }
                    }}
                    placeholder="เช่น room-101, chill-room"
                    className="flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-white/40 transition"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (roomInput.trim()) void handleJoinRoom(roomInput.trim())
                    }}
                    disabled={!roomInput.trim() || busy}
                    className="shrink-0 px-3.5 py-2 text-xs font-semibold rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 hover:text-white transition active:scale-95 disabled:opacity-40"
                  >
                    เข้าห้อง
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-[11px] text-red-300 text-center">{error}</p>}
      </div>
    </div>
  )
}

