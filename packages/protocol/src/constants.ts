/**
 * Shared room + wire constants. Imported by both the client engine and (from v0.2)
 * the Colyseus server, so these numbers can never drift between encoder and decoder.
 */

export const ROOM_KINDS = ['solo', 'public', 'org'] as const
export type RoomKind = (typeof ROOM_KINDS)[number]

/**
 * `solo` is deliberately 1 — a private room is a personal space, not an invite-only
 * group. That decision is what removes invite codes, memberships, and the whole
 * shared-private-room abuse surface.
 */
export const ROOM_LIMITS = {
  solo: { maxClients: 1, quotaApplies: false },
  public: { maxClients: 100, quotaApplies: true },
  org: { maxClients: 100, quotaApplies: true },
} as const satisfies Record<RoomKind, { maxClients: number; quotaApplies: boolean }>

/** Client -> server input rate. Send-on-change, with a keepalive at IDLE_KEEPALIVE_HZ. */
export const INPUT_HZ = 10
export const IDLE_KEEPALIVE_HZ = 1

/** Server -> client merged snapshot rate. One binary frame per client per tick. */
export const SNAPSHOT_HZ = 10

/** Colyseus Schema patch rate for slow state (roster, music cursor, thoughts). */
export const SCHEMA_PATCH_MS = 200

/** Render this many ms in the past so interpolation always has two samples to blend. */
export const INTERP_DELAY_MS = 100
export const MAX_EXTRAPOLATION_MS = 250

/**
 * Area-of-interest. The neighbour cap is the load-bearing part: everyone crowding
 * one viewpoint is the expected behaviour in a chill space, not an edge case, and
 * without the cap the spatial grid degenerates back to O(n^2) fan-out.
 */
export const AOI_CELL_SIZE_M = 30
export const MAX_NEIGHBOURS = 24
export const AOI_NEAR_M = 10
export const AOI_MID_M = 30

/**
 * Positions travel as int16 centimetres, so every scenery must fit inside this box.
 * `assertSceneryBounds` enforces it at module load rather than letting an avatar
 * silently wrap to the far side of the world.
 */
export const POSITION_SCALE = 100 // cm per metre
export const WORLD_HALF_EXTENT_M = 327.67

/** Thoughts. One shared daily budget across public + org; solo has no quota. */
export const THOUGHT_MAX_GRAPHEMES = 140
export const THOUGHT_DAILY_LIMIT = 100
export const THOUGHT_BURST_MS = 2000
export const THOUGHT_AUTHOR_COOLDOWN_MS = 60_000
/** Below this many remaining, the composer starts showing the waning moon. */
export const THOUGHT_MOON_VISIBLE_BELOW = 20

/** Presentation caps — distinct from AoI, which governs delivery. */
export const MAX_BLOOMED_THOUGHTS = 12
export const THOUGHT_BLOOM_INTERVAL_MS = 2500
export const THOUGHT_LIFETIME_MS = 90_000

export const QUOTA_TIMEZONE = 'Asia/Bangkok'

/**
 * LAN-only multiplayer (see `lan/`). A fixed, shared port so a joining guest never
 * needs to be told anything beyond the host's address — the host's own machine is
 * always reachable at `ws://<host-lan-ip>:LAN_RELAY_PORT`, and the host's own tab talks
 * to it over loopback (`ws://localhost:LAN_RELAY_PORT`), never its LAN IP.
 */
export const LAN_RELAY_PORT = 3101

/** ~5s ping / ~15s timeout — long enough that ordinary WiFi jitter never trips it,
 * short enough that a lid-closed laptop's avatar doesn't linger as a ghost for however
 * long the OS/TCP stack takes to notice a dead socket on its own. */
export const LAN_HEARTBEAT_PING_MS = 5_000
export const LAN_HEARTBEAT_TIMEOUT_MS = 15_000

/** Client reconnect backoff, capped — a LAN drop is rare and brief, so this is a plain
 * "try again as a new session," not the internet-deployment 30s resume design. */
export const LAN_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const

/** Target-practice mini-game: how many targets are in one scenery's cluster. Shared
 * by the relay (tracks `targetStates: boolean[]` at this length) and `TargetField`
 * (builds exactly this many instances) so they can never disagree on array length. */
export const TARGET_COUNT = 6
