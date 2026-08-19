'use client'

import React, { useSyncExternalStore } from 'react'
import type { CompanionSpecies } from '@/engine/character/CompanionPet'

export interface ChatMessage {
  id: string
  sender: 'user' | 'pet'
  text: string
  timestamp: number
}

export interface CompanionSpeciesInfo {
  id: CompanionSpecies
  name: string
  title: string
  iconSrc: string
  avatarColor: string
  cardBg: string
  cardBorder: string
  accentColor: string
  description: string
  personality: string
  greeting: string
  quickPrompts: string[]
}

export function PawIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <circle cx="12" cy="14.5" r="3.5" fill="currentColor" fillOpacity={0.25} />
      <ellipse cx="7" cy="10" rx="1.8" ry="2.2" fill="currentColor" />
      <ellipse cx="17" cy="10" rx="1.8" ry="2.2" fill="currentColor" />
      <ellipse cx="10.2" cy="7.5" rx="1.6" ry="2" fill="currentColor" />
      <ellipse cx="13.8" cy="7.5" rx="1.6" ry="2" fill="currentColor" />
    </svg>
  )
}

export const DEFAULT_PET_NAMES: Record<CompanionSpecies, string> = {
  cat: 'Neko',
  shiba: 'Shiba',
  bunny: 'Marshmallow',
  penguin: 'Penpen',
  dragon: 'Ryuu',
  fox: 'Foxy',
  none: '',
}

export const COMPANION_SPECIES_LIST: CompanionSpeciesInfo[] = [
  {
    id: 'cat',
    name: 'Neko',
    title: 'Calico Cat',
    iconSrc: '/assests/cat-svgrepo-com.svg',
    avatarColor: 'from-sky-400/20 to-blue-500/20',
    cardBg: 'bg-sky-950/20',
    cardBorder: 'border-sky-400/30',
    accentColor: 'text-sky-300',
    description: 'Sweet and affectionate calico cat that loves afternoon sunbathing.',
    personality: 'Affectionate, relaxing, cuddly',
    greeting: '*Rubs cheek gently against your hand and purrs softly* Meow~ Let us relax together.',
    quickPrompts: [
      'มีขนมอร่อยๆ มาฝากนะ',
      'ไปนอนกลางวันกันไหม',
      'เกาพุงให้หน่อยสิ',
      'เกาคางสบายไหม',
    ],
  },
  {
    id: 'shiba',
    name: 'Shiba',
    title: 'Shiba Inu',
    iconSrc: '/assests/dog-breed-svgrepo-com.svg',
    avatarColor: 'from-amber-400/20 to-orange-500/20',
    cardBg: 'bg-amber-950/20',
    cardBorder: 'border-amber-400/30',
    accentColor: 'text-amber-300',
    description: 'Loyal and cheerful Shiba puppy radiating positive energy.',
    personality: 'Playful, loyal, energetic',
    greeting: '*Wags tail excitedly and rests chin on your knee* Woof! Shiba is always here for you!',
    quickPrompts: [
      'ไปวิ่งแข่งกันไหม!',
      'ใครเป็นเด็กดีของเจ้านายนะ',
      'เกาหลังหูให้หน่อย',
      'ไปคาบลูกบอลกัน!',
    ],
  },
  {
    id: 'bunny',
    name: 'Marshmallow',
    title: 'Snow Bunny',
    iconSrc: '/assests/rabbit-face-svgrepo-com.svg',
    avatarColor: 'from-pink-400/20 to-rose-500/20',
    cardBg: 'bg-pink-950/20',
    cardBorder: 'border-pink-400/30',
    accentColor: 'text-pink-300',
    description: 'Fluffy white bunny with gentle eyes and twitching ears.',
    personality: 'Gentle, soft, serene',
    greeting: '*Twitches nose softly and leans warm head into your palm* Snuggle...',
    quickPrompts: [
      'ขอกอดอุ่นๆ หน่อยได้ไหม',
      'กระโดดดุ๊กดิ๊กน่ารักจัง',
      'ลูบขนนุ่มๆ ให้หน่อยนะ',
      'กินแครอทสดๆ ไหมคะ',
    ],
  },
  {
    id: 'penguin',
    name: 'Penpen',
    title: 'Little Penguin',
    iconSrc: '/assests/penguin-svgrepo-com (1).svg',
    avatarColor: 'from-cyan-400/20 to-teal-500/20',
    cardBg: 'bg-cyan-950/20',
    cardBorder: 'border-cyan-400/30',
    accentColor: 'text-cyan-300',
    description: 'Chubby little penguin waddling happily by your side.',
    personality: 'Cheerful, curious, waddly',
    greeting: '*Flaps flippers with joy and waddles over to lean on your leg* Peep! Let us rest together!',
    quickPrompts: [
      'เดินเตาะแตะไปด้วยกันนะ',
      'หนาวไหมเปนเปน',
      'ขยับปีกดุ๊กดิ๊กหน่อย',
      'มานั่งพักผ่อนด้วยกันเถอะ',
    ],
  },
  {
    id: 'dragon',
    name: 'Ryuu',
    title: 'Pocket Dragon',
    iconSrc: '/assests/dragon-face-svgrepo-com.svg',
    avatarColor: 'from-emerald-400/20 to-teal-500/20',
    cardBg: 'bg-emerald-950/20',
    cardBorder: 'border-emerald-400/30',
    accentColor: 'text-emerald-300',
    description: 'Friendly miniature dragon breathing warm gentle puffs to protect you.',
    personality: 'Brave, warm, guardian',
    greeting: '*Flutters wings, lands on your shoulder, and breathes a tiny warm puff* Purr~ Ryuu will protect you!',
    quickPrompts: [
      'พ่นลูกไฟจิ๋วให้ดูหน่อย',
      'บินวนรอบๆ ให้ดูหน่อย',
      'ลูบเขามังกรเบาๆ',
      'ไปผจญภัยด้วยกันนะ',
    ],
  },
]

export function renderCompanionIcon(species: CompanionSpecies, className = 'h-6 w-6') {
  const info = COMPANION_SPECIES_LIST.find((s) => s.id === species) || COMPANION_SPECIES_LIST[0]!
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={info.iconSrc}
      alt={info.name}
      className={`select-none object-contain drop-shadow ${className}`}
      draggable={false}
    />
  )
}

const STORAGE_KEY = 'chill_companion_species'

function loadPersistedSpecies(): CompanionSpecies {
  if (typeof window === 'undefined') return 'cat'
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) as CompanionSpecies | null
    if (raw && ['fox', 'cat', 'shiba', 'bunny', 'penguin', 'dragon', 'none'].includes(raw)) {
      return raw
    }
  } catch {}
  return 'cat'
}

export function loadPersistedPetName(species: CompanionSpecies): string {
  if (typeof window === 'undefined') return DEFAULT_PET_NAMES[species] || ''
  try {
    const saved = window.localStorage.getItem(`chill_companion_name_${species}`)
    if (saved && saved.trim().length > 0) {
      return saved.trim()
    }
  } catch {}
  return DEFAULT_PET_NAMES[species] || ''
}

export interface CompanionStoreState {
  species: CompanionSpecies
  petName: string
  isOpen: boolean
  activeTab: 'chat' | 'select'
  messages: ChatMessage[]
  isThinking: boolean
}

export interface CompanionStoreActions {
  setSpecies: (species: CompanionSpecies) => void
  setPetName: (name: string) => void
  setIsOpen: (open: boolean) => void
  setActiveTab: (tab: 'chat' | 'select') => void
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  setIsThinking: (thinking: boolean) => void
  clearMessages: () => void
}

export type CompanionStore = CompanionStoreState & CompanionStoreActions

const initialSpecies = loadPersistedSpecies()
const initialName = loadPersistedPetName(initialSpecies)
const initialInfo = COMPANION_SPECIES_LIST.find((s) => s.id === initialSpecies) || COMPANION_SPECIES_LIST[0]!

let state: CompanionStoreState = {
  species: initialSpecies,
  petName: initialName,
  isOpen: false,
  activeTab: 'chat',
  messages: [
    {
      id: 'initial',
      sender: 'pet',
      text: initialInfo.greeting,
      timestamp: Date.now(),
    },
  ],
  isThinking: false,
}

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): CompanionStoreState {
  return state
}

export const companionActions: CompanionStoreActions = {
  setSpecies: (species: CompanionSpecies) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, species)
      }
    } catch {}
    const info = COMPANION_SPECIES_LIST.find((s) => s.id === species)
    const newName = loadPersistedPetName(species)
    state = {
      ...state,
      species,
      petName: newName,
      messages: [
        {
          id: `greet-${Date.now()}`,
          sender: 'pet',
          text: info?.greeting || '*Looks at you with affection and snuggles closer*',
          timestamp: Date.now(),
        },
      ],
    }
    notify()
  },
  setPetName: (name: string) => {
    const clean = name.trim() || DEFAULT_PET_NAMES[state.species] || ''
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`chill_companion_name_${state.species}`, clean)
      }
    } catch {}
    state = {
      ...state,
      petName: clean,
    }
    notify()
  },
  setIsOpen: (open: boolean) => {
    state = { ...state, isOpen: open }
    notify()
  },
  setActiveTab: (tab: 'chat' | 'select') => {
    state = { ...state, activeTab: tab }
    notify()
  },
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    state = {
      ...state,
      messages: [
        ...state.messages,
        {
          ...msg,
          id: `msg-${Date.now()}-${Math.random()}`,
          timestamp: Date.now(),
        },
      ],
    }
    notify()
  },
  setIsThinking: (thinking: boolean) => {
    state = { ...state, isThinking: thinking }
    notify()
  },
  clearMessages: () => {
    const info = COMPANION_SPECIES_LIST.find((s) => s.id === state.species)
    state = {
      ...state,
      messages: [
        {
          id: `greet-${Date.now()}`,
          sender: 'pet',
          text: info?.greeting || '*Looks at you with affection and snuggles closer*',
          timestamp: Date.now(),
        },
      ],
    }
    notify()
  },
}

export function useCompanionStore<T = CompanionStore>(
  selector?: (s: CompanionStore) => T,
): T {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => state)
  const fullStore: CompanionStore = {
    ...current,
    ...companionActions,
  }

  return selector ? selector(fullStore) : (fullStore as unknown as T)
}
