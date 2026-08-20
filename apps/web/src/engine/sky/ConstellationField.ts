import * as THREE from 'three/webgpu'
import * as Astronomy from 'astronomy-engine'
import starsData from './data/stars.json'
import constellationLineData from './data/constellations.json'
import constellationImageData from './data/constellationImages.json'

/**
 * Real, astronomically-positioned stars and constellations — a separate, additive
 * layer on top of the existing procedural noise starfield in `atmosphere.ts` (which
 * stays untouched; it's cheap background texture, not something these real stars
 * need to replace). Vendored data: `stars.json`/`constellations.json` are a filtered,
 * unit-converted subset of the `d3-celestial` project (ofrohn/d3-celestial,
 * BSD-licensed, star positions derived from the Hipparcos catalog) — RA converted
 * back from d3-celestial's GeoJSON longitude convention to hours, magnitude kept
 * as-is, constellation lines kept as literal RA/Dec segment endpoints (no star-ID
 * join needed, since d3-celestial's line file already embeds coordinates directly).
 *
 * Positions are computed via real equatorial->horizontal (alt/az) coordinate
 * transforms (`astronomy-engine`, MIT, zero dependencies) for a fixed reference
 * location — Bangkok — and a caller-supplied date, so the visible sky genuinely
 * changes with the chosen date rather than being a cosmetic rotation. `Engine.ts`
 * recenters `group.position` on the camera every frame, exactly like the existing
 * sky dome/moon, so this reads as "infinitely far away" regardless of player
 * movement (see that file's own `this.#skyDome.position.copy(p)` line).
 *
 * Every constellation's stick figure is drawn dimly at all times (one merged
 * `THREE.LineSegments` — real 3D geometry, not a search-gated overlay), so simply
 * turning to face a part of the sky reveals its shape. Searching a name just makes
 * that one constellation bright + labeled while it stays in view; it was never the
 * *only* way to see a shape, which is what made an off-screen or below-horizon pick
 * read as "nothing happened."
 *
 * The faint mythological figures behind the lines are the actual illustrations
 * Johan Meuris drew for the Stellarium planetarium project (Free Art License,
 * vendored under `public/constellations/`, credited in `ConstellationModal.tsx`),
 * not a generated placeholder — each one ships with 3 calibration points ("this
 * pixel is this real star"), which is exactly enough to warp the flat image onto
 * its real stars: 3 point-correspondences uniquely determine an affine map from
 * pixel space to the plane through those 3 stars (`#recomputeArt`'s own comment
 * has the derivation). A subdivided grid, not a single quad, so each vertex can
 * then be re-projected onto the actual celestial sphere rather than leaving large
 * constellations looking like a flat sticker glued on at a slight angle.
 */

const REFERENCE_LATITUDE = 13.75 // Bangkok
const REFERENCE_LONGITUDE = 100.5

/** A stable "evening stargazing" default rather than whatever the literal current
 * instant happens to be — today's date (in Bangkok's own calendar day, not UTC's,
 * so this doesn't flip a few hours early/late near midnight) at a fixed 20:00 local
 * time. The date picker overrides this; this is only ever the first-load default. */
export function defaultObservatoryDate(): Date {
  const bangkokYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return new Date(`${bangkokYmd}T20:00:00+07:00`)
}

/** Same fixed-20:00-local convention as `defaultObservatoryDate` — the date picker
 * only lets you choose a calendar day, not a time of night, so every date it
 * produces is evaluated at the same reference hour for a consistent "what would
 * tonight's sky look like" framing. `dateString` is a plain `YYYY-MM-DD` (an
 * `<input type="date">`'s own value format). */
export function observatoryDateFromInput(dateString: string): Date {
  return new Date(`${dateString}T20:00:00+07:00`)
}

/** Stars/line endpoints below the local horizon on the current date are parked here
 * instead of being drawn at their real (below-ground) direction — a single shared
 * degenerate position is simpler than a per-vertex visibility flag (`THREE.Points`/
 * `LineSegments` have no native per-vertex "hidden" attribute) and costs nothing
 * extra to render. */
const PARK_POSITION: [number, number, number] = [0, -1e6, 0]

type StarTuple = [raHours: number, decDeg: number, mag: number]
type ConstellationLineData = {
  id: string
  name: string
  segments: [number, number, number, number][]
}
type ImageAnchor = { px: number; py: number; ra: number; dec: number }
type ConstellationImageData = {
  id: string
  file: string
  size: [number, number]
  anchors: ImageAnchor[]
}

const STARS = starsData as StarTuple[]
const CONSTELLATIONS = constellationLineData as ConstellationLineData[]
const TOTAL_SEGMENTS = CONSTELLATIONS.reduce((n, c) => n + c.segments.length, 0)
/** Only 85 of the 88 have illustrations at all (a few constellations in the source
 * sky-culture never got artwork) — those simply never get a mesh, same "not every
 * constellation has everything" reasoning as `stars.json` not covering every star. */
const IMAGES = constellationImageData as ConstellationImageData[]
/** Grid subdivisions per illustration, not a single flat quad — see this file's own
 * top-level doc comment on why: it lets each interior vertex be re-projected onto
 * the actual celestial sphere instead of leaving a large constellation's image
 * looking like a flat sticker at a visible angle to the dome around it. */
const IMAGE_GRID = 6
const IMAGE_AMBIENT_OPACITY = 0.1
const IMAGE_ACTIVE_OPACITY = 0.6
const LINE_AMBIENT_OPACITY = 0.22
const LINE_ACTIVE_OPACITY = 0.95

/** Real magnitude is logarithmic and inverted (lower = brighter; Sirius is -1.44,
 * naked-eye limit is ~6) — a straight linear remap onto [MIN_BRIGHTNESS, 1] is not
 * photometrically exact but is the right amount of precision for a stylized point
 * cloud: brightest stars read clearly brighter than the faint background, and
 * nothing is fully invisible. */
const MIN_BRIGHTNESS = 0.18
const MAG_RANGE: [number, number] = STARS.reduce(
  (acc, [, , mag]) => [Math.min(acc[0], mag), Math.max(acc[1], mag)],
  [Infinity, -Infinity] as [number, number],
)

function magnitudeToBrightness(mag: number): number {
  const [minMag, maxMag] = MAG_RANGE
  const t = (mag - minMag) / (maxMag - minMag)
  return 1 - t * (1 - MIN_BRIGHTNESS)
}

/** Equatorial (RA hours, Dec degrees) -> a 3D unit direction, given already-computed
 * altitude/azimuth. Scene convention (arbitrary, since this terrain has no real-world
 * geographic alignment): -Z is north, +X is east, +Y is up — azimuth is measured
 * clockwise from north per `astronomy-engine`'s own convention, matching this. */
function altAzToDirection(
  altitudeDeg: number,
  azimuthDeg: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const alt = THREE.MathUtils.degToRad(altitudeDeg)
  const az = THREE.MathUtils.degToRad(azimuthDeg)
  const horizontal = Math.cos(alt)
  out.set(horizontal * Math.sin(az), Math.sin(alt), -horizontal * Math.cos(az))
  return out
}

/** The static half (UVs + triangle indices never change) of an illustration's grid
 * mesh — `#recomputeArt` fills in `position` per-date. A flat `(IMAGE_GRID+1)^2`
 * grid of quads, each split into 2 triangles. */
function buildArtGridGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const vertsPerRow = IMAGE_GRID + 1
  const vertCount = vertsPerRow * vertsPerRow

  const uvs = new Float32Array(vertCount * 2)
  let vi = 0
  for (let gy = 0; gy <= IMAGE_GRID; gy++) {
    for (let gx = 0; gx <= IMAGE_GRID; gx++) {
      uvs[vi * 2] = gx / IMAGE_GRID
      uvs[vi * 2 + 1] = gy / IMAGE_GRID
      vi++
    }
  }

  const indices: number[] = []
  for (let gy = 0; gy < IMAGE_GRID; gy++) {
    for (let gx = 0; gx < IMAGE_GRID; gx++) {
      const i0 = gy * vertsPerRow + gx
      const i1 = i0 + 1
      const i2 = i0 + vertsPerRow
      const i3 = i2 + 1
      indices.push(i0, i2, i1, i1, i2, i3)
    }
  }

  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return geo
}

export type ConstellationSummary = { id: string; name: string }

/** Screen-space result of the active constellation's label position — the lines
 * themselves are real 3D geometry (`#activeLineMesh`) drawn straight into the scene,
 * not projected/redrawn as an HTML overlay; only name labels need one, since a
 * legible floating 3D text label is a much bigger lift than an HTML `<div>`. One of
 * these per currently-visible-and-on-screen constellation, not just the searched
 * one — matching the always-dim-lines design, a name should be readable for
 * whatever you're actually looking at, not only after searching for it. */
export type ConstellationLabelProjection = {
  id: string
  name: string
  x: number
  y: number
  /** Whether this is the searched constellation — `ConstellationHighlightLayer.tsx`
   * renders it larger/brighter than the ambient labels around it. */
  active: boolean
}

export class ConstellationField {
  readonly group = new THREE.Group()

  #radius: number
  #observer: Astronomy.Observer
  #date: Date

  #starPositions: Float32Array
  #starColors: Float32Array
  #starPoints: THREE.Points

  /** One merged mesh for every constellation's stick figure, dim, always visible
   * (below-horizon segments individually parked) — see this file's own doc comment
   * on why this replaced one-mesh-per-constellation. */
  #allLinesMesh: THREE.LineSegments
  /** Just the searched constellation's segments, rebuilt (not just toggled) on
   * `setActive`/`setDate` — bright, and the only one that ever needs a label. */
  #activeLineMesh: THREE.LineSegments

  /** Cached per-constellation world-space segment endpoints from the last
   * `#recompute()` — read by `isVisible()`/`projectLabels()` without redoing any
   * astronomy math. */
  #cachedSegments = new Map<string, { a: THREE.Vector3; b: THREE.Vector3 }[]>()
  #activeId: string | null = null
  /** User-adjustable overall intensity, 0-1 — multiplies every opacity constant
   * (`LINE_AMBIENT_OPACITY`/`LINE_ACTIVE_OPACITY`/`IMAGE_AMBIENT_OPACITY`/
   * `IMAGE_ACTIVE_OPACITY`) rather than replacing them, so the *relative* balance
   * between dim/bright and lines/art stays the same at any setting — see
   * `setOpacity`'s own comment. */
  #opacityScale = 1

  /** One small textured mesh per illustrated constellation (85 of 88 have art) —
   * unlike the lines, these are NOT merged into one draw call: each covers only its
   * own small patch of sky, so leaving `frustumCulled` at its default `true` (rather
   * than the `false` the whole-sky star/line meshes need) means THREE only actually
   * draws the handful currently in view, which is what keeps 85 separate meshes
   * cheap in practice. */
  #artMeshes = new Map<string, THREE.Mesh>()

  constructor(radius: number, initialDate: Date) {
    this.#radius = radius
    this.#observer = new Astronomy.Observer(REFERENCE_LATITUDE, REFERENCE_LONGITUDE, 0)
    this.#date = initialDate

    this.#starPositions = new Float32Array(STARS.length * 3)
    this.#starColors = new Float32Array(STARS.length * 3)
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(this.#starPositions, 3))
    starGeo.setAttribute('color', new THREE.BufferAttribute(this.#starColors, 3))
    const starMat = new THREE.PointsMaterial({
      size: 2.5,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.#starPoints = new THREE.Points(starGeo, starMat)
    this.#starPoints.frustumCulled = false
    this.#starPoints.renderOrder = -90
    this.group.add(this.#starPoints)

    const allGeo = new THREE.BufferGeometry()
    allGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(TOTAL_SEGMENTS * 6), 3),
    )
    const allMat = new THREE.LineBasicMaterial({
      color: 0x5580c0,
      transparent: true,
      opacity: LINE_AMBIENT_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.#allLinesMesh = new THREE.LineSegments(allGeo, allMat)
    this.#allLinesMesh.frustumCulled = false
    this.#allLinesMesh.renderOrder = -86
    this.group.add(this.#allLinesMesh)

    const activeGeo = new THREE.BufferGeometry()
    const activeMat = new THREE.LineBasicMaterial({
      color: 0x9fc6ff,
      transparent: true,
      opacity: LINE_ACTIVE_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.#activeLineMesh = new THREE.LineSegments(activeGeo, activeMat)
    this.#activeLineMesh.frustumCulled = false
    this.#activeLineMesh.renderOrder = -84
    this.#activeLineMesh.visible = false
    this.group.add(this.#activeLineMesh)

    const textureLoader = new THREE.TextureLoader()
    for (const entry of IMAGES) {
      const geometry = buildArtGridGeometry()
      const texture = textureLoader.load(`/constellations/${entry.file}`)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.flipY = false // grid UVs already assume image-space (py=0 at top) directly
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: IMAGE_AMBIENT_OPACITY,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.renderOrder = -89
      mesh.visible = false // #recompute() below turns it on once real positions exist
      this.group.add(mesh)
      this.#artMeshes.set(entry.id, mesh)
    }

    this.#recompute()
    this.group.visible = false
  }

  /** For the search list — every real IAU constellation this field knows about. */
  get names(): ConstellationSummary[] {
    return CONSTELLATIONS.map((c) => ({ id: c.id, name: c.name }))
  }

  get date(): Date {
    return this.#date
  }

  /** Recomputes every star's and every constellation line's real position for a new
   * date — a discrete, user-triggered action (the date picker), not a per-frame
   * cost: several thousand `Astronomy.Horizon` calls is fine as a one-off, not fine
   * 60 times a second. */
  setDate(date: Date): void {
    this.#date = date
    this.#recompute()
  }

  setActive(id: string | null): void {
    const previousId = this.#activeId
    this.#activeId = id
    this.#rebuildActiveMesh()
    // Brighten just the searched constellation's illustration (if it has one — see
    // `IMAGES`'s own doc comment on the 3 that don't) and dim whatever was
    // previously active; separate materials per mesh means this never touches any
    // other constellation's opacity.
    if (previousId) this.#setArtOpacity(previousId, IMAGE_AMBIENT_OPACITY, -89)
    if (id) this.#setArtOpacity(id, IMAGE_ACTIVE_OPACITY, -83)
  }

  /** The user-facing "how visible is all this" control (`ConstellationModal.tsx`'s
   * slider) — a multiplier on every opacity constant rather than a replacement, so
   * dragging it to zero fades everything out smoothly instead of the active
   * highlight suddenly looking identical to the ambient ones just before it
   * disappears. Takes effect immediately, independent of `setEnabled`: turning
   * intensity down to 0 and toggling the whole layer off read the same visually,
   * but a caller might still want `isVisible()`/`projectLabels()` to keep working
   * (e.g. leaving search live while faded out), which only `setEnabled(false)`
   * — a full `group.visible = false` — would actually skip. */
  setOpacity(scale: number): void {
    this.#opacityScale = THREE.MathUtils.clamp(scale, 0, 1)
    ;(this.#allLinesMesh.material as THREE.LineBasicMaterial).opacity =
      LINE_AMBIENT_OPACITY * this.#opacityScale
    ;(this.#activeLineMesh.material as THREE.LineBasicMaterial).opacity =
      LINE_ACTIVE_OPACITY * this.#opacityScale
    for (const [id, mesh] of this.#artMeshes) {
      const base = id === this.#activeId ? IMAGE_ACTIVE_OPACITY : IMAGE_AMBIENT_OPACITY
      ;(mesh.material as THREE.MeshBasicMaterial).opacity = base * this.#opacityScale
    }
  }

  /** Hides the whole layer (stars, lines, art) at once — distinct from
   * `setOpacity(0)`, see that method's own comment on why both exist. */
  setEnabled(enabled: boolean): void {
    this.group.visible = enabled
  }

  #setArtOpacity(id: string, opacity: number, renderOrder: number): void {
    const mesh = this.#artMeshes.get(id)
    if (!mesh) return
    ;(mesh.material as THREE.MeshBasicMaterial).opacity = opacity * this.#opacityScale
    mesh.renderOrder = renderOrder
  }

  /** Whether the given constellation actually has anything above the horizon right
   * now — lets the search UI tell the difference between "you picked one that's
   * below the horizon tonight" and an actual bug, instead of both looking like
   * silent nothing. */
  isVisible(id: string): boolean {
    const segments = this.#cachedSegments.get(id)
    if (!segments) return false
    return segments.some((s) => s.a.y > -1e5 && s.b.y > -1e5)
  }

  /** One label per constellation that's both currently above the horizon AND
   * on-screen right now — not just the searched one, matching the always-dim-lines
   * design (see `ConstellationLabelProjection`'s own doc comment). Centroid-of-
   * visible-stars anchor + the same `Vector3.project(camera)` -> NDC -> pixel-space
   * idiom `ThoughtField.project()` already uses for lanterns, including its
   * off-screen-margin culling — with potentially dozens of these computed every
   * frame, that culling is what keeps this cheap (it's all just vector math against
   * already-cached positions, no astronomy recompute). */
  projectLabels(
    camera: THREE.Camera,
    viewportWidth: number,
    viewportHeight: number,
  ): ConstellationLabelProjection[] {
    if (!this.group.visible || this.#opacityScale <= 0.001) return []

    const out: ConstellationLabelProjection[] = []
    const anchor = new THREE.Vector3()

    for (const c of CONSTELLATIONS) {
      const segments = this.#cachedSegments.get(c.id)
      if (!segments) continue
      const visible = segments.filter((s) => s.a.y > -1e5 && s.b.y > -1e5)
      if (visible.length === 0) continue

      anchor.set(0, 0, 0)
      for (const s of visible) anchor.add(s.a).add(s.b)
      anchor.divideScalar(visible.length * 2)

      const p = anchor.project(camera)
      if (p.z > 1 || p.z < -1) continue // behind the camera or beyond the far plane

      const x = ((p.x + 1) / 2) * viewportWidth
      const y = ((1 - p.y) / 2) * viewportHeight
      if (x < -100 || x > viewportWidth + 100 || y < -100 || y > viewportHeight + 100) continue

      out.push({ id: c.id, name: c.name, x, y, active: c.id === this.#activeId })
    }

    return out
  }

  getCentroid(id: string): THREE.Vector3 | null {
    const segments = this.#cachedSegments.get(id)
    if (!segments) return null
    const visible = segments.filter((s) => s.a.y > -1e5 && s.b.y > -1e5)
    if (visible.length === 0) return null
    const anchor = new THREE.Vector3()
    for (const s of visible) anchor.add(s.a).add(s.b)
    anchor.divideScalar(visible.length * 2)
    return anchor
  }

  #rebuildActiveMesh(): void {
    const segments = this.#activeId ? this.#cachedSegments.get(this.#activeId) : undefined
    const visible = segments?.filter((s) => s.a.y > -1e5 && s.b.y > -1e5) ?? []

    if (visible.length === 0) {
      this.#activeLineMesh.visible = false
      return
    }

    const positions = new Float32Array(visible.length * 6)
    for (let i = 0; i < visible.length; i++) {
      const { a, b } = visible[i]!
      const i6 = i * 6
      positions[i6] = a.x
      positions[i6 + 1] = a.y
      positions[i6 + 2] = a.z
      positions[i6 + 3] = b.x
      positions[i6 + 4] = b.y
      positions[i6 + 5] = b.z
    }
    this.#activeLineMesh.geometry.dispose()
    this.#activeLineMesh.geometry = new THREE.BufferGeometry()
    this.#activeLineMesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.#activeLineMesh.geometry.computeBoundingSphere()
    this.#activeLineMesh.visible = true
  }

  #recompute(): void {
    const dir = new THREE.Vector3()

    for (let i = 0; i < STARS.length; i++) {
      const [ra, dec, mag] = STARS[i]!
      const hor = Astronomy.Horizon(this.#date, this.#observer, ra, dec, 'normal')
      const i3 = i * 3
      if (hor.altitude < 0) {
        this.#starPositions[i3] = PARK_POSITION[0]
        this.#starPositions[i3 + 1] = PARK_POSITION[1]
        this.#starPositions[i3 + 2] = PARK_POSITION[2]
      } else {
        altAzToDirection(hor.altitude, hor.azimuth, dir).multiplyScalar(this.#radius)
        this.#starPositions[i3] = dir.x
        this.#starPositions[i3 + 1] = dir.y
        this.#starPositions[i3 + 2] = dir.z
      }
      const brightness = magnitudeToBrightness(mag)
      this.#starColors[i3] = brightness
      this.#starColors[i3 + 1] = brightness
      this.#starColors[i3 + 2] = brightness
    }
    this.#starPoints.geometry.attributes.position!.needsUpdate = true
    this.#starPoints.geometry.attributes.color!.needsUpdate = true
    this.#starPoints.geometry.computeBoundingSphere()

    const allPositions = this.#allLinesMesh.geometry.attributes.position!.array as Float32Array
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    let segmentOffset = 0

    for (const c of CONSTELLATIONS) {
      const cached: { a: THREE.Vector3; b: THREE.Vector3 }[] = []

      for (let i = 0; i < c.segments.length; i++) {
        const [ra1, dec1, ra2, dec2] = c.segments[i]!
        const hor1 = Astronomy.Horizon(this.#date, this.#observer, ra1, dec1, 'normal')
        const hor2 = Astronomy.Horizon(this.#date, this.#observer, ra2, dec2, 'normal')
        const belowHorizon = hor1.altitude < 0 || hor2.altitude < 0

        if (belowHorizon) {
          a.set(...PARK_POSITION)
          b.set(...PARK_POSITION)
        } else {
          altAzToDirection(hor1.altitude, hor1.azimuth, a).multiplyScalar(this.#radius)
          altAzToDirection(hor2.altitude, hor2.azimuth, b).multiplyScalar(this.#radius)
        }

        const i6 = (segmentOffset + i) * 6
        allPositions[i6] = a.x
        allPositions[i6 + 1] = a.y
        allPositions[i6 + 2] = a.z
        allPositions[i6 + 3] = b.x
        allPositions[i6 + 4] = b.y
        allPositions[i6 + 5] = b.z
        cached.push({ a: a.clone(), b: b.clone() })
      }

      segmentOffset += c.segments.length
      this.#cachedSegments.set(c.id, cached)
    }

    this.#allLinesMesh.geometry.attributes.position!.needsUpdate = true
    this.#allLinesMesh.geometry.computeBoundingSphere()

    // The active constellation's own real position may have moved (or gone below
    // the horizon) on a date change too — refresh it from the same fresh cache
    // rather than leaving it showing a stale shape/visibility.
    this.#rebuildActiveMesh()
    this.#recomputeArt()
  }

  /** Warps each illustration onto its 3 real anchor stars for the current date —
   * see this file's top-level doc comment for the affine-map derivation this is an
   * implementation of. Below-horizon anchors just hide the whole illustration
   * (rather than trying to draw a partially-degenerate quad): a mythological figure
   * half-below the ground doesn't mean anything, unlike an individual constellation
   * *line* segment which can sensibly still connect two otherwise-visible stars. */
  #recomputeArt(): void {
    const q0 = new THREE.Vector3()
    const q1 = new THREE.Vector3()
    const q2 = new THREE.Vector3()

    for (const entry of IMAGES) {
      const mesh = this.#artMeshes.get(entry.id)
      if (!mesh) continue

      const [a0, a1, a2] = entry.anchors as [ImageAnchor, ImageAnchor, ImageAnchor]
      const h0 = Astronomy.Horizon(this.#date, this.#observer, a0.ra, a0.dec, 'normal')
      const h1 = Astronomy.Horizon(this.#date, this.#observer, a1.ra, a1.dec, 'normal')
      const h2 = Astronomy.Horizon(this.#date, this.#observer, a2.ra, a2.dec, 'normal')
      if (h0.altitude < 0 || h1.altitude < 0 || h2.altitude < 0) {
        mesh.visible = false
        continue
      }
      altAzToDirection(h0.altitude, h0.azimuth, q0).multiplyScalar(this.#radius)
      altAzToDirection(h1.altitude, h1.azimuth, q1).multiplyScalar(this.#radius)
      altAzToDirection(h2.altitude, h2.azimuth, q2).multiplyScalar(this.#radius)

      // Solve pixel -> barycentric-ish (s,t) relative to anchor 0, in 2D pixel
      // space, once per date (not per vertex) — then every grid vertex reuses the
      // same (d1,d2,det) to map into the plane through q0/q1/q2.
      const d1x = a1.px - a0.px
      const d1y = a1.py - a0.py
      const d2x = a2.px - a0.px
      const d2y = a2.py - a0.py
      const det = d1x * d2y - d2x * d1y
      if (Math.abs(det) < 1e-6) {
        mesh.visible = false // 3 anchors happen to be collinear in pixel space — degenerate, skip
        continue
      }

      const [imgW, imgH] = entry.size
      const positions = mesh.geometry.attributes.position!.array as Float32Array
      let vi = 0
      for (let gy = 0; gy <= IMAGE_GRID; gy++) {
        for (let gx = 0; gx <= IMAGE_GRID; gx++) {
          const px = (gx / IMAGE_GRID) * imgW
          const py = (gy / IMAGE_GRID) * imgH
          const s = ((px - a0.px) * d2y - (py - a0.py) * d2x) / det
          const t = ((py - a0.py) * d1x - (px - a0.px) * d1y) / det

          const qx = q0.x + s * (q1.x - q0.x) + t * (q2.x - q0.x)
          const qy = q0.y + s * (q1.y - q0.y) + t * (q2.y - q0.y)
          const qz = q0.z + s * (q1.z - q0.z) + t * (q2.z - q0.z)
          // Re-project onto the actual celestial sphere — the affine map alone only
          // guarantees the 3 anchors land exactly right; everything else in the
          // image sits on the flat plane *through* those 3 points, which drifts
          // visibly off the dome for a constellation spanning a wide angle if left
          // uncorrected.
          const len = Math.hypot(qx, qy, qz) || 1
          const scale = this.#radius / len

          const i3 = vi * 3
          positions[i3] = qx * scale
          positions[i3 + 1] = qy * scale
          positions[i3 + 2] = qz * scale
          vi++
        }
      }

      mesh.geometry.attributes.position!.needsUpdate = true
      mesh.geometry.computeBoundingSphere()
      mesh.visible = true
    }
  }

  dispose(): void {
    this.#starPoints.geometry.dispose()
    ;(this.#starPoints.material as THREE.Material).dispose()
    this.#allLinesMesh.geometry.dispose()
    ;(this.#allLinesMesh.material as THREE.Material).dispose()
    this.#activeLineMesh.geometry.dispose()
    ;(this.#activeLineMesh.material as THREE.Material).dispose()
    for (const mesh of this.#artMeshes.values()) {
      mesh.geometry.dispose()
      const material = mesh.material as THREE.MeshBasicMaterial
      material.map?.dispose()
      material.dispose()
    }
  }
}
