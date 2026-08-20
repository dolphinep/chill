export type AvatarModelType =
  | 'chibi-classic'
  | 'padoru'
  | 'vrm-avatar'
  | 'chibi-girl'
  | 'chibi-chick'
  | 'chibi-student'
  | 'chibi-princess'

export type HairStyle =
  | 'twin-tails'
  | 'hime-cut'
  | 'double-buns'
  | 'ponytail'
  | 'bob'
  | 'floppy'
  | 'curly'
  | 'spiky'
  | 'bun'
  | 'bald'

export type EyeStyle = 'anime' | 'happy' | 'wink' | 'dot'

export type OutfitStyle =
  | 'fairy-dress'
  | 'miko-shrine'
  | 'cozy-hoodie'
  | 'sailor-tee'
  | 'winter-coat'
  | 'beach-robe'
  | 'monk-robe'

export type AccessoryStyle =
  | 'none'
  | 'ribbon-bow'
  | 'fox-ears'
  | 'cat-ears'
  | 'bunny-ears'
  | 'halo'
  | 'angel-wings'
  | 'glasses'
  | 'straw-hat'
  | 'scarf'
  | 'backpack'
  | 'headphones'
  | 'beret'

export interface ChibiAvatarConfig {
  modelType?: AvatarModelType
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
  modelType: 'chibi-classic',
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

export const AVATAR_PRESETS: Record<
  string,
  { name: string; icon: string; config: ChibiAvatarConfig }
> = {
  'chibi-girl': {
    name: 'Chibi Girl',
    icon: '🎀',
    config: {
      modelType: 'chibi-girl',
      hairStyle: 'twin-tails',
      hairColor: '#f472b6',
      skinTone: '#fff1ee',
      eyeStyle: 'anime',
      eyeColor: '#ec4899',
      outfitStyle: 'fairy-dress',
      outfitColor: '#fce7f3',
      pantsColor: '#f472b6',
      shoesColor: '#db2777',
      accessory: 'none',
      accessoryColor: '#f43f5e',
    },
  },
  'chibi-student': {
    name: 'Chibi Student',
    icon: '🎒',
    config: {
      modelType: 'chibi-student',
      hairStyle: 'bob',
      hairColor: '#3b82f6',
      skinTone: '#fff1ee',
      eyeStyle: 'anime',
      eyeColor: '#2563eb',
      outfitStyle: 'sailor-tee',
      outfitColor: '#1e3a8a',
      pantsColor: '#1e293b',
      shoesColor: '#0f172a',
      accessory: 'none',
      accessoryColor: '#ef4444',
    },
  },
  'chibi-princess': {
    name: 'Chibi Princess',
    icon: '👑',
    config: {
      modelType: 'chibi-princess',
      hairStyle: 'twin-tails',
      hairColor: '#a855f7',
      skinTone: '#fff1ee',
      eyeStyle: 'anime',
      eyeColor: '#9333ea',
      outfitStyle: 'fairy-dress',
      outfitColor: '#f3e8ff',
      pantsColor: '#d8b4fe',
      shoesColor: '#7e22ce',
      accessory: 'none',
      accessoryColor: '#f43f5e',
    },
  },
  'chibi-chick': {
    name: 'Chibi Chick',
    icon: '🐤',
    config: {
      modelType: 'chibi-chick',
      hairStyle: 'spiky',
      hairColor: '#facc15',
      skinTone: '#fef08a',
      eyeStyle: 'anime',
      eyeColor: '#0284c7',
      outfitStyle: 'cozy-hoodie',
      outfitColor: '#facc15',
      pantsColor: '#f97316',
      shoesColor: '#ea580c',
      accessory: 'none',
      accessoryColor: '#f43f5e',
    },
  },
  'padoru-chibi': {
    name: 'Padoru Nero',
    icon: '🎁',
    config: {
      modelType: 'padoru',
      hairStyle: 'bun',
      hairColor: '#facc15',
      skinTone: '#ffdfc4',
      eyeStyle: 'anime',
      eyeColor: '#10b981',
      outfitStyle: 'winter-coat',
      outfitColor: '#dc2626',
      pantsColor: '#ffffff',
      shoesColor: '#991b1b',
      accessory: 'none',
      accessoryColor: '#dc2626',
    },
  },
  'winter-chibi': {
    name: 'Winter Cozy',
    icon: '❄️',
    config: {
      modelType: 'chibi-classic',
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
      modelType: 'chibi-classic',
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
      modelType: 'chibi-classic',
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
      modelType: 'chibi-classic',
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
      modelType: 'chibi-classic',
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
      modelType: 'chibi-classic',
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
