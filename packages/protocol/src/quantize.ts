import { POSITION_SCALE, WORLD_HALF_EXTENT_M } from './constants'

/**
 * Wire quantization. Every avatar is 10 bytes:
 *   uint16 sid | int16 x | int16 y | int16 z | uint8 yaw | uint8 anim
 *
 * Encoder and decoder both live here so they cannot drift. A mismatch would not
 * throw — it would put an avatar 300 metres underground, which is far harder to
 * diagnose than a stack trace.
 */

export const INT16_MIN = -32768
export const INT16_MAX = 32767

export class SceneryBoundsError extends Error {
  constructor(sceneryId: string, extent: number) {
    super(
      `Scenery '${sceneryId}' has a half-extent of ${extent}m, which exceeds the ` +
        `${WORLD_HALF_EXTENT_M}m the int16-centimetre wire format can represent. ` +
        `Shrink the play area or change POSITION_SCALE.`,
    )
    this.name = 'SceneryBoundsError'
  }
}

/** Call at module load for every scenery descriptor, so this fails at boot, not in play. */
export function assertSceneryBounds(sceneryId: string, halfExtentM: number): void {
  if (halfExtentM > WORLD_HALF_EXTENT_M) throw new SceneryBoundsError(sceneryId, halfExtentM)
}

const clampInt16 = (v: number) => (v < INT16_MIN ? INT16_MIN : v > INT16_MAX ? INT16_MAX : v)

/** Metres -> int16 centimetres. Clamps rather than wrapping. */
export function toCm(metres: number): number {
  return clampInt16(Math.round(metres * POSITION_SCALE))
}

export function fromCm(cm: number): number {
  return cm / POSITION_SCALE
}

/**
 * Yaw only — social avatars never pitch or roll, and a full quaternion would cost
 * 4x the bytes for rotation nobody can perceive. uint8 gives 1.41 degrees.
 */
const TAU = Math.PI * 2

export function packYaw(radians: number): number {
  const wrapped = ((radians % TAU) + TAU) % TAU
  return Math.round((wrapped / TAU) * 256) & 0xff
}

export function unpackYaw(packed: number): number {
  return ((packed & 0xff) / 256) * TAU
}

/** Low nibble = animation enum, high nibble = boolean flags. */
export const ANIM_STATES = ['idle', 'walk', 'run', 'sit', 'wave', 'swim', 'surf', 'sleep'] as const
export type AnimState = (typeof ANIM_STATES)[number]

export const AVATAR_FLAG = {
  grounded: 1 << 0,
  sprinting: 1 << 1,
  emoting: 1 << 2,
  afk: 1 << 3,
} as const

export function packAnim(state: AnimState, flags: number): number {
  const index = ANIM_STATES.indexOf(state)
  return ((index < 0 ? 0 : index) & 0x0f) | ((flags & 0x0f) << 4)
}

export function unpackAnim(packed: number): { state: AnimState; flags: number } {
  return {
    state: ANIM_STATES[packed & 0x0f] ?? 'idle',
    flags: (packed >> 4) & 0x0f,
  }
}
