'use client'

import { useEffect, useState } from 'react'
import type { EngineCommand, MinimapSnapshot } from '@/engine/core/Engine'
import { useLanSession } from '@/lib/lan/lanSessionStore'

/**
 * LAN-only — a solo player has nobody else to show, so this renders nothing outside a
 * session. Positions are pulled every `requestAnimationFrame` tick, same reasoning as
 * `LanternLayer.tsx`: peers walk continuously, and `EngineEventBus` is deliberately
 * throttled to a few times a second, which would make dots visibly stutter.
 *
 * World-space to screen-space convention (this app defines no "north" anywhere else,
 * so this is arbitrary but self-consistent): world +X -> screen +X (right), world +Z
 * -> screen -Y (up). Facing (`yaw`, "0 faces +Z" per `CharacterController`) then maps
 * to a plain `rotate(yaw rad)` on an arrow that points up by default — verified by
 * working the rotation matrix through by hand, not just eyeballed.
 */

const VIEW_RADIUS_M = 60
const MAP_PX = 140
const MAP_RADIUS_PX = MAP_PX / 2
/** Keeps a far-off peer's dot just inside the ring rather than exactly on its edge,
 * where it would visually merge with the border. */
const EDGE_MARGIN_PX = 8

export function Minimap({
  getMinimapSnapshot,
  command,
}: {
  getMinimapSnapshot: () => MinimapSnapshot | null
  command: (cmd: EngineCommand) => void
}) {
  const lanSession = useLanSession()
  const [snapshot, setSnapshot] = useState<MinimapSnapshot | null>(null)

  useEffect(() => {
    if (lanSession.mode === 'solo') return
    let raf: number
    const tick = () => {
      setSnapshot(getMinimapSnapshot())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getMinimapSnapshot, lanSession.mode])

  if (lanSession.mode === 'solo' || !snapshot) return null

  return (
    <div className="animate-in fade-in fixed bottom-4 left-4 z-40 flex flex-col items-center gap-1.5 duration-200 select-none sm:bottom-6 sm:left-6">
      {lanSession.roomName && (
        <span className="glass text-glass-foreground rounded-full border border-white/10 px-2.5 py-0.5 text-[10px] font-medium shadow-sm">
          {lanSession.roomName}
        </span>
      )}
      <div
        className="glass relative rounded-full border border-white/15 bg-black/20 shadow-xl backdrop-blur-xl"
        style={{ width: MAP_PX, height: MAP_PX }}
      >
        {/* Local player: always at the ring's center — everyone else moves relative
            to them, not the other way round. */}
        <div
          className="absolute h-0 w-0"
          style={{
            left: MAP_RADIUS_PX,
            top: MAP_RADIUS_PX,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderBottom: '9px solid white',
            filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.7))',
            transform: `translate(-50%, -50%) rotate(${snapshot.local.yaw}rad)`,
          }}
        />
        {snapshot.peers.map((peer) => {
          const dx = peer.x - snapshot.local.x
          const dz = peer.z - snapshot.local.z
          let px = (dx / VIEW_RADIUS_M) * MAP_RADIUS_PX
          let py = -(dz / VIEW_RADIUS_M) * MAP_RADIUS_PX
          const dist = Math.hypot(px, py)
          // Clamp to just inside the ring instead of letting a far-off peer vanish
          // off the map — "they're out there in that direction" beats "gone."
          const maxDist = MAP_RADIUS_PX - EDGE_MARGIN_PX
          if (dist > maxDist) {
            const scale = maxDist / dist
            px *= scale
            py *= scale
          }
          const name = lanSession.roster.find((p) => p.sid === peer.sid)?.name ?? 'Friend'
          return (
            <div
              key={peer.sid}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: MAP_RADIUS_PX + px, top: MAP_RADIUS_PX + py }}
            >
              <button
                type="button"
                onClick={() => command({ type: 'teleportToPeer', sid: peer.sid })}
                aria-label={`Teleport to ${name}`}
                title={`Teleport to ${name}`}
                className="block h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] transition hover:scale-125"
              />
              <span className="pointer-events-none absolute top-3.5 left-1/2 -translate-x-1/2 text-[9px] font-medium whitespace-nowrap text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
