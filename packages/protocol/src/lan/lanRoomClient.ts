import type {
  RoomClient,
  ConnectOptions,
  LocalInput,
  Snapshot,
  Thought,
  ThoughtResult,
  ThrowEvent,
  TargetHitEvent,
  ConnectionState,
  Unsubscribe,
  Sid,
  AvatarState,
  RosterEvent,
  VolleyballEvent,
  SkeetEvent,
} from '../roomClient'
import { LAN_RETRY_DELAYS_MS } from '../constants'
import type {
  LanClientMessage,
  LanServerMessage,
  LanAvatarSnapshotEntry,
  AvatarConfigPayload,
  PlacedPropPayload,
} from './messages'

export type LanRoomClientOptions = {
  /** e.g. `ws://192.168.1.23:3101` for a guest, `ws://localhost:3101` for the host —
   * the host's own tab always talks to the relay over loopback, never its own LAN IP,
   * so there is no "connecting to myself over the network" case to special-case. */
  url: string
  name: string
  avatarConfig: AvatarConfigPayload
  /** Only meaningful when this connection becomes host — see `LanClientMessage`'s
   * `'join'` doc comment. Ignored (and irrelevant) for a guest; whoever's actually
   * hosting is echoed back to everyone via `welcome`/`getRoomName()` regardless. */
  roomName?: string
}

/**
 * `RoomClient` over a plain WebSocket relay, for LAN-only sessions (see
 * `scripts/lan-relay.ts` for the server this talks to). A dumb relay for friends
 * physically in the same room, not an adversarial transport: no auth, no server-side
 * physics/anti-cheat.
 *
 * Reconnection is deliberately the cheap version, not the internet-deployment
 * 30s-resume/frozen-avatar design: a dropped connection just retries with backoff
 * (`LAN_RETRY_DELAYS_MS`) and rejoins as a brand-new session. The old avatar
 * disappears via the relay's normal `leave` broadcast and a fresh one appears on
 * rejoin — a LAN drop is rare and brief enough that this is not worth the complexity
 * a stateful resume needs.
 *
 * `AvatarState.preset`/`.color`/`.badge` (part of the pre-existing `RoomClient`
 * interface, predating `ChibiAvatarConfig`) are left inert here — real avatar
 * customization travels through `onRoster` instead, deliberately kept off the hot
 * per-tick snapshot path. See this package's `RosterEvent` doc comment.
 */
export class LanRoomClient implements RoomClient {
  #url: string
  #name: string
  #avatarConfig: AvatarConfigPayload
  #requestedRoomName?: string
  /** Whatever the relay actually confirmed via `welcome` — for the host this should
   * just echo `#requestedRoomName` back; for a guest, this is the only way they ever
   * learn it. `null` until the first `welcome` arrives. */
  #roomName: string | null = null
  #ws: WebSocket | null = null
  #state: ConnectionState = 'idle'
  #sid: Sid | null = null
  #lastConnectOpts: ConnectOptions | null = null
  #closedByUser = false
  #retryAttempt = 0
  #retryTimer: ReturnType<typeof setTimeout> | null = null
  #nextLocalThoughtId = 1
  /** Cached purely to fill `AvatarState.displayName` on the snapshot path — the
   * authoritative roster data (including `avatarConfig`) flows through `onRoster`. */
  #knownNames = new Map<Sid, string>()
  /** Whoever was already here when `welcome` arrived — see `getInitialAvatars`'s doc
   * comment on the `RoomClient` interface for why this exists as a synchronous query
   * rather than only an event. */
  #initialAvatars: AvatarState[] = []
  /** `getInitialAvatars`'s customization counterpart — see `getInitialRoster`'s doc
   * comment on the `RoomClient` interface. */
  #initialRoster: { sid: Sid; name: string; avatarConfig: AvatarConfigPayload }[] = []
  /** `getInitialAvatars`/`getInitialRoster`'s mini-game counterpart — see
   * `getInitialTargetStates`'s doc comment on the `RoomClient` interface. */
  #initialTargetStates: boolean[] = []
  /** `getInitialTargetStates`'s time-of-day counterpart — see that field's doc
   * comment on the `RoomClient` interface. `0.5` (midday) until `welcome` arrives. */
  #initialTimeOfDay = 0.5
  #initialProps: PlacedPropPayload[] = []
  /** Resolves the in-flight `connect()` — set by `#openSocket`, called by the
   * `'welcome'` case in `#handleMessage`. `connect()` intentionally waits for
   * `welcome`, not just the socket opening: a caller like `Engine.init()` computing a
   * spawn point needs `getInitialAvatars()` to already be populated the instant
   * `connect()` resolves. */
  #connectResolve: (() => void) | null = null

  #snapshotCbs = new Set<(s: Snapshot) => void>()
  #thoughtCbs = new Set<(t: Thought) => void>()
  #throwCbs = new Set<(e: ThrowEvent) => void>()
  #targetHitCbs = new Set<(e: TargetHitEvent) => void>()
  #targetsResetCbs = new Set<() => void>()
  #stateCbs = new Set<(s: ConnectionState) => void>()
  #rosterCbs = new Set<(e: RosterEvent) => void>()
  #sceneryCbs = new Set<(sceneryId: string) => void>()
  #timeOfDayCbs = new Set<(progress: number) => void>()
  #propCbs = new Set<(prop: PlacedPropPayload) => void>()
  #propTextCbs = new Set<
    (data: { propId: string; text: string; authorName?: string }) => void
  >()
  #propInteractCbs = new Set<
    (data: { propId: string; action: 'toggle' | 'firework'; active?: boolean }) => void
  >()

  constructor(opts: LanRoomClientOptions) {
    this.#url = opts.url
    this.#name = opts.name
    this.#avatarConfig = opts.avatarConfig
    this.#requestedRoomName = opts.roomName
  }

  get state(): ConnectionState {
    return this.#state
  }

  get sid(): Sid | null {
    return this.#sid
  }

  async connect(opts: ConnectOptions): Promise<void> {
    this.#closedByUser = false
    this.#lastConnectOpts = opts
    this.#retryAttempt = 0
    await this.#openSocket()
  }

  disconnect(): void {
    this.#closedByUser = true
    if (this.#retryTimer) {
      clearTimeout(this.#retryTimer)
      this.#retryTimer = null
    }
    this.#ws?.close()
    this.#ws = null
    this.#setState('closed')
  }

  sendInput(input: LocalInput): void {
    this.#send({
      t: 'input',
      x: input.x,
      y: input.y,
      z: input.z,
      yaw: input.yaw,
      anim: input.anim,
      flags: input.flags,
    })
  }

  sendAvatarUpdate(avatarConfig: AvatarConfigPayload): void {
    this.#avatarConfig = avatarConfig
    this.#send({ t: 'updateAvatar', avatarConfig })
  }

  async sendThought(text: string): Promise<ThoughtResult> {
    // No quota/burst policy on a LAN relay — resolves optimistically as soon as the
    // frame is sent. The relay broadcasts the real message back to everyone including
    // us; the app's `ThoughtField.postRemote` already de-dupes by id/author, so this
    // locally-generated id is only ever used for this Promise's return value, never
    // for cross-client identity.
    this.#send({ t: 'thought', text })
    return { ok: true, id: this.#nextLocalThoughtId++, remaining: null }
  }

  sendThrow(event: Omit<ThrowEvent, 'sid'>): void {
    this.#send({ t: 'throw', ...event })
  }

  sendTargetHit(targetId: number): void {
    this.#send({ t: 'targetHit', targetId })
  }

  /** Host-only in practice, same as `announceScenery`/`announceTimeOfDay` — but part
   * of `RoomClient` (unlike those two) since `Engine.ts` calls this directly rather
   * than the app's React layer. */
  announceTargetsReset(): void {
    this.#send({ t: 'targetsReset' })
  }

  /** Host-only in practice — the relay silently drops this from any non-host socket,
   * so the client never needs to know its own host/guest status in advance. Not part
   * of `RoomClient`: scenery authority is a LAN-session-specific concept (unlike
   * `announceTimeOfDay` below, which IS part of `RoomClient` — see its own doc
   * comment there on why). */
  announceScenery(sceneryId: string): void {
    this.#send({ t: 'scenery', sceneryId })
  }

  announceTimeOfDay(progress: number): void {
    this.#send({ t: 'timeOfDay', progress })
  }

  onSceneryChange(cb: (sceneryId: string) => void): Unsubscribe {
    this.#sceneryCbs.add(cb)
    return () => this.#sceneryCbs.delete(cb)
  }

  onTimeOfDayChange(cb: (progress: number) => void): Unsubscribe {
    this.#timeOfDayCbs.add(cb)
    return () => this.#timeOfDayCbs.delete(cb)
  }

  onSnapshot(cb: (snapshot: Snapshot) => void): Unsubscribe {
    this.#snapshotCbs.add(cb)
    return () => this.#snapshotCbs.delete(cb)
  }

  onThought(cb: (thought: Thought) => void): Unsubscribe {
    this.#thoughtCbs.add(cb)
    return () => this.#thoughtCbs.delete(cb)
  }

  onThrow(cb: (event: ThrowEvent) => void): Unsubscribe {
    this.#throwCbs.add(cb)
    return () => this.#throwCbs.delete(cb)
  }

  onTargetHit(cb: (event: TargetHitEvent) => void): Unsubscribe {
    this.#targetHitCbs.add(cb)
    return () => this.#targetHitCbs.delete(cb)
  }

  onTargetsReset(cb: () => void): Unsubscribe {
    this.#targetsResetCbs.add(cb)
    return () => this.#targetsResetCbs.delete(cb)
  }

  onStateChange(cb: (state: ConnectionState) => void): Unsubscribe {
    this.#stateCbs.add(cb)
    return () => this.#stateCbs.delete(cb)
  }

  onRoster(cb: (event: RosterEvent) => void): Unsubscribe {
    this.#rosterCbs.add(cb)
    return () => this.#rosterCbs.delete(cb)
  }

  #volleyballCbs = new Set<(data: VolleyballEvent) => void>()
  #skeetCbs = new Set<(data: SkeetEvent) => void>()

  sendPlaceProp(prop: PlacedPropPayload): void {
    this.#send({ t: 'placeProp', prop })
  }

  sendUpdatePropText(propId: string, text: string, authorName?: string): void {
    this.#send({ t: 'updatePropText', propId, text, authorName })
  }

  sendInteractProp(propId: string, action: 'toggle' | 'firework', active?: boolean): void {
    this.#send({ t: 'interactProp', propId, action, active })
  }

  sendVolleyballAction(event: VolleyballEvent): void {
    this.#send({ t: 'volleyball', payload: event })
  }

  sendSkeetAction(event: SkeetEvent): void {
    this.#send({ t: 'skeet', payload: event })
  }

  onPropPlaced(cb: (prop: PlacedPropPayload) => void): Unsubscribe {
    this.#propCbs.add(cb)
    return () => this.#propCbs.delete(cb)
  }

  onPropTextUpdated(
    cb: (data: { propId: string; text: string; authorName?: string }) => void,
  ): Unsubscribe {
    this.#propTextCbs.add(cb)
    return () => this.#propTextCbs.delete(cb)
  }

  onPropInteracted(
    cb: (data: { propId: string; action: 'toggle' | 'firework'; active?: boolean }) => void,
  ): Unsubscribe {
    this.#propInteractCbs.add(cb)
    return () => this.#propInteractCbs.delete(cb)
  }

  onVolleyballAction(cb: (data: VolleyballEvent) => void): Unsubscribe {
    this.#volleyballCbs.add(cb)
    return () => this.#volleyballCbs.delete(cb)
  }

  onSkeetAction(cb: (data: SkeetEvent) => void): Unsubscribe {
    this.#skeetCbs.add(cb)
    return () => this.#skeetCbs.delete(cb)
  }

  getInitialProps(): PlacedPropPayload[] {
    return this.#initialProps
  }

  getInitialAvatars(): AvatarState[] {
    return this.#initialAvatars
  }

  getInitialRoster(): { sid: Sid; name: string; avatarConfig: Record<string, string> }[] {
    return this.#initialRoster
  }

  getInitialTargetStates(): boolean[] {
    return this.#initialTargetStates
  }

  getInitialTimeOfDay(): number {
    return this.#initialTimeOfDay
  }

  /** The relay-confirmed room name — `null` until `welcome` arrives, and possibly
   * still `null` afterward if nobody (including the host) ever set one. */
  getRoomName(): string | null {
    return this.#roomName
  }

  #send(msg: LanClientMessage): void {
    if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify(msg))
  }

  #setState(state: ConnectionState): void {
    if (state === this.#state) return
    this.#state = state
    this.#stateCbs.forEach((cb) => cb(state))
  }

  async #openSocket(): Promise<void> {
    this.#setState(this.#retryAttempt > 0 ? 'reconnecting' : 'connecting')

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.#url)
      this.#ws = ws
      // Per-attempt settlement flag — NOT `this.#state`, which is shared across every
      // attempt and gets reassigned by the very next retry before this one's own
      // timeout/close fires. Checking `this.#state === 'connecting'` here used to mean
      // a retry attempt (state `'reconnecting'`) could fail immediately (relay still
      // down) without ever rejecting THIS promise — it just hung until its own 8s
      // timeout fired, by which point a later retry may already be in flight.
      let settled = false

      // A socket that opens but never gets a `welcome` back (relay hung, a firewall
      // silently dropping packets post-handshake) would otherwise wait forever — every
      // other exit path here is event-driven, so this is the one timeout backstop.
      const welcomeTimeout = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('LanRoomClient: no welcome from relay'))
      }, 8000)
      this.#connectResolve = () => {
        if (settled) return
        settled = true
        clearTimeout(welcomeTimeout)
        resolve()
      }

      ws.addEventListener('open', () => {
        this.#retryAttempt = 0
        this.#send({
          t: 'join',
          name: this.#name,
          avatarConfig: this.#avatarConfig,
          sceneryId: this.#lastConnectOpts?.sceneryId,
          roomName: this.#requestedRoomName,
        })
        if (this.#lastConnectOpts?.sceneryId) this.announceScenery(this.#lastConnectOpts.sceneryId)
      })

      ws.addEventListener('message', (event) => {
        this.#handleMessage(event.data as string)
      })

      // 'close' always follows 'error' for a WebSocket, and fires for every failure
      // mode (never opened at all, dropped mid-session, rejected by the relay) — so
      // settling this promise here, once, covers all of them instead of splitting the
      // logic between 'error' and 'close'.
      ws.addEventListener('close', () => {
        this.#ws = null
        this.#sid = null
        if (this.#closedByUser) {
          this.#setState('closed')
        } else {
          this.#setState('reconnecting')
          this.#scheduleRetry()
        }
        if (!settled) {
          settled = true
          clearTimeout(welcomeTimeout)
          reject(new Error('LanRoomClient: connection closed before welcome'))
        }
      })

      ws.addEventListener('error', () => {
        // No-op: 'close' (above) always follows and is what actually settles the
        // promise. This listener only exists so an 'error' event never goes
        // completely unhandled.
      })
    })
  }

  #scheduleRetry(): void {
    if (this.#closedByUser) return
    const delay = LAN_RETRY_DELAYS_MS[Math.min(this.#retryAttempt, LAN_RETRY_DELAYS_MS.length - 1)]!
    this.#retryAttempt++
    this.#retryTimer = setTimeout(() => {
      // Deliberately swallowed, not left unhandled: this retry's own promise (which
      // rejects if it, too, never gets a `welcome`) is nobody's to await — the
      // original `connect()` call already settled long ago on the *first* attempt.
      // `onStateChange` is the correct way to observe ongoing reconnection health;
      // an unhandled rejection here would otherwise surface as an uncaught error on
      // every failed background retry, which is exactly what was happening before
      // this existed (see `scripts/lan-relay.ts`'s host-grace-period fix — the actual
      // bug, this is just the retry path not compounding it with a crash on top).
      this.#openSocket().catch(() => {})
    }, delay)
  }

  #handleMessage(raw: string): void {
    let msg: LanServerMessage
    try {
      msg = JSON.parse(raw) as LanServerMessage
    } catch {
      return
    }

    switch (msg.t) {
      case 'welcome': {
        this.#sid = msg.sid
        this.#roomName = msg.roomName
        this.#setState('connected')
        // The REAL bug this fixed: `welcome` carries the relay's already-current
        // scenery/time-of-day (set by the host before this client ever joined), but
        // only the dedicated `'scenery'`/`'timeOfDay'` messages were ever forwarded to
        // `onSceneryChange`/`onTimeOfDayChange` — and those only fire on a *change*
        // after joining, not on join itself. A guest joining a session already set to
        // the host's scenery would silently keep rendering on their own last-picked
        // scenery instead, since `lanSessionStore.sceneryId` never got set at all.
        // `lanSessionStore.ts` subscribes via `onSceneryChange`/`onTimeOfDayChange`
        // BEFORE calling `connect()`, so — unlike roster/avatars, which need the
        // separate `getInitialX()` synchronous-query pattern for a *later* subscriber
        // like `Engine.init()` — firing the callback here is enough.
        this.#sceneryCbs.forEach((cb) => cb(msg.sceneryId))
        this.#initialTimeOfDay = msg.timeOfDay
        this.#timeOfDayCbs.forEach((cb) => cb(msg.timeOfDay))
        // Reconcile against whoever we knew about before this `welcome` — relevant on
        // a *reconnect* (this case runs again then, not just on first connect): the
        // relay only broadcasts `leave` to sockets connected at the moment someone
        // drops, so anyone who left while *our* socket was down never reaches us as a
        // `leave` event at all. Without this, a `RemoteAvatar` for them (or whatever
        // else a consumer built from `onRoster`) becomes a permanent ghost, frozen at
        // its last known position forever, instead of ever getting disposed.
        const freshSids = new Set(msg.roster.map((entry) => entry.sid))
        for (const staleSid of this.#knownNames.keys()) {
          if (freshSids.has(staleSid)) continue
          this.#knownNames.delete(staleSid)
          this.#rosterCbs.forEach((cb) => cb({ type: 'leave', sid: staleSid }))
        }
        this.#initialRoster = msg.roster
        for (const entry of msg.roster) {
          this.#knownNames.set(entry.sid, entry.name)
          // Also fired as an event, for whatever future subscriber wants "you already
          // missed this, but here it is again" — harmless, since nothing subscribes
          // this early (`Engine.init()` reads `getInitialRoster()`/`getInitialAvatars()`
          // directly instead of racing to subscribe before `connect()` even resolves).
          this.#rosterCbs.forEach((cb) =>
            cb({
              type: 'join',
              sid: entry.sid,
              name: entry.name,
              avatarConfig: entry.avatarConfig,
            }),
          )
        }
        this.#initialAvatars = msg.avatars.map((a) => this.#toAvatarState(a))
        this.#initialTargetStates = msg.targetStates
        this.#initialProps = msg.props || []
        this.#emitSnapshot(0, msg.avatars)
        // Resolves `connect()` — see `#connectResolve`'s doc comment. Only ever fires
        // once per `#openSocket()` call (a reconnect goes through `#openSocket` again,
        // getting a fresh resolver), so no guard against double-resolution is needed.
        this.#connectResolve?.()
        this.#connectResolve = null
        break
      }
      case 'snapshot':
        this.#emitSnapshot(msg.seq, msg.avatars)
        break
      case 'roster':
        this.#knownNames.set(msg.sid, msg.name)
        this.#rosterCbs.forEach((cb) =>
          cb({ type: 'join', sid: msg.sid, name: msg.name, avatarConfig: msg.avatarConfig }),
        )
        break
      case 'leave':
        this.#knownNames.delete(msg.sid)
        this.#rosterCbs.forEach((cb) => cb({ type: 'leave', sid: msg.sid }))
        break
      case 'thought':
        this.#thoughtCbs.forEach((cb) =>
          cb({
            id: msg.id,
            sid: msg.sid,
            text: msg.text,
            sentAtEpochS: msg.sentAtEpochS,
            kind: 'thought',
          }),
        )
        break
      case 'throw':
        this.#throwCbs.forEach((cb) =>
          cb({
            sid: msg.sid,
            x: msg.x,
            y: msg.y,
            z: msg.z,
            dirX: msg.dirX,
            dirY: msg.dirY,
            dirZ: msg.dirZ,
            kind: msg.kind,
          }),
        )
        break
      case 'scenery':
        this.#sceneryCbs.forEach((cb) => cb(msg.sceneryId))
        break
      case 'timeOfDay':
        this.#timeOfDayCbs.forEach((cb) => cb(msg.progress))
        break
      case 'targetHit':
        this.#targetHitCbs.forEach((cb) => cb({ targetId: msg.targetId }))
        break
      case 'targetsReset':
        this.#targetsResetCbs.forEach((cb) => cb())
        break
      case 'placeProp':
        this.#propCbs.forEach((cb) => cb(msg.prop))
        break
      case 'updatePropText':
        this.#propTextCbs.forEach((cb) =>
          cb({ propId: msg.propId, text: msg.text, authorName: msg.authorName }),
        )
        break
      case 'interactProp':
        this.#propInteractCbs.forEach((cb) =>
          cb({ propId: msg.propId, action: msg.action, active: msg.active }),
        )
        break
      case 'volleyball':
        this.#volleyballCbs.forEach((cb) => cb(msg.payload))
        break
      case 'skeet':
        this.#skeetCbs.forEach((cb) => cb(msg.payload))
        break
    }
  }

  #toAvatarState(a: LanAvatarSnapshotEntry): AvatarState {
    return {
      sid: a.sid,
      displayName: this.#knownNames.get(a.sid) ?? '',
      // Inert — see this class's doc comment. Real customization is `onRoster`'s job.
      preset: 0,
      color: 0,
      badge: 0,
      x: a.x,
      y: a.y,
      z: a.z,
      yaw: a.yaw,
      anim: a.anim,
      flags: a.flags,
    }
  }

  #emitSnapshot(seq: number, avatars: LanAvatarSnapshotEntry[]): void {
    const mapped: AvatarState[] = avatars.map((a) => this.#toAvatarState(a))
    const snapshot: Snapshot = { seq, serverTimeMs: Date.now(), avatars: mapped }
    this.#snapshotCbs.forEach((cb) => cb(snapshot))
  }
}
