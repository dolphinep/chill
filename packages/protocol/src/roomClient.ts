import type { RoomKind } from './constants'
import type { AnimState } from './quantize'

/**
 * The seam that makes v0.1 -> v0.2 cheap.
 *
 * v0.1 ships only `LoopbackRoomClient` (you, plus optional scripted bots) so the
 * whole 3D app is developable with no backend at all. v0.2 adds `ColyseusRoomClient`
 * behind this *unchanged* interface. Skipping this in v0.1 to save a day costs three.
 *
 * Everything here is plain data — no Colyseus types leak across this boundary, so
 * the engine never learns which transport it is talking to.
 */

export type Unsubscribe = () => void

/** Room-scoped uint16. Never a UUID — those would be 16 bytes at 10 Hz. */
export type Sid = number

export type ConnectOptions = {
  kind: RoomKind
  sceneryId: string
  /** Lazily fetched, because a reconnect after the window needs a *fresh* token. */
  getToken?: () => Promise<string>
}

export type LocalInput = {
  x: number
  y: number
  z: number
  yaw: number
  anim: AnimState
  flags: number
}

export type AvatarState = {
  sid: Sid
  displayName: string
  preset: number
  color: number
  /** Server-set. A guest literally cannot render a verified badge. */
  badge: number
  x: number
  y: number
  z: number
  yaw: number
  anim: AnimState
  flags: number
}

export type Snapshot = {
  seq: number
  serverTimeMs: number
  avatars: AvatarState[]
}

export type Thought = {
  id: number
  sid: Sid
  text: string
  sentAtEpochS: number
  kind: 'thought' | 'reaction' | 'system'
}

export type ThoughtRejection = {
  ok: false
  reason: 'burst' | 'daily_quota' | 'blocked' | 'bad_payload'
  retryAfterMs?: number
  remaining?: number
  resetsAt?: string
}

export type ThoughtAccepted = {
  ok: true
  id: number
  /** Always returned, so the composer can draw the moon without polling. */
  remaining: number | null
}

export type ThoughtResult = ThoughtAccepted | ThoughtRejection

/** A thrown object — same "fire and forget, no round-trip needed for the local
 * thrower" reasoning as `Thought`: the local throw already spawned instantly with
 * zero latency, this is purely so *other* clients see it too. `kind` is a plain
 * string, not `ProjectileMaterialType` — that type lives in `apps/web`, and this
 * package must stay a leaf dependency (same reasoning as `AvatarConfigPayload`). */
export type ThrowEvent = {
  sid: Sid
  x: number
  y: number
  z: number
  dirX: number
  dirY: number
  dirZ: number
  kind: string
}

/** Target-practice mini-game: any player's throw can knock one down (broadcast like
 * `Thought`/`ThrowEvent`, no host-gating — see `RoomClient.sendTargetHit`'s doc
 * comment), but only the host may reset the board once it's cleared (same authority
 * model as scenery/time-of-day). */
export type TargetHitEvent = {
  targetId: number
}

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed'

/**
 * Roster changes (who's here, what they look like) arrive far less often than
 * position — bundling them into `onSnapshot` would mean re-diffing a whole
 * customization payload every network tick for no reason. Additive to the interface
 * (not part of the original plan design): a transport with no roster concept at all
 * (e.g. a future solo `LoopbackRoomClient`) can leave this a no-op — there's nothing
 * behind it to subscribe to.
 */
export type RosterEvent =
  | { type: 'join'; sid: Sid; name: string; avatarConfig: Record<string, string> }
  | { type: 'update'; sid: Sid; name: string; avatarConfig: Record<string, string> }
  | { type: 'leave'; sid: Sid }

export type PlacedProp = {
  id: string
  type:
    | 'campfire'
    | 'firework'
    | 'sign'
    | 'lantern'
    | 'bench'
    | 'tent'
    | 'tea_table'
    | 'sakura_pot'
    | 'radio'
    | 'zen_stones'
    | 'volleyball_court'
    | 'skeet_stand'
    | 'companion'
    | 'quote_billboard'
  x: number
  y: number
  z: number
  yaw: number
  active?: boolean
  text?: string
  authorSid?: Sid
  authorName?: string
  createdAtEpochS?: number
}

export type PropInteractionEvent = {
  propId: string
  action: 'toggle' | 'firework'
  active?: boolean
}

export type VolleyballEvent = {
  courtId: string
  action: 'join' | 'leave' | 'start' | 'hit' | 'point' | 'reset'
  team?: 'red' | 'blue'
  sid?: Sid
  name?: string
  ball?: { x: number; y: number; z: number; vx: number; vy: number; vz: number }
  scoreRed?: number
  scoreBlue?: number
  winner?: 'red' | 'blue'
}

export type SkeetEvent = {
  action: 'start' | 'launch' | 'hit' | 'reset'
  wave?: number
  totalWaves?: number
  targets?: { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }[]
  targetId?: number
  sid?: Sid
  hitterName?: string
  score?: number
}

export interface RoomClient {
  readonly state: ConnectionState
  /** Your own sid, once connected. */
  readonly sid: Sid | null

  connect(opts: ConnectOptions): Promise<void>
  disconnect(): void

  sendInput(input: LocalInput): void
  /** Broadcasts a mid-session avatar customization change (hair, outfit, colors) to
   * everyone else — `'join'` only carries this once, at connect time, so without a
   * distinct way to re-announce it, a player changing their look after joining was
   * invisible to everyone else in the room. Always the full config, not a diff; part
   * of this shared interface (not LAN-specific) because `Engine.ts` calls it directly
   * whenever the local player's `ChibiAvatarMesh` config changes, same reasoning as
   * `announceTimeOfDay`. */
  sendAvatarUpdate(avatarConfig: Record<string, string>): void
  sendThought(text: string): Promise<ThoughtResult>
  /** Fire-and-forget, same reasoning as `sendThought` — the local throw already
   * happened with zero round-trip latency; this only tells everyone else. */
  sendThrow(event: Omit<ThrowEvent, 'sid'>): void
  /** Open to anyone, not host-gated — any player's ball can knock a target down, so
   * any player's client can claim it happened. The relay does no validation beyond
   * message shape (same trust level as `sendInput`/`sendThought`) — see this
   * package's own doc comment on why a LAN relay among friends doesn't need one. */
  sendTargetHit(targetId: number): void
  /** Host-only in practice — same authority model as `announceScenery`'s doc comment
   * on `LanRoomClient`, but reachable through this shared interface (unlike that
   * method) because `Engine.ts` triggers a reset directly, not the app's React layer. */
  announceTargetsReset(): void
  /** Host-only in practice — the relay broadcasts this to all connected guests to switch active scenery */
  announceScenery(sceneryId: string): void
  /** Open to anyone, not host-gated — dragging the day-cycle dial is cosmetic and
   * frequent, not a "which place are we all in" decision the way scenery is. Last
   * write wins; no ordering or merge logic, same trust level as `sendInput`. Part of
   * this shared interface (unlike `LanRoomClient`'s own `announceScenery`) because
   * `Engine.ts` calls it directly whenever the local player drags `SkyClock`, not the
   * app's React layer. `progress` is the same 0-1 fraction-of-a-day
   * `setTimeNormalized` already uses. */
  announceTimeOfDay(progress: number): void
  /** Places an interactive prop into the shared world */
  sendPlaceProp(prop: PlacedProp): void
  /** Updates text and author on an existing sign or billboard */
  sendUpdatePropText(propId: string, text: string, authorName?: string): void
  /** Interacts with an existing prop (e.g. toggle fire on/off, launch firework) */
  sendInteractProp(propId: string, action: 'toggle' | 'firework', active?: boolean): void
  /** Synchronizes Volleyball court actions & physics */
  sendVolleyballAction(event: VolleyballEvent): void
  /** Synchronizes Skeet / Clay Pigeon shooting actions & target states */
  sendSkeetAction(event: SkeetEvent): void

  onSnapshot(cb: (snapshot: Snapshot) => void): Unsubscribe
  onThought(cb: (thought: Thought) => void): Unsubscribe
  onThrow(cb: (event: ThrowEvent) => void): Unsubscribe
  onTargetHit(cb: (event: TargetHitEvent) => void): Unsubscribe
  onTargetsReset(cb: () => void): Unsubscribe
  onSceneryChange(cb: (sceneryId: string) => void): Unsubscribe
  onTimeOfDayChange(cb: (progress: number) => void): Unsubscribe
  onStateChange(cb: (state: ConnectionState) => void): Unsubscribe
  onRoster(cb: (event: RosterEvent) => void): Unsubscribe
  onPropPlaced(cb: (prop: PlacedProp) => void): Unsubscribe
  onPropTextUpdated(
    cb: (data: { propId: string; text: string; authorName?: string }) => void,
  ): Unsubscribe
  onPropInteracted(cb: (data: PropInteractionEvent) => void): Unsubscribe
  onVolleyballAction(cb: (data: VolleyballEvent) => void): Unsubscribe
  onSkeetAction(cb: (data: SkeetEvent) => void): Unsubscribe

  /**
   * Whoever was already in the room the instant `connect()` resolved. Synchronous and
   * always available (not just an event) specifically so a *new* subscriber — like
   * `Engine.init()` computing where to spawn — can use it without racing the first
   * `onSnapshot`/`onRoster` firing before its own subscription existed. A solo
   * transport with nobody else ever in the room (e.g. `LoopbackRoomClient`) just
   * returns `[]`.
   */
  getInitialAvatars(): AvatarState[]

  /**
   * The customization half of "whoever was already here" — `getInitialAvatars()`'s
   * counterpart, split the same way `onSnapshot`/`onRoster` are. Without this, a late
   * subscriber (again, `Engine.init()`, constructing a `RemoteAvatar` per existing
   * peer) has positions but no idea what any of them look like — `onRoster`'s `'join'`
   * events for these same peers already fired, before this connection's subscriber
   * existed, and are gone.
   */
  getInitialRoster(): { sid: Sid; name: string; avatarConfig: Record<string, string> }[]

  /** Same "catch me up" reasoning as `getInitialAvatars`/`getInitialRoster` — whether
   * each target was already knocked down the instant `connect()` resolved, since a
   * `targetHit` broadcast from before this connection existed is gone by the time a
   * late joiner could subscribe to `onTargetHit`. Index-aligned with whatever the
   * caller's own target list order is; `[]` for a transport with no mini-game concept
   * at all (e.g. `LoopbackRoomClient`). */
  getInitialTargetStates(): boolean[]

  /** Same "catch me up" reasoning again — the room's current time-of-day progress the
   * instant `connect()` resolved. Without this, a late joiner would keep rendering
   * whatever local default (`Engine.init()`'s own real-wall-clock guess) they started
   * with until the next time *someone else* drags the dial, rather than seeing the
   * time everyone already agreed on. `0.5` (midday) for a transport with no
   * time-of-day concept at all. */
  getInitialTimeOfDay(): number

  /** Placed props that were already present when connecting. */
  getInitialProps(): PlacedProp[]
}
