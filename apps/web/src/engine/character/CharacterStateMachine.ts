export type CharacterState = 'sit' | 'stand'

export class CharacterStateMachine {
  #state: CharacterState = 'sit'

  get state(): CharacterState {
    return this.#state
  }

  standUp(): boolean {
    if (this.#state === 'stand') return false
    this.#state = 'stand'
    return true
  }

  sitDown(): boolean {
    if (this.#state === 'sit') return false
    this.#state = 'sit'
    return true
  }

  toggle(): CharacterState {
    this.#state = this.#state === 'sit' ? 'stand' : 'sit'
    return this.#state
  }
}
