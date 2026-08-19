import { useSyncExternalStore } from 'react'
import {
  LanRoomClient,
  LAN_RELAY_PORT,
  type RoomClient,
  type ConnectionState,
  type RosterEvent,
} from '@chill/protocol'
import type { ChibiAvatarConfig } from '@/lib/avatar/avatarConfig'

/**
 * LAN multiplayer session state — same `useSyncExternalStore` + module-state pattern
 * as `sceneryStore.ts`/`comfortStore.ts`, not a new state-management dependency.
 *
 * Deliberately NOT persisted to `localStorage`: a LAN session is live, ephemeral state
 * tied to a relay process that stops existing the moment the host closes it — nothing
 * about "reconnect to the WiFi session from three days ago" makes sense to restore on
 * reload the way a comfort setting does.
 *
 * The `RoomClient` instance itself lives here, at module scope, specifically so it
 * survives an `Engine` remount: `EngineCanvas` computes an effective scenery id as
 * `lanSession.sceneryId ?? sceneryStore.sceneryId` and remounts the whole engine on
 * that change (the same mechanism `sceneryStore.ts` already uses) — if the
 * `RoomClient` lived inside `Engine` instead, that remount would also drop the network
 * connection, which is exactly the bug this module's placement avoids.
 */

export type LanMode = 'solo' | 'hosting' | 'guest'

export type LanPeer = { sid: number; name: string; avatarConfig: Record<string, string> }

/** A persistent chat-room entry — deliberately a separate, ever-growing log, not the
 * same state `ThoughtField`'s 3D lanterns use (those fade/decay and cap at one live
 * bloom per author, which is right for a floating lantern but wrong for "what did
 * everyone actually say" scrollback). Both ride the exact same wire message though
 * (`sendThought`/`onThought`) — this just *also* listens, rather than adding a second
 * network path. */
export type ChatMessage = {
  id: string
  sid: number
  name: string
  text: string
  atMs: number
}

const MAX_CHAT_HISTORY = 200

export type LanSessionState = {
  mode: LanMode
  connectionState: ConnectionState
  roster: LanPeer[]
  /** Host-authoritative once connected. `null` means "no override" — `EngineCanvas`
   * falls back to the local player's own persisted `sceneryStore` choice, exactly the
   * solo-mode behavior today. */
  sceneryId: string | null
  /** Relay-confirmed once connected — `null` until `welcome` arrives, or if nobody
   * (including the host) ever set one. Purely a display/confirmation label; joining
   * still rides on the host's actual address, not this name (see `LanRoomClient`'s
   * `getRoomName()` doc comment). */
  roomName: string | null
  roomClient: RoomClient | null
  chatMessages: ChatMessage[]
}

const INITIAL_STATE: LanSessionState = {
  mode: 'solo',
  connectionState: 'idle',
  roster: [],
  sceneryId: null,
  roomName: null,
  roomClient: null,
  chatMessages: [],
}

let state: LanSessionState = INITIAL_STATE
const listeners = new Set<() => void>()

function set(next: Partial<LanSessionState>): void {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getServerSnapshot = (): LanSessionState => INITIAL_STATE

export function useLanSession(): LanSessionState {
  return useSyncExternalStore(subscribe, () => state, getServerSnapshot)
}

function wireCommon(client: LanRoomClient, mode: LanMode): void {
  client.onStateChange((connectionState) => set({ connectionState }))
  client.onRoster((event: RosterEvent) => {
    if (event.type === 'leave') {
      set({ roster: state.roster.filter((p) => p.sid !== event.sid) })
      return
    }
    const others = state.roster.filter((p) => p.sid !== event.sid)
    set({
      roster: [...others, { sid: event.sid, name: event.name, avatarConfig: event.avatarConfig }],
    })
  })
  client.onSceneryChange((sceneryId) => set({ sceneryId }))
  // Deliberately NOT mirrored into this store's state — unlike `sceneryId` (which
  // `EngineCanvas` reads to decide whether to remount the engine), time-of-day is a
  // continuous, frequent value with nothing here that needs to react to it. `Engine.ts`
  // subscribes to `onTimeOfDayChange` directly instead, the same way it owns
  // `onThrow`/`onTargetHit` without routing them through this store.
  client.onThought((thought) => {
    const isLocal = thought.sid === client.sid
    const name = isLocal
      ? 'You'
      : (state.roster.find((p) => p.sid === thought.sid)?.name ?? 'Friend')
    const message: ChatMessage = {
      id: `${thought.sid}-${thought.id}`,
      sid: thought.sid,
      name,
      text: thought.text,
      atMs: thought.sentAtEpochS * 1000,
    }
    set({ chatMessages: [...state.chatMessages, message].slice(-MAX_CHAT_HISTORY) })
  })
  // Deliberately NOT setting `roomClient` here yet — see the two call sites below.
  set({ mode })
}

function getRelayUrl(hostAddress?: string): string {
  if (process.env.NEXT_PUBLIC_RELAY_URL) {
    return process.env.NEXT_PUBLIC_RELAY_URL
  }
  if (typeof window === 'undefined') {
    return `ws://localhost:${LAN_RELAY_PORT}`
  }
  const isHttps = window.location.protocol === 'https:'
  const proto = isHttps ? 'wss' : 'ws'

  // If hostAddress is provided explicitly (e.g. guest connecting to specific IP)
  if (hostAddress) {
    const cleanHost = hostAddress.trim()
    return cleanHost.includes(':') ? `${proto}://${cleanHost}` : `${proto}://${cleanHost}:${LAN_RELAY_PORT}`
  }

  // Deployed production mode on standard web ports (Cloud Run, reverse proxies, etc.)
  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  if (!isLocalHost) {
    return `${proto}://${window.location.host}`
  }

  return `${proto}://${window.location.hostname}:${LAN_RELAY_PORT}`
}

/** Starts the host's own connection — connects to local relay in dev or unified server in production */
export async function startHosting(
  name: string,
  avatarConfig: ChibiAvatarConfig,
  currentSceneryId: string,
  roomName: string,
): Promise<void> {
  const url = getRelayUrl()
  const client = new LanRoomClient({
    url,
    name,
    avatarConfig: avatarConfig as unknown as Record<string, string>,
    roomName,
  })
  wireCommon(client, 'hosting')
  await client.connect({ kind: 'public', sceneryId: currentSceneryId })
  set({ roomClient: client, roomName: client.getRoomName() })
  saveResumeInfo({ mode: 'hosting', name, roomName: client.getRoomName() ?? roomName })
}

export async function joinLan(
  hostAddress: string,
  name: string,
  avatarConfig: ChibiAvatarConfig,
  currentSceneryId: string,
  roomName?: string,
): Promise<void> {
  const client = new LanRoomClient({
    url: getRelayUrl(hostAddress),
    name,
    avatarConfig: avatarConfig as unknown as Record<string, string>,
    roomName,
  })
  wireCommon(client, 'guest')
  await client.connect({ kind: 'public', sceneryId: currentSceneryId })
  // See the matching comment in `startHosting` above.
  set({ roomClient: client, roomName: client.getRoomName() })
  saveResumeInfo({ mode: 'guest', name, hostAddress, roomName: client.getRoomName() ?? roomName })
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    state.roomClient?.disconnect()
  })
}

export function leaveLan(): void {
  clearResumeInfo()
  state.roomClient?.disconnect()
  set(INITIAL_STATE)
}

/** If currently hosting a LAN session, announces the scenery switch to all joined peers. */
export function announceLanScenery(sceneryId: string): void {
  if (state.mode === 'hosting' && state.roomClient) {
    state.roomClient.announceScenery(sceneryId)
    set({ sceneryId })
  }
}

/**
 * Enough to reconnect to the SAME session after a page refresh — deliberately not the
 * `roomClient`/roster/chat state itself (that's still gone; see this file's own doc
 * comment on why a LAN session isn't otherwise persisted). `sessionStorage`, not
 * `localStorage`: this should survive a reload of this tab but not linger into a
 * brand-new tab or a future day the way a comfort setting should.
 *
 * This exists because `lan-relay.ts` already anticipates the host's own tab
 * reloading — a fresh connection that arrives while `hostSid` is `null` (the previous
 * host's socket just closed) is granted host status again, no different from any
 * other reconnect (see its own `HOST_GRACE_MS`/`sessionEnded` comments). Without this,
 * that server-side support went unused: the host's tab landed back in solo mode on
 * refresh with nothing prompting it to reconnect at all, and guests were left talking
 * to a relay with no host — which is what read as "stuck."
 */
const RESUME_KEY = 'chill:lanResume'

type ResumeInfo =
  | { mode: 'hosting'; name: string; roomName: string }
  | { mode: 'guest'; name: string; hostAddress: string; roomName?: string }

function saveResumeInfo(info: ResumeInfo): void {
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify(info))
  } catch {
    // Private browsing / storage disabled — resuming after a refresh just silently
    // won't work; starting or joining a session in the first place is unaffected.
  }
}

/** Exported so `LanAutoJoin` can clear it when a resume attempt itself fails (the
 * relay process is genuinely gone, not just a same-process refresh) — without this, a
 * dead session's info sits in `sessionStorage` for the rest of the tab's lifetime, and
 * every subsequent reload retries and fails against it the same way, logging the same
 * "connection closed before welcome" error forever instead of just falling back to
 * solo. */
export function clearResumeInfo(): void {
  try {
    sessionStorage.removeItem(RESUME_KEY)
  } catch {
    // See `saveResumeInfo`.
  }
}

/** Read by `LanAutoJoin` on mount — a plain function, not a hook, since it only ever
 * needs to be checked once, synchronously, before deciding whether to resume or fall
 * back to its existing "joined via a shared link" behavior. */
export function getResumeInfo(): ResumeInfo | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY)
    return raw ? (JSON.parse(raw) as ResumeInfo) : null
  } catch {
    return null
  }
}
