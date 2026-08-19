import type { Sid, SkeetEvent } from '../roomClient'
import type { AnimState } from '../quantize'

/**
 * The LAN relay's wire format: plain JSON, one message per WS text frame, not the
 * binary format in `quantize.ts`. At 7-20 players and 10Hz, LAN bandwidth is a
 * non-issue, so the deciding factor is build speed, not bytes — and the binary format
 * is built around an area-of-interest system this feature doesn't need (no 24-neighbour
 * cap problem in a single room this small). Shared by both `LanRoomClient` (browser)
 * and the relay script (Node), so they can never drift apart.
 *
 * `packages/protocol` is a leaf package and must not depend on `apps/web` — so avatar
 * customization travels as a plain string record here, not the app's exact
 * `ChibiAvatarConfig` type. Every field that config actually has is a style enum or a
 * hex color, i.e. already a string, so this is accurate, not a lossy stand-in.
 * `apps/web`'s call sites cast this to `ChibiAvatarConfig` at the boundary.
 */
export type AvatarConfigPayload = Record<string, string>

export type LanRosterEntry = {
  sid: Sid
  name: string
  avatarConfig: AvatarConfigPayload
}

export type LanAvatarSnapshotEntry = {
  sid: Sid
  x: number
  y: number
  z: number
  yaw: number
  anim: AnimState
  flags: number
}

export type PlacedPropPayload = {
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

export type VolleyballActionPayload = {
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

/** Client -> relay. */
export type LanClientMessage =
  | {
      t: 'join'
      name: string
      avatarConfig: AvatarConfigPayload
      sceneryId?: string
      /** Only meaningful from whoever becomes host (the relay ignores it from anyone
       * else, same as `scenery`/`timeOfDay`) — a label the host picks once, baked into
       * the shareable link (`?room=`) so a guest can visually confirm "yes, this is
       * the right link" before/after joining. Not a room *identifier* — this relay
       * process still only ever holds the one room; a guest still needs the host's
       * actual address to reach it at all. */
      roomName?: string
    }
  | { t: 'input'; x: number; y: number; z: number; yaw: number; anim: AnimState; flags: number }
  | { t: 'thought'; text: string }
  /** Sent whenever the local player changes their avatar customization mid-session —
   * `'join'` only carries the config once, at connect time, so without this a
   * mid-session change (hair, outfit, colors) had no way to ever reach anyone else.
   * Always the FULL config, not a diff, matching what `'join'`/`'roster'` already
   * carry — the relay just overwrites its stored copy and rebroadcasts, no merge
   * logic needed on either end. */
  | { t: 'updateAvatar'; avatarConfig: AvatarConfigPayload }
  | {
      t: 'throw'
      x: number
      y: number
      z: number
      dirX: number
      dirY: number
      dirZ: number
      kind: string
    }
  /** Host-authoritative — the relay accepts these ONLY from the socket it marked as
   * host (the first ever `join` on that relay process) and silently drops them from
   * anyone else. Sent by every client on connect regardless (a guest's own scenery
   * choice is meaningless to announce and the relay just ignores it), which means the
   * client never needs to know its own host/guest status in advance. */
  | { t: 'scenery'; sceneryId: string }
  /** Open to anyone, unlike `scenery` above — dragging the day-cycle dial is a purely
   * cosmetic, frequent, low-stakes change, not a "which physical place are we all in"
   * decision. `progress` is the same 0-1 fraction-of-a-day `SkyClock`/
   * `setTimeNormalized` already use — last write wins, no ordering/merge logic, same
   * trust level as `input`/`thought`. */
  | { t: 'timeOfDay'; progress: number }
  /** Open to anyone — any player's throw can knock a target down. */
  | { t: 'targetHit'; targetId: number }
  /** Host-authoritative, same reasoning as `scenery`/`timeOfDay` above. */
  | { t: 'targetsReset' }
  /** Prop placement (campfire, firework, custom text signpost, lantern, bench, volleyball) */
  | { t: 'placeProp'; prop: PlacedPropPayload }
  | { t: 'updatePropText'; propId: string; text: string; authorName?: string }
  | { t: 'interactProp'; propId: string; action: 'toggle' | 'firework'; active?: boolean }
  | { t: 'volleyball'; payload: VolleyballActionPayload }
  | { t: 'skeet'; payload: SkeetActionPayload }

export type SkeetActionPayload = SkeetEvent

/** Relay -> client. */
export type LanServerMessage =
  /** Sent once, only to the client that just joined — the rest of the session is
   * ongoing `snapshot`/`roster`/`thought` broadcasts. */
  | {
      t: 'welcome'
      sid: Sid
      sceneryId: string
      timeOfDay: number
      roomName: string | null
      roster: LanRosterEntry[]
      avatars: LanAvatarSnapshotEntry[]
      /** Index-aligned with `TARGET_COUNT` (`../constants`) — whether each target-
       * practice prop is currently knocked down, so a late joiner sees the actual
       * board instead of a fresh one. Reset to all-`false` by the relay whenever the
       * scenery changes (a different scenery's cluster is a different physical
       * board — see `lan-relay.ts`). */
      targetStates: boolean[]
      props: PlacedPropPayload[]
    }
  /** Broadcast to everyone, including back to each sender — simpler than a
   * per-recipient exclusion list; the client just skips its own `sid` on apply. */
  | { t: 'snapshot'; seq: number; avatars: LanAvatarSnapshotEntry[] }
  | { t: 'roster'; sid: Sid; name: string; avatarConfig: AvatarConfigPayload }
  | { t: 'leave'; sid: Sid }
  | { t: 'thought'; sid: Sid; id: number; text: string; sentAtEpochS: number }
  | {
      t: 'throw'
      sid: Sid
      x: number
      y: number
      z: number
      dirX: number
      dirY: number
      dirZ: number
      kind: string
    }
  | { t: 'scenery'; sceneryId: string }
  | { t: 'timeOfDay'; progress: number }
  | { t: 'targetHit'; sid: Sid; targetId: number }
  | { t: 'targetsReset' }
  | { t: 'placeProp'; prop: PlacedPropPayload }
  | { t: 'updatePropText'; propId: string; text: string; authorName?: string }
  | { t: 'interactProp'; propId: string; action: 'toggle' | 'firework'; active?: boolean }
  | { t: 'volleyball'; payload: VolleyballActionPayload }
  | { t: 'skeet'; payload: SkeetActionPayload }
