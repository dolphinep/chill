/**
 * FOV/damping defaults and ranges — the one source of truth `CameraRig` (which needs
 * them to clamp) and `comfortStore` (which needs them for the slider UI) both read from.
 *
 * Deliberately not just re-exported from `CameraRig.ts`: that file pulls in `three/webgpu`,
 * and `comfortStore.ts` is imported directly by a HUD component that renders outside the
 * dynamic-import boundary around the engine (`EngineCanvas.tsx` dynamically imports
 * `engine/core/Engine` specifically to keep three.js out of the initial bundle — see S1).
 * A leaf module with no three.js/React import is what keeps that boundary real instead
 * of nominal.
 */

export const DEFAULT_FOV = 62
export const MIN_FOV = 50
export const MAX_FOV = 90

/** "Camera damping ~0.12" (plan) — a `setTargetAtTime`-style time constant, seconds. */
export const DEFAULT_DAMPING = 0.12
export const MAX_DAMPING = 0.45
