/**
 * Gerstner wave train — the CPU half.
 *
 * Gerstner rather than a heightmap or FFT for one decisive reason: it is **analytic**.
 * `surfaceAt(t, x, z)` gives an exact closed-form answer on the CPU, so buoyancy, the
 * swimming controller, and the surfboard in §4 can query the same surface the GPU
 * draws — with no readback, exactly as the terrain does. An FFT ocean would look better
 * and would force GPU readback for every one of those.
 *
 * Waves also produce horizontal displacement (the crest pinch), which is what makes them
 * read as water rather than a wobbling sheet.
 */

export type GerstnerWave = {
  /** Direction on the XZ plane; normalised on construction. */
  dirX: number
  dirZ: number
  /** Crest-to-trough height in metres. */
  amplitude: number
  /** Wavelength in metres. */
  wavelength: number
  /** Metres per second. */
  speed: number
  /** 0..1 — how much the crest pinches. Above ~0.7 per-wave the surface self-intersects. */
  steepness: number
}

export type WaveSpec = {
  waves: GerstnerWave[]
  seaLevelM: number
}

/** Kamakura Bay: a long swell, two mid crossing waves, one fine chop. */
export const KAMAKURA_WAVES: WaveSpec = {
  seaLevelM: 0,
  waves: [
    { dirX: 0.92, dirZ: 0.39, amplitude: 0.42, wavelength: 34, speed: 4.6, steepness: 0.52 },
    { dirX: 0.62, dirZ: -0.78, amplitude: 0.24, wavelength: 17, speed: 3.4, steepness: 0.44 },
    { dirX: -0.34, dirZ: 0.94, amplitude: 0.13, wavelength: 9.5, speed: 2.5, steepness: 0.36 },
    { dirX: 0.99, dirZ: -0.14, amplitude: 0.06, wavelength: 4.2, speed: 1.7, steepness: 0.28 },
  ],
}

const TAU = Math.PI * 2

/**
 * Surface position and normal at world (x, z) and time t.
 *
 * Note the input (x, z) is the *rest* position; Gerstner displaces horizontally, so the
 * returned point drifts from it. For buoyancy that is close enough — the error is under
 * the amplitude and iterating to invert it is not worth the cost.
 */
export function surfaceAt(
  spec: WaveSpec,
  t: number,
  x: number,
  z: number,
): { x: number; y: number; z: number; nx: number; ny: number; nz: number } {
  let px = x
  let py = spec.seaLevelM
  let pz = z
  // Partial derivatives accumulate into the normal.
  let dxdx = 1
  let dzdz = 1
  let dydx = 0
  let dydz = 0
  let dxdz = 0

  for (const w of spec.waves) {
    const k = TAU / w.wavelength
    const len = Math.hypot(w.dirX, w.dirZ) || 1
    const dx = w.dirX / len
    const dz = w.dirZ / len
    const q = w.steepness / (k * w.amplitude * spec.waves.length || 1)

    const phase = k * (dx * x + dz * z) - w.speed * k * t
    const c = Math.cos(phase)
    const s = Math.sin(phase)

    px += q * w.amplitude * dx * c
    pz += q * w.amplitude * dz * c
    py += w.amplitude * s

    const wa = k * w.amplitude
    dxdx -= q * wa * dx * dx * s
    dzdz -= q * wa * dz * dz * s
    dxdz -= q * wa * dx * dz * s
    dydx += wa * dx * c
    dydz += wa * dz * c
  }

  // Normal from the two tangents of the displaced surface.
  const nx = -dydx
  const nz = -dydz
  const ny = dxdx * dzdz - dxdz * dxdz
  const inv = 1 / (Math.hypot(nx, ny, nz) || 1)

  return { x: px, y: py, z: pz, nx: nx * inv, ny: ny * inv, nz: nz * inv }
}

/** Water height only — the common case for buoyancy checks. */
export function waterHeightAt(spec: WaveSpec, t: number, x: number, z: number): number {
  return surfaceAt(spec, t, x, z).y
}
