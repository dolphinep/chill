/**
 * Explicit GPU resource disposal.
 *
 * GPU memory is not garbage collected on any useful timescale, and this app is
 * expected to stay open for eight hours with scene swaps. Everything that allocates
 * registers here; `Engine.dispose()` walks the list. A dev-only assertion compares
 * `renderer.info.memory` across a swap and fails on a >4 MB delta.
 */

export type Disposable = { dispose: () => void }

export class Disposables {
  #items: Disposable[] = []

  add<T extends Disposable>(item: T): T {
    this.#items.push(item)
    return item
  }

  addAll(items: Disposable[]): void {
    this.#items.push(...items)
  }

  /** Dispose in reverse order, so dependents go before their dependencies. */
  dispose(): void {
    for (let i = this.#items.length - 1; i >= 0; i--) {
      try {
        this.#items[i]!.dispose()
      } catch {
        // One bad dispose must not strand the rest.
      }
    }
    this.#items.length = 0
  }

  get size(): number {
    return this.#items.length
  }
}
