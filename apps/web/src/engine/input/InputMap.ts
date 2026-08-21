/**
 * Keyboard/mouse state, sampled once per fixed step.
 *
 * Two decisions that matter beyond §1:
 *
 * 1. **Keyed on `event.code`, not `event.key`.** `code` is physical position, so WASD
 *    works on AZERTY and Dvorak. Using `key` would silently break for non-QWERTY users.
 * 2. **All input zeroes on blur or hide.** Otherwise a keydown that never gets its
 *    keyup — because the user alt-tabbed mid-stride — leaves the avatar walking into
 *    the sea during their meeting. For an app that lives in a background window this is
 *    a certainty, not an edge case.
 *
 * Pointer lock is deliberately NOT requested here. For a second-monitor app, stealing
 * the cursor is hostile — the user is trying to click their IDE. Look is right-drag.
 */

export type InputFrame = {
  moveX: number
  moveZ: number
  moveY: number
  lookDX: number
  lookDY: number
  run: boolean
  jump: boolean
}

export class InputMap {
  #keys = new Set<string>()
  #justPressed = new Set<string>()
  #virtualMoveX = 0
  #virtualMoveZ = 0
  #virtualRun = false
  #lookDX = 0
  #lookDY = 0
  #dragging = false
  #target: HTMLElement

  constructor(target: HTMLElement) {
    this.#target = target
  }

  /** Update virtual mobile / tablet touch joystick input */
  setVirtualMovement(moveX: number, moveZ: number, run = false): void {
    this.#virtualMoveX = Math.max(-1, Math.min(1, moveX))
    this.#virtualMoveZ = Math.max(-1, Math.min(1, moveZ))
    this.#virtualRun = run
  }

  /** Trigger one-shot jump from mobile UI button */
  triggerVirtualJump(): void {
    this.#justPressed.add('Space')
  }

  attach(): void {
    window.addEventListener('keydown', this.#onKeyDown)
    window.addEventListener('keyup', this.#onKeyUp)
    window.addEventListener('blur', this.#reset)
    document.addEventListener('visibilitychange', this.#onVisibility)
    this.#target.addEventListener('pointerdown', this.#onPointerDown)
    window.addEventListener('pointerup', this.#onPointerUp)
    window.addEventListener('pointermove', this.#onPointerMove)
    this.#target.addEventListener('contextmenu', this.#onContextMenu)
  }

  detach(): void {
    window.removeEventListener('keydown', this.#onKeyDown)
    window.removeEventListener('keyup', this.#onKeyUp)
    window.removeEventListener('blur', this.#reset)
    document.removeEventListener('visibilitychange', this.#onVisibility)
    this.#target.removeEventListener('pointerdown', this.#onPointerDown)
    window.removeEventListener('pointerup', this.#onPointerUp)
    window.removeEventListener('pointermove', this.#onPointerMove)
    this.#target.removeEventListener('contextmenu', this.#onContextMenu)
    this.#reset()
  }

  /** Consume the frame's input. Look deltas are cleared on read. */
  sample(): InputFrame {
    const k = this.#keys
    const keyMoveX = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0)
    const keyMoveZ = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0)

    const rawMoveX = keyMoveX + this.#virtualMoveX
    const rawMoveZ = keyMoveZ + this.#virtualMoveZ

    const frame: InputFrame = {
      moveX: Math.max(-1, Math.min(1, rawMoveX)),
      moveZ: Math.max(-1, Math.min(1, rawMoveZ)),
      moveY: (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0),
      lookDX: this.#lookDX,
      lookDY: this.#lookDY,
      run: k.has('ShiftLeft') || k.has('ShiftRight') || this.#virtualRun,
      jump: this.consumeJustPressed('Space'),
    }
    this.#lookDX = 0
    this.#lookDY = 0
    return frame
  }

  /**
   * One-shot edge trigger for a key — true at most once per physical press, regardless
   * of how many fixed steps run before the next poll. State transitions (stand up, 1P/3P
   * toggle) need this; `sample()`'s continuous state would fire every step the key is
   * held, retriggering the transition dozens of times.
   */
  consumeJustPressed(code: string): boolean {
    if (!this.#justPressed.has(code)) return false
    this.#justPressed.delete(code)
    return true
  }

  #onKeyDown = (e: KeyboardEvent) => {
    // Never swallow browser/OS shortcuts.
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target as HTMLElement | null
    const active =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
    if (
      (target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)) ||
      (active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable))
    ) {
      this.#keys.clear()
      this.#justPressed.clear()
      return
    }
    if (!e.repeat) this.#justPressed.add(e.code)
    this.#keys.add(e.code)
    if (e.code === 'Space') e.preventDefault() // stop page scroll
  }

  #onKeyUp = (e: KeyboardEvent) => {
    this.#keys.delete(e.code)
  }

  #onVisibility = () => {
    if (document.hidden) this.#reset()
  }

  #reset = () => {
    this.#keys.clear()
    this.#justPressed.clear()
    this.#virtualMoveX = 0
    this.#virtualMoveZ = 0
    this.#virtualRun = false
    this.#lookDX = 0
    this.#lookDY = 0
    this.#dragging = false
  }

  #onPointerDown = (e: PointerEvent) => {
    // Left OR right drag to look — no pointer lock.
    if (e.button === 0 || e.button === 2) this.#dragging = true
  }

  #onPointerUp = () => {
    this.#dragging = false
  }

  #onPointerMove = (e: PointerEvent) => {
    if (!this.#dragging) return
    this.#lookDX += e.movementX
    this.#lookDY += e.movementY
  }

  #onContextMenu = (e: Event) => e.preventDefault()
}
