/**
 * A random display-name generator, hand-rolled instead of pulling in a library like
 * `unique-names-generator` — the word lists those ship with skew silly/tech
 * ("epic-panda-42"), and this app's whole framing is a quiet, cozy hangout, not that
 * tone. A ~50-word list is a few KB of source, not a dependency, and gets to pick
 * words that actually match ("Drowsy Otter" over "Turbo Ferret").
 */

const ADJECTIVES = [
  'Sleepy',
  'Cozy',
  'Drowsy',
  'Quiet',
  'Gentle',
  'Mellow',
  'Snug',
  'Calm',
  'Dreamy',
  'Misty',
  'Soft',
  'Warm',
  'Lazy',
  'Breezy',
  'Sunny',
  'Foggy',
  'Frosty',
  'Glowing',
  'Wandering',
  'Curious',
  'Humble',
  'Cheerful',
  'Serene',
  'Tranquil',
]

const CREATURES = [
  'Otter',
  'Fox',
  'Owl',
  'Rabbit',
  'Deer',
  'Hedgehog',
  'Panda',
  'Raccoon',
  'Sparrow',
  'Seal',
  'Badger',
  'Squirrel',
  'Koala',
  'Penguin',
  'Duckling',
  'Fawn',
  'Moth',
  'Firefly',
  'Turtle',
  'Lynx',
  'Wren',
  'Heron',
  'Beaver',
  'Mole',
]

/** Not seeded/cryptographic — this only needs to feel varied enough to prefill a
 * name field, not to be collision-proof (two people at once both getting "Cozy Otter"
 * is a fine coincidence, not a bug). */
export function randomDisplayName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const creature = CREATURES[Math.floor(Math.random() * CREATURES.length)]
  return `${adjective} ${creature}`
}
