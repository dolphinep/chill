'use client'

import { useEffect, useRef } from 'react'
import { getAvatarConfig } from '@/lib/avatar/avatarStore'
import { randomDisplayName } from '@/lib/avatar/randomName'
import {
  clearResumeInfo,
  getResumeInfo,
  joinLan,
  startHosting,
  useLanSession,
} from '@/lib/lan/lanSessionStore'
import { useSceneryId } from '@/lib/scenery/sceneryStore'

/**
 * No UI — exists purely to run this one effect on mount, unconditionally, wherever
 * `WorldClient` renders it. This used to live inside `ComfortSettings`, which sounded
 * reasonable (that's where the "Join" button and `hostAddress` state already were) but
 * was a real bug: `HUDDock.tsx` only mounts `ComfortSettings` behind
 * `activeModal === 'display'`, so a guest who opened a shared link and never happened
 * to open Settings never auto-joined at all — stuck solo forever, with nothing on
 * screen to explain why (no LAN party section to look at, no minimap, nothing).
 *
 * Two distinct reasons to reconnect on mount, checked in order:
 *
 * 1. **Resuming** (`getResumeInfo()`) — this tab was already hosting or had joined a
 *    session before a page refresh (`lanSessionStore.ts`'s in-memory state doesn't
 *    survive that). Checked FIRST, and deliberately not gated on hostname — a host
 *    resuming reconnects to `localhost`, same as they did originally, which the
 *    "auto-join a shared link" case below must never do.
 * 2. **A guest opening the host's shared link** — `location.hostname` IS the host's
 *    address, so making them ALSO find and click "Join" was pure friction, not a
 *    deliberate safeguard worth keeping. Only applies when there's no resume info
 *    (a first-time visit) and the hostname isn't `localhost` (nothing to auto-join to
 *    on the host's own machine, or in plain solo dev).
 *
 * `attempted` guards against retrying forever on a real failure (wrong address, relay
 * not running): one attempt, not a loop.
 */
export function LanAutoJoin() {
  const lanSession = useLanSession()
  const sceneryId = useSceneryId()
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    if (lanSession.mode !== 'solo') return
    if (typeof window === 'undefined') return
    attempted.current = true

    // Not caught into `lanError`-style UI state — there's no panel here to show it in.
    // A failure surfaces as staying solo; `console.error` is for whoever's debugging,
    // same as other fire-and-forget engine-side logging in this app.
    const resume = getResumeInfo()
    if (resume?.mode === 'hosting') {
      void startHosting(resume.name, getAvatarConfig(), sceneryId, resume.roomName).catch(
        (e: unknown) => {
          // The relay this was resuming is genuinely gone (not just a same-process
          // refresh) — without clearing this, every future reload in this tab would
          // retry and fail against the same dead session forever instead of falling
          // back to solo.
          clearResumeInfo()
          console.error('[lan] resume-hosting failed:', e)
        },
      )
      return
    }
    if (resume?.mode === 'guest') {
      void joinLan(
        resume.hostAddress,
        resume.name,
        getAvatarConfig(),
        sceneryId,
        resume.roomName,
      ).catch((e: unknown) => {
        clearResumeInfo()
        console.error('[lan] resume-join failed:', e)
      })
      return
    }

    const searchParams = new URLSearchParams(window.location.search)
    const roomParam = searchParams.get('room')
    const hostname = window.location.hostname

    // If room query param is explicitly provided in URL (e.g. ?room=xyz), auto-join that room
    if (roomParam) {
      void joinLan(hostname, randomDisplayName(), getAvatarConfig(), sceneryId, roomParam).catch(
        (e: unknown) => {
          console.error('[lan] auto-join room failed:', e)
        },
      )
      return
    }

    // Default: Auto-join public "Lobby" room so all players meet together seamlessly
    void joinLan(hostname, randomDisplayName(), getAvatarConfig(), sceneryId, 'Lobby').catch(
      (e: unknown) => {
        // Safe offline fallback in solo mode if local relay isn't running
        console.log('[lan] auto-join lobby (offline/solo mode):', e)
      },
    )
  }, [lanSession.mode, sceneryId])

  return null
}
