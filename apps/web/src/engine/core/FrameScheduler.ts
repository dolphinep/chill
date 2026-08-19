/**
 * Visibility- and focus-aware frame pacing.
 *
 * This is a **product feature, not an optimisation.** The app is meant to live on a
 * second monitor all day; one that costs 40% GPU gets closed by Thursday. So the three
 * states are treated as first-class:
 *
 *   focused          -> targetHz (default 60)
 *   visible, blurred -> 30 Hz  (the PRIMARY use case: it's on the other monitor)
 *   hidden           -> loop fully stopped. Audio keeps playing — that is the point.
 *
 * S1 measured that rAF is *already* suspended while hidden, so stopping explicitly
 * costs nothing and buys two things: no 1 Hz wakeups, and no multi-second `dt` spike on
 * return (the Clock resyncs instead).
 */

export type FrameState = 'focused' | 'blurred' | 'hidden'

export type FrameSchedulerOptions = {
  /** Called when a frame should be rendered. Receives the rAF timestamp. */
  onFrame: (now: number) => void
  /** Called when the visibility/focus state changes, e.g. to resync the clock. */
  onStateChange?: (state: FrameState, previous: FrameState) => void
  /** Called if `onFrame` throws — see `#loop`'s own comment on why this exists.
   * Purely a notification; the loop recovers and keeps scheduling regardless of
   * whether this is provided. */
  onFrameError?: (error: unknown) => void
  targetHz?: number
  blurredHz?: number
}

export class FrameScheduler {
  #onFrame: (now: number) => void
  #onStateChange?: (state: FrameState, previous: FrameState) => void
  #onFrameError?: (error: unknown) => void
  #raf = 0
  #running = false
  #state: FrameState = 'focused'
  #lastRenderAt = 0

  targetHz: number
  blurredHz: number

  constructor(opts: FrameSchedulerOptions) {
    this.#onFrame = opts.onFrame
    this.#onStateChange = opts.onStateChange
    this.#onFrameError = opts.onFrameError
    this.targetHz = opts.targetHz ?? 60
    this.blurredHz = opts.blurredHz ?? 30
  }

  get state(): FrameState {
    return this.#state
  }

  /** Effective cap for the current state. */
  get effectiveHz(): number {
    return this.#state === 'blurred' ? this.blurredHz : this.targetHz
  }

  start(): void {
    if (this.#running) return
    this.#running = true
    this.#evaluateState()
    document.addEventListener('visibilitychange', this.#onVisibility)
    window.addEventListener('focus', this.#onFocus)
    window.addEventListener('blur', this.#onFocus)
    this.#schedule()
  }

  stop(): void {
    this.#running = false
    if (this.#raf) cancelAnimationFrame(this.#raf)
    this.#raf = 0
    document.removeEventListener('visibilitychange', this.#onVisibility)
    window.removeEventListener('focus', this.#onFocus)
    window.removeEventListener('blur', this.#onFocus)
  }

  #onVisibility = () => this.#evaluateState()
  #onFocus = () => this.#evaluateState()

  #evaluateState(): void {
    const next: FrameState = document.hidden
      ? 'hidden'
      : document.hasFocus()
        ? 'focused'
        : 'blurred'
    if (next === this.#state) return

    const previous = this.#state
    this.#state = next
    this.#onStateChange?.(next, previous)

    if (next === 'hidden') {
      if (this.#raf) cancelAnimationFrame(this.#raf)
      this.#raf = 0
    } else if (this.#running && this.#raf === 0) {
      this.#lastRenderAt = 0 // render immediately on return
      this.#schedule()
    }
  }

  #schedule(): void {
    if (!this.#running || this.#state === 'hidden') return
    this.#raf = requestAnimationFrame(this.#loop)
  }

  #loop = (now: number) => {
    this.#raf = 0
    if (!this.#running) return

    // Frame *skipping*, not sleeping: rAF stays on the display's cadence and we simply
    // decline to render on frames we do not need. That keeps input latency at display
    // rate while cutting GPU work.
    const minInterval = 1000 / this.effectiveHz
    // 1ms slack, otherwise a 60Hz display targeting 60Hz drops every other frame.
    if (this.#lastRenderAt === 0 || now - this.#lastRenderAt >= minInterval - 1) {
      this.#lastRenderAt = now
      // An uncaught throw here (e.g. a GPU resource race after a peer disconnects)
      // used to be fatal to the whole app: `this.#schedule()` below would simply never
      // run, so `requestAnimationFrame` never got called again — one bad frame meant a
      // permanently frozen page for something meant to stay open all day (this file's
      // own doc comment). One skipped/garbled frame recovering on its own is a far
      // better failure mode than that, so `onFrame` failing is now just reported, not
      // fatal to the loop itself.
      try {
        this.#onFrame(now)
      } catch (error) {
        this.#onFrameError?.(error)
      }
    }

    this.#schedule()
  }
}
