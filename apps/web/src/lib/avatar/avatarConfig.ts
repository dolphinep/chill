export type HairStyle = 'bald' | 'bob' | 'spiky' | 'bun' | 'double-buns' | 'curly' | 'floppy' | 'ponytail'
export type EyeStyle = 'happy' | 'dot' | 'anime' | 'wink'
export type OutfitStyle = 'cozy-hoodie' | 'beach-robe' | 'sailor-tee' | 'winter-coat' | 'monk-robe'
export type AccessoryStyle = 'none' | 'cat-ears' | 'bunny-ears' | 'glasses' | 'straw-hat' | 'scarf' | 'angel-wings' | 'backpack' | 'headphones' | 'beret'

export interface ChibiAvatarConfig {
  hairStyle: HairStyle
  hairColor: string
  skinTone: string
  eyeStyle: EyeStyle
  eyeColor: string
  outfitStyle: OutfitStyle
  outfitColor: string
  pantsColor: string
  shoesColor: string
  accessory: AccessoryStyle
  accessoryColor: string
}

export const DEFAULT_AVATAR_CONFIG: ChibiAvatarConfig = {
  hairStyle: 'bun',
  hairColor: '#475569',
  skinTone: '#ffdfc4',
  eyeStyle: 'happy',
  eyeColor: '#1e293b',
  outfitStyle: 'winter-coat',
  outfitColor: '#0284c7',
  pantsColor: '#334155',
  shoesColor: '#1e293b',
  accessory: 'scarf',
  accessoryColor: '#ef4444',
}

export const AVATAR_PRESETS: Record<string, { name: string; icon: string; config: ChibiAvatarConfig }> = {
  'winter-chibi': {
    name: 'Winter Cozy',
    icon: '❄️',
    config: {
      hairStyle: 'bun',
      hairColor: '#475569',
      skinTone: '#ffdfc4',
      eyeStyle: 'happy',
      eyeColor: '#1e293b',
      outfitStyle: 'winter-coat',
      outfitColor: '#0284c7',
      pantsColor: '#334155',
      shoesColor: '#1e293b',
      accessory: 'scarf',
      accessoryColor: '#ef4444',
    },
  },
  'cozy-cat': {
    name: 'Cozy Cat',
    icon: '🐱',
    config: {
      hairStyle: 'bob',
      hairColor: '#ff7b9c',
      skinTone: '#ffdfc4',
      eyeStyle: 'happy',
      eyeColor: '#2b2d42',
      outfitStyle: 'cozy-hoodie',
      outfitColor: '#7209b7',
      pantsColor: '#4361ee',
      shoesColor: '#3f37c9',
      accessory: 'cat-ears',
      accessoryColor: '#f72585',
    },
  },
  'zen-monk': {
    name: 'Zen Wanderer',
    icon: '🧘',
    config: {
      hairStyle: 'bald',
      hairColor: '#000000',
      skinTone: '#f3c4a5',
      eyeStyle: 'happy',
      eyeColor: '#1e293b',
      outfitStyle: 'monk-robe',
      outfitColor: '#d97706',
      pantsColor: '#92400e',
      shoesColor: '#78350f',
      accessory: 'backpack',
      accessoryColor: '#78350f',
    },
  },
  'beach-wanderer': {
    name: 'Beach Wanderer',
    icon: '🏖️',
    config: {
      hairStyle: 'spiky',
      hairColor: '#eab308',
      skinTone: '#f3c4a5',
      eyeStyle: 'anime',
      eyeColor: '#0284c7',
      outfitStyle: 'beach-robe',
      outfitColor: '#38bdf8',
      pantsColor: '#0f766e',
      shoesColor: '#92400e',
      accessory: 'straw-hat',
      accessoryColor: '#d97706',
    },
  },
  'anime-pop': {
    name: 'Anime Pop',
    icon: '✨',
    config: {
      hairStyle: 'ponytail',
      hairColor: '#06b6d4',
      skinTone: '#ffdfc4',
      eyeStyle: 'wink',
      eyeColor: '#ec4899',
      outfitStyle: 'sailor-tee',
      outfitColor: '#f43f5e',
      pantsColor: '#1e293b',
      shoesColor: '#e11d48',
      accessory: 'headphones',
      accessoryColor: '#0f172a',
    },
  },
  'angel-dream': {
    name: 'Angel Dream',
    icon: '🪽',
    config: {
      hairStyle: 'ponytail',
      hairColor: '#e0e7ff',
      skinTone: '#ffdfc4',
      eyeStyle: 'anime',
      eyeColor: '#6366f1',
      outfitStyle: 'cozy-hoodie',
      outfitColor: '#ffffff',
      pantsColor: '#818cf8',
      shoesColor: '#ffffff',
      accessory: 'angel-wings',
      accessoryColor: '#ffffff',
    },
  },
}
