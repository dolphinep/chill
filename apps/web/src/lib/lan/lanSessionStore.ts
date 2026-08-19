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
  sceneryId: string | null
  roomName: string | null
  passkey: string | null
  roomClient: RoomClient | null
  chatMessages: ChatMessage[]
}

const INITIAL_STATE: LanSessionState = {
  mode: 'solo',
  connectionState: 'idle',
  roster: [],
  sceneryId: null,
  roomName: null,
  passkey: null,
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
  const isLocalHost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  // If hostAddress is provided explicitly (e.g. guest connecting to specific IP or domain)
  if (hostAddress) {
    const cleanHost = hostAddress.trim()
    if (cleanHost.includes(':')) {
      return `${proto}://${cleanHost}`
    }
    if (
      cleanHost === window.location.hostname ||
      cleanHost === window.location.host ||
      !isLocalHost ||
      isHttps
    ) {
      return `${proto}://${window.location.host}/api/relay`
    }
    return `${proto}://${cleanHost}:${LAN_RELAY_PORT}`
  }

  // Deployed production mode on standard web ports (Cloud Run, reverse proxies, etc.)
  if (!isLocalHost || isHttps) {
    return `${proto}://${window.location.host}/api/relay`
  }

  return `${proto}://${window.location.hostname}:${LAN_RELAY_PORT}`
}

/** Starts the host's own connection — connects to local relay in dev or unified server in production */
export async function startHosting(
  name: string,
  avatarConfig: ChibiAvatarConfig,
  currentSceneryId: string,
  roomName: string,
  passkey?: string,
): Promise<void> {
  const url = getRelayUrl()
  const client = new LanRoomClient({
    url,
    name,
    avatarConfig: avatarConfig as unknown as Record<string, string>,
    roomName,
    passkey: passkey?.trim() || undefined,
  })
  wireCommon(client, 'hosting')
  await client.connect({ kind: 'public', sceneryId: currentSceneryId })
  set({ roomClient: client, roomName: client.getRoomName(), passkey: passkey?.trim() || null })
  saveResumeInfo({
    mode: 'hosting',
    name,
    roomName: client.getRoomName() ?? roomName,
    passkey: passkey?.trim(),
  })
}

export async function joinLan(
  hostAddress: string,
  name: string,
  avatarConfig: ChibiAvatarConfig,
  currentSceneryId: string,
  roomName?: string,
  passkey?: string,
): Promise<void> {
  const client = new LanRoomClient({
    url: getRelayUrl(hostAddress),
    name,
    avatarConfig: avatarConfig as unknown as Record<string, string>,
    roomName,
    passkey: passkey?.trim() || undefined,
  })
  wireCommon(client, 'guest')
  await client.connect({ kind: 'public', sceneryId: currentSceneryId })
  set({ roomClient: client, roomName: client.getRoomName(), passkey: passkey?.trim() || null })
  saveResumeInfo({
    mode: 'guest',
    name,
    hostAddress,
    roomName: client.getRoomName() ?? roomName,
    passkey: passkey?.trim(),
  })
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

const RESUME_KEY = 'chill:lanResume'

type ResumeInfo =
  | { mode: 'hosting'; name: string; roomName: string; passkey?: string }
  | { mode: 'guest'; name: string; hostAddress: string; roomName?: string; passkey?: string }

function saveResumeInfo(info: ResumeInfo): void {
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify(info))
  } catch {}
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
