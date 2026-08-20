'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Fredoka, DynaPuff, Sniglet } from 'next/font/google'
import { renderCompanionIcon } from '@/lib/companion/companionStore'
import type { CompanionSpecies } from '@/engine/character/CompanionPet'
import { AvatarStudioPanel, randomizeAvatarConfig } from '@/components/hud/ChibiCustomizerModal'
import { DEFAULT_AVATAR_CONFIG, type ChibiAvatarConfig } from '@/lib/avatar/avatarConfig'

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const dynaPuff = DynaPuff({
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
})

const sniglet = Sniglet({
  subsets: ['latin'],
  weight: ['800'],
  display: 'swap',
})

/**
 * Super Cozy & Friendly Bouncy Cartoon Chill Logo
 * Clean, soft marshmallow curves with warm cozy starlight tones.
 */
export function ChillLogo({
  size = 'hero',
  className = '',
}: {
  size?: 'hero' | 'nav' | 'badge'
  className?: string
}) {
  if (size === 'nav') {
    return (
      <div className={`flex items-center gap-1.5 select-none ${className}`}>
        <div className="flex items-center">
          <span
            className={`${dynaPuff.className} text-2xl font-bold tracking-normal text-[#fff9db] drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]`}
          >
            <span className="inline-block -rotate-3 text-[#fef08a]">c</span>
            <span className="inline-block rotate-2 text-[#fde047]">h</span>
            <span className="relative inline-block -rotate-1 text-[#fef9c3]">
              i
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] text-[#f59e0b]">
                ★
              </span>
            </span>
            <span className="inline-block rotate-3 text-[#fde047]">l</span>
            <span className="inline-block -rotate-2 text-[#fef08a]">l</span>
          </span>
        </div>
      </div>
    )
  }

  if (size === 'badge') {
    return (
      <div
        className={`relative flex items-center gap-1.5 rounded-2xl border-2 border-[#fef08a]/60 bg-linear-to-b from-[#382256] to-[#1c102e] px-3.5 py-1 shadow-lg ${className}`}
      >
        <span className="text-[10px] text-[#fef08a]">✦</span>
        <span className={`${dynaPuff.className} text-xs font-bold tracking-wider text-[#fef08a]`}>
          CHILL
        </span>
        <span className="text-[10px] text-[#fef08a]">✦</span>
      </div>
    )
  }

  // Hero Big Cozy & Friendly Centerpiece Logo
  return (
    <div className={`relative flex flex-col items-center select-none ${className}`}>
      {/* Background Soft Starlight & Cotton Aura */}
      <div className="pointer-events-none absolute inset-0 -top-6 rounded-full bg-linear-to-r from-amber-400/20 via-yellow-300/25 to-pink-400/20 blur-3xl" />

      {/* Top Floating Pill Tag */}
      <div className="relative mb-2 flex items-center justify-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-[#351e4f]/80 px-4 py-1 text-[11px] font-bold text-[#fef08a] shadow-md backdrop-blur-md">
          <span className="text-[10px] text-[#fde047]">★</span>
          <span className={`${sniglet.className} tracking-wider uppercase`}>
            Cozy 3D Playground
          </span>
          <span className="text-[10px] text-[#fde047]">★</span>
        </span>
      </div>

      {/* Main Puffy Cartoon Wordmark */}
      <div className="relative flex items-center justify-center py-2">
        <div className="absolute -top-3 -left-3 z-20 flex items-center justify-center sm:-top-5 sm:-left-6">
          <span className="text-lg text-[#fef08a] sm:text-2xl">✦</span>
        </div>
        <div className="absolute -right-3 -bottom-2 z-20 flex items-center justify-center sm:-right-6 sm:-bottom-3">
          <span className="text-base text-[#fde047] sm:text-xl">✦</span>
        </div>

        {/* Big Bouncy Chunky Cartoon Letters with Solid Dimensional Shadow */}
        <h1
          className={`${dynaPuff.className} flex items-center text-7xl font-bold tracking-tight select-none sm:text-9xl md:text-[10rem]`}
        >
          {/* C */}
          <span className="inline-block -rotate-6 transform text-[#fffdf0] drop-shadow-[0_6px_18px_rgba(0,0,0,0.65)] transition-transform duration-200 hover:scale-105">
            C
          </span>

          {/* H */}
          <span className="-ml-1 inline-block rotate-3 transform text-[#fef9c3] drop-shadow-[0_6px_18px_rgba(0,0,0,0.65)] transition-transform duration-200 hover:scale-105 sm:-ml-2">
            h
          </span>

          {/* I with Star Dot */}
          <span className="relative -ml-1 inline-block -rotate-3 transform text-[#fef08a] drop-shadow-[0_6px_18px_rgba(0,0,0,0.65)] transition-transform duration-200 hover:scale-105 sm:-ml-2">
            i{/* Cute Glowing Star for Dot */}
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xl text-[#f59e0b] drop-shadow-[0_0_12px_rgba(245,158,11,0.8)] sm:-top-5 sm:text-3xl md:-top-7 md:text-4xl">
              ★
            </span>
          </span>

          {/* L 1 */}
          <span className="-ml-1 inline-block rotate-6 transform text-[#fde047] drop-shadow-[0_6px_18px_rgba(0,0,0,0.65)] transition-transform duration-200 hover:scale-105 sm:-ml-2">
            l
          </span>

          {/* L 2 */}
          <span className="-ml-1 inline-block -rotate-4 transform text-[#facc15] drop-shadow-[0_6px_18px_rgba(0,0,0,0.65)] transition-transform duration-200 hover:scale-105 sm:-ml-2">
            l
          </span>
        </h1>
      </div>

      {/* Cute Bubbly Marshmallow Subtitle Ribbon */}
      <div className="mt-3 flex items-center gap-2 rounded-2xl border-2 border-[#fde047]/50 bg-linear-to-r from-[#2c1840]/95 via-[#3d205c]/95 to-[#2c1840]/95 px-5 py-2 shadow-2xl backdrop-blur-md sm:px-8">
        <span className="text-xs text-[#fde047]">★</span>
        <span
          className={`${sniglet.className} text-xs font-extrabold tracking-wider text-[#fffbeb] sm:text-sm`}
        >
          Nightly Journey · Player&rsquo;s Guide
        </span>
        <span className="text-xs text-[#fde047]">★</span>
      </div>
    </div>
  )
}

type KeybindingCategory = 'movement' | 'interaction' | 'interface' | 'sports'

interface KeybindingItem {
  keys: string[]
  action: string
  description: string
  category: KeybindingCategory
}

const CATEGORY_LABELS: Record<KeybindingCategory, string> = {
  movement: 'Movement & Locomotion',
  interaction: 'World Interactions',
  interface: 'Tools & Menus',
  sports: 'Sports & Minigames',
}

const KEYBINDINGS: KeybindingItem[] = [
  {
    keys: ['W', 'A', 'S', 'D'],
    action: 'Walk & Ski',
    description: 'Explore freely on foot or glide down slopes on skis.',
    category: 'movement',
  },
  {
    keys: ['Shift'],
    action: 'Sprint / Ski Boost',
    description: 'Run faster and kick up puffy snow plumes while skiing.',
    category: 'movement',
  },
  {
    keys: ['Spacebar'],
    action: 'Jump',
    description: 'Leap over terrain or jump high to spike a volleyball.',
    category: 'movement',
  },
  {
    keys: ['Right-click + drag'],
    action: 'Look around',
    description: 'Orbit the camera a full 360° around your avatar.',
    category: 'movement',
  },
  {
    keys: ['Scroll'],
    action: 'Zoom View',
    description: 'Pull in close to your character or zoom out for panoramas.',
    category: 'movement',
  },
  {
    keys: ['Left-click', 'F'],
    action: 'Throw / Spike / Shoot',
    description: 'Throw snowballs/sand, spike volleyballs, or shoot skeet clays.',
    category: 'sports',
  },
  {
    keys: ['G'],
    action: 'Interact',
    description: 'Sit on benches, pet companions, light campfires, or read billboards.',
    category: 'interaction',
  },
  {
    keys: ['Tab', 'E'],
    action: 'Props & Decor',
    description: 'Open the palette of placeable props and lanterns.',
    category: 'interface',
  },
  {
    keys: ['C'],
    action: 'Avatar Studio',
    description: 'Personalize hair, outfits, colors, and accessories.',
    category: 'interface',
  },
  {
    keys: ['P'],
    action: 'Companions AI',
    description: 'Choose your pet, name them, and converse with In-Browser AI.',
    category: 'interface',
  },
  {
    keys: ['M'],
    action: 'Sound & Music',
    description: 'Mix ambient nature soundscapes and generative lo-fi melodies.',
    category: 'interface',
  },
  {
    keys: ['O'],
    action: 'Display & Comfort',
    description: 'Adjust graphics quality, FOV, and camera responsiveness.',
    category: 'interface',
  },
  {
    keys: ['K'],
    action: 'Sceneries',
    description: 'Teleport across five distinct atmospheric realms.',
    category: 'interface',
  },
  {
    keys: ['N'],
    action: 'Constellations',
    description: 'Locate 88 astronomical constellations (Observatory Peak only).',
    category: 'interface',
  },
  {
    keys: ['L'],
    action: 'LAN Multiplayer',
    description: 'Host a room and share a direct link for friends to join.',
    category: 'interface',
  },
  {
    keys: ['Enter'],
    action: 'Multiplayer Chat',
    description: 'Open chat to message other players in room (multiplayer).',
    category: 'interface',
  },
  {
    keys: ['B'],
    action: 'Daily Billboard',
    description: 'Place a billboard and generate fresh inspirational quotes.',
    category: 'interaction',
  },
  {
    keys: ['T'],
    action: 'Post Thought',
    description: 'Release a glowing lantern carrying your thought into the sky.',
    category: 'interaction',
  },
  {
    keys: ['Esc'],
    action: 'Close / Stand Up',
    description: 'Close open menus, stand up from sitting, or leave a match.',
    category: 'interaction',
  },
]

const COMPANIONS: {
  id: CompanionSpecies
  name: string
  title: string
  desc: string
  tag: string
}[] = [
  {
    id: 'cat',
    name: 'Neko',
    title: 'Calico Cat',
    desc: 'Affectionate, loves purring softly when petted, and curls up next to you by the warm fire.',
    tag: 'Calm & Warm',
  },
  {
    id: 'shiba',
    name: 'Shiba',
    title: 'Shiba Inu',
    desc: 'Cheerful and energetic pup with a bright permanent grin, wagging tail, and steadfast loyalty.',
    tag: 'Loyal & Cheerful',
  },
  {
    id: 'bunny',
    name: 'Marshmallow',
    title: 'Snow Bunny',
    desc: 'Fluffy white rabbit with restless twitching ears, hopping playfully through snow and flower meadows.',
    tag: 'Gentle & Quiet',
  },
  {
    id: 'penguin',
    name: 'Penpen',
    title: 'Little Penguin',
    desc: 'Endearing waddling penguin that flaps its flippers happily and loves icy alpine frost.',
    tag: 'Playful & Bright',
  },
  {
    id: 'dragon',
    name: 'Ryuu',
    title: 'Baby Dragon',
    desc: 'Gentle magical little guardian that breathes tiny warm puffs of smoke and glides happily.',
    tag: 'Mystical & Loving',
  },
]

function SectionHeader({ title, align = 'left' }: { title: string; align?: 'left' | 'center' }) {
  if (align === 'center') {
    return (
      <div className="my-8 flex items-center justify-center gap-4">
        <div className="h-0.5 max-w-30 flex-1 bg-linear-to-r from-transparent via-[#f2c879]/50 to-[#f2c879]" />
        <h2
          className={`${fredoka.className} text-2xl font-bold tracking-wider text-[#f2c879] uppercase drop-shadow-[0_2px_12px_rgba(242,200,121,0.35)] md:text-3xl`}
        >
          {title}
        </h2>
        <div className="h-0.5 max-w-30 flex-1 bg-linear-to-l from-transparent via-[#f2c879]/50 to-[#f2c879]" />
      </div>
    )
  }

  return (
    <div className="my-8 flex items-center gap-4">
      <h2
        className={`${fredoka.className} text-2xl font-bold tracking-wider text-[#f2c879] uppercase drop-shadow-[0_2px_12px_rgba(242,200,121,0.35)] md:text-3xl`}
      >
        {title}
      </h2>
      <div className="h-0.5 flex-1 bg-linear-to-r from-[#f2c879]/60 via-[#f2c879]/20 to-transparent" />
    </div>
  )
}

function PillBadge({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center justify-center rounded-full border border-[#f2c879]/35 bg-[#261838]/80 px-4 py-1 text-xs font-medium tracking-wide text-[#f2c879] shadow-md backdrop-blur-md md:text-sm">
      {label}
    </div>
  )
}

function KbdBadge({ children }: { children: string }) {
  return (
    <span className="rounded-lg border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#f2c879] shadow-sm">
      {children}
    </span>
  )
}

export default function ManualPage() {
  const [demoAvatarConfig, setDemoAvatarConfig] = useState<ChibiAvatarConfig>(DEFAULT_AVATAR_CONFIG)
  const [activeSpecies, setActiveSpecies] = useState<CompanionSpecies>('cat')
  const petRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  const selectedCompanion = COMPANIONS.find((c) => c.id === activeSpecies) || COMPANIONS[0]!

  const handleSelectPet = (id: CompanionSpecies) => {
    setActiveSpecies(id)
    const el = petRefs.current[id]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }

  return (
    <div className="min-h-screen bg-[#130f1f] text-slate-100 selection:bg-[#f2c879]/30 selection:text-[#f2c879]">
      {/* Deep Violet Starry Night Backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {/* Layer 1: Dense Micro & Medium Stars */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `
              radial-gradient(1px 1px at 25px 35px, #ffffff, rgba(0,0,0,0)),
              radial-gradient(1.5px 1.5px at 75px 145px, #f2c879, rgba(0,0,0,0)),
              radial-gradient(2px 2px at 155px 95px, #ffffff, rgba(0,0,0,0)),
              radial-gradient(1px 1px at 225px 215px, #fde047, rgba(0,0,0,0)),
              radial-gradient(2.5px 2.5px at 305px 65px, #f2c879, rgba(0,0,0,0)),
              radial-gradient(1px 1px at 380px 180px, #ffffff, rgba(0,0,0,0)),
              radial-gradient(1.5px 1.5px at 120px 280px, #e9d5ff, rgba(0,0,0,0)),
              radial-gradient(2px 2px at 270px 320px, #fef08a, rgba(0,0,0,0))
            `,
            backgroundSize: '320px 320px',
          }}
        />

        {/* Layer 2: Twinkling Celestial Cross Stars */}
        <div className="absolute inset-0">
          {[
            { top: '8%', left: '10%', size: 'text-sm', color: 'text-[#f2c879]', delay: '0s' },
            { top: '15%', left: '88%', size: 'text-base', color: 'text-amber-200', delay: '1.4s' },
            { top: '28%', left: '4%', size: 'text-xs', color: 'text-purple-200', delay: '2.1s' },
            { top: '38%', left: '92%', size: 'text-sm', color: 'text-[#f2c879]', delay: '0.7s' },
            { top: '52%', left: '12%', size: 'text-base', color: 'text-yellow-100', delay: '1.9s' },
            { top: '65%', left: '84%', size: 'text-xs', color: 'text-cyan-200', delay: '2.8s' },
            { top: '78%', left: '6%', size: 'text-sm', color: 'text-[#f2c879]', delay: '1.1s' },
            { top: '86%', left: '90%', size: 'text-base', color: 'text-amber-300', delay: '0.4s' },
            { top: '42%', left: '48%', size: 'text-xs', color: 'text-purple-300', delay: '3.2s' },
          ].map((star, idx) => (
            <span
              key={idx}
              className={`absolute font-serif select-none ${star.size} ${star.color} animate-pulse drop-shadow-[0_0_8px_rgba(242,200,121,0.8)]`}
              style={{
                top: star.top,
                left: star.left,
                animationDuration: '3s',
                animationDelay: star.delay,
              }}
            >
              ✦
            </span>
          ))}
        </div>

        {/* Layer 3: Soft Violet, Magenta & Golden Nebulas */}
        <div className="absolute -top-10 left-1/4 h-137.5 w-137.5 rounded-full bg-[#f2c879]/10 blur-[150px]" />
        <div className="absolute top-1/4 right-0 h-125 w-125 rounded-full bg-purple-600/20 blur-[160px]" />
        <div className="absolute top-2/3 left-0 h-137.5 w-137.5 rounded-full bg-indigo-600/20 blur-[170px]" />
        <div className="absolute right-1/4 bottom-10 h-125 w-125 rounded-full bg-amber-500/10 blur-[150px]" />
      </div>

      {/* Top Floating App Bar */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#130f1f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link
            href="/"
            className="group flex items-center gap-2 text-xs font-semibold tracking-wider text-[#f2c879] transition hover:text-white"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-white/5 shadow transition group-hover:scale-105">
              ←
            </span>
            <span>BACK TO WORLD</span>
          </Link>

          {/* Top Wordmark Logo */}
          <div className="flex items-center gap-2">
            <ChillLogo size="nav" />
            <span className="hidden text-xs font-medium text-white/50 sm:inline">
              | Player&rsquo;s Manual
            </span>
          </div>

          <div className="w-16" />
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 mx-auto max-w-4xl space-y-16 px-5 py-10">
        {/* =========================================================================
            1. HERO SECTION (Art Showcase / Title Banner)
        ========================================================================= */}
        <section className="relative flex flex-col items-center pt-2 pb-6 text-center">
          {/* Main Title Centerpiece with Custom Designed Logo */}
          <div className="relative z-10 flex flex-col items-center">
            <ChillLogo size="hero" />

            <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">
              An interactive 3D realm crafted for winding down, listening to generative lo-fi
              melodies, admiring real astronomical constellations, skiing down snowy summits, and
              sitting peacefully with cute companion pets.
            </p>
          </div>
        </section>

        {/* =========================================================================
            2. STORY (Layout: Text Left, Floating Island Diorama Right)
        ========================================================================= */}
        <section className="space-y-4">
          <SectionHeader title="Story & Atmosphere" />

          <div className="grid grid-cols-1 items-center gap-8 rounded-3xl border border-white/10 bg-linear-to-br from-[#1f1532]/85 to-[#150f24]/85 p-6 shadow-xl backdrop-blur-md sm:p-8 md:grid-cols-12">
            {/* Story Text (Left) */}
            <div className="space-y-4 text-sm leading-relaxed text-white/80 sm:text-base md:col-span-7">
              <p>
                <strong className="font-semibold text-[#f2c879]">CHILL: Nightly Journey</strong> was
                born as a sanctuary for resting tired eyes after a demanding day. Whenever the sun
                sets, players enter a serene 3D haven free of stressful objectives, timers, or
                combat.
              </p>
              <p>
                Whether you wish to glide smoothly down the powdery ski slopes of{' '}
                <em>Frostholm Ridge</em>, watch cherry blossoms drift over the tides of{' '}
                <em>Kamakura Bay</em>, or stargaze under the real astronomical sky at{' '}
                <em>Observatory Peak</em>, the world moves at your exact pace.
              </p>
              <p>
                Light cozy campfires, leave encouraging thoughts on glowing paper lanterns, and
                invite friends over local network with a single click.
              </p>
            </div>

            {/* Floating Low-Poly Diorama Island Card (Right) */}
            <div className="flex flex-col items-center justify-center md:col-span-5">
              <div className="group relative flex w-full max-w-72 flex-col items-center justify-center rounded-3xl border border-[#f2c879]/35 bg-linear-to-b from-[#2e1a47]/80 via-[#1d122d]/90 to-[#120a1c]/95 p-6 shadow-[0_12px_36px_rgba(0,0,0,0.6)] backdrop-blur-xl transition duration-300 hover:border-[#f2c879]/60 hover:shadow-[0_12px_45px_rgba(242,200,121,0.2)]">
                {/* Background Soft Starlight & Nebula Glow */}
                <div className="pointer-events-none absolute inset-0 rounded-3xl bg-linear-to-tr from-amber-500/15 via-purple-500/10 to-transparent" />
                <div className="pointer-events-none absolute top-4 right-4 h-24 w-24 animate-pulse rounded-full bg-amber-400/20 blur-2xl" />

                {/* Floating Island Graphic with Soft Hover Bobbing */}
                <div className="relative flex h-40 w-full items-center justify-center transition-transform duration-500 group-hover:scale-105">
                  <svg
                    viewBox="0 0 200 180"
                    className="h-38 w-38 drop-shadow-[0_12px_24px_rgba(0,0,0,0.7)]"
                  >
                    <defs>
                      <linearGradient id="islandGrass" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#4ade80" />
                        <stop offset="60%" stopColor="#16a34a" />
                        <stop offset="100%" stopColor="#14532d" />
                      </linearGradient>
                      <linearGradient id="islandRock" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#4c2c69" />
                        <stop offset="40%" stopColor="#311947" />
                        <stop offset="100%" stopColor="#170a24" />
                      </linearGradient>
                      <linearGradient id="islandMoon" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fffbeb" />
                        <stop offset="100%" stopColor="#fde047" />
                      </linearGradient>
                      <linearGradient id="fireGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                        <stop offset="0%" stopColor="#ef4444" />
                        <stop offset="50%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="#fde047" />
                      </linearGradient>
                      <radialGradient id="campGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                      </radialGradient>
                    </defs>

                    {/* Glowing Crescent Moon & Stars in Sky */}
                    <circle cx="155" cy="30" r="14" fill="url(#islandMoon)" opacity="0.95" />
                    <circle cx="160" cy="27" r="12" fill="#221338" />
                    <circle cx="45" cy="25" r="1.5" fill="#fef08a" opacity="0.85" />
                    <circle cx="75" cy="18" r="2" fill="#ffffff" opacity="0.9" />
                    <circle cx="120" cy="15" r="1.5" fill="#fde047" opacity="0.75" />
                    <circle cx="30" cy="45" r="1" fill="#ffffff" opacity="0.6" />

                    {/* Floating Island Base Rock Core */}
                    <polygon
                      points="100,75 165,95 145,142 100,168 55,142 35,95"
                      fill="url(#islandRock)"
                    />
                    {/* Rock facets for 3D depth */}
                    <polygon points="100,75 165,95 100,168" fill="#3a1e54" opacity="0.85" />
                    <polygon points="100,75 55,142 100,168" fill="#241136" opacity="0.95" />
                    <polygon points="100,130 115,155 100,168 85,155" fill="#582a7a" />

                    {/* Glowing Crystal Dripping from bottom */}
                    <polygon points="100,168 104,175 100,179 96,175" fill="#a855f7" />

                    {/* Island Grassy Plateau */}
                    <ellipse cx="100" cy="85" rx="65" ry="20" fill="url(#islandGrass)" />
                    {/* Plateau highlight rim */}
                    <ellipse cx="100" cy="83" rx="61" ry="17" fill="#86efac" opacity="0.25" />

                    {/* Left Pine Trees */}
                    <polygon points="50,45 57,68 43,68" fill="#047857" />
                    <polygon points="50,52 60,78 40,78" fill="#065f46" />
                    <polygon points="50,38 55,50 45,50" fill="#10b981" />
                    {/* Snow cap on tree */}
                    <polygon points="50,38 53,44 47,44" fill="#f8fafc" />

                    <polygon points="65,55 72,76 58,76" fill="#047857" />
                    <polygon points="65,48 70,58 60,58" fill="#10b981" />
                    <polygon points="65,48 68,53 62,53" fill="#f8fafc" />

                    {/* Right Snowy Alpine Peaks / Trees */}
                    <polygon points="145,52 153,74 137,74" fill="#047857" />
                    <polygon points="145,44 150,55 140,55" fill="#10b981" />
                    <polygon points="145,44 148,49 142,49" fill="#f8fafc" />

                    {/* Cozy Stone Lantern (Tōrō) */}
                    <rect x="130" y="76" width="5" height="12" fill="#64748b" rx="1" />
                    <rect x="128" y="73" width="9" height="4" fill="#94a3b8" rx="1" />
                    <circle cx="132.5" cy="75" r="2" fill="#fde047" />

                    {/* Campfire Stone Ring */}
                    <ellipse cx="100" cy="90" rx="14" ry="7" fill="#334155" />
                    <ellipse cx="100" cy="90" rx="10" ry="5" fill="#1e293b" />

                    {/* Campfire Warm Glow Aura */}
                    <circle cx="100" cy="84" r="22" fill="url(#campGlow)" />

                    {/* Campfire Animated Flame */}
                    <path
                      d="M95,90 Q92,80 98,75 Q100,70 102,74 Q106,80 105,90 Z"
                      fill="url(#fireGrad)"
                    />
                    <path d="M98,90 Q97,83 100,80 Q103,83 102,90 Z" fill="#fef08a" />

                    {/* Cute Sleeping Chibi Cat next to fire */}
                    <g transform="translate(108, 83) scale(0.65)">
                      {/* Body */}
                      <ellipse cx="14" cy="10" rx="10" ry="7" fill="#f2c879" />
                      {/* Head */}
                      <circle cx="7" cy="8" r="6" fill="#f2c879" />
                      {/* Ears */}
                      <polygon points="4,3 7,7 2,7" fill="#d97706" />
                      <polygon points="8,3 11,7 6,7" fill="#d97706" />
                      {/* Sleeping Closed Eyes */}
                      <path d="M4,9 Q6,11 8,9" fill="none" stroke="#78350f" strokeWidth="1" />
                      {/* Curled Tail */}
                      <path
                        d="M22,10 Q26,6 24,3"
                        fill="none"
                        stroke="#f2c879"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      {/* Zzz Sparkles */}
                      <text
                        x="14"
                        y="0"
                        fontSize="8"
                        fill="#fef08a"
                        fontFamily="sans-serif"
                        fontWeight="bold"
                      >
                        z
                      </text>
                    </g>
                  </svg>
                </div>

                {/* Subtitle Badge & Highlights */}
                <div className="mt-2 flex flex-col items-center gap-1.5 text-center">
                  <span
                    className={`${sniglet.className} text-xs font-bold tracking-wider text-[#fef08a]`}
                  >
                    Cozy Floating Haven
                  </span>
                  <span className="text-[10px] font-medium text-white/60">
                    Infinite Calm · Zero Combat · Pure Rest
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            3. CHARACTER & COMPANIONS (Layout: Unboxed Centering Pets on Left, Details on Right)
        ========================================================================= */}
        <section className="space-y-4">
          <SectionHeader title="Characters & Companions" />

          <div className="space-y-6 rounded-3xl border border-white/10 bg-linear-to-br from-[#1f1532]/85 to-[#150f24]/85 p-6 shadow-xl backdrop-blur-md sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <PillBadge label="The Companions" />
              <span className="text-xs text-white/50">
                Walk close & press <KbdBadge>G</KbdBadge> to pet
              </span>
            </div>

            <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
              {/* Pet Lineup Showcase — Clean Scrolling Track with Auto-Center (Left) */}
              <div className="flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 md:col-span-6">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold tracking-wider text-white/50 uppercase">
                    Select Companion
                  </span>
                </div>

                {/* Horizontal Scrolling Track without boxes around individual pets */}
                <div className="custom-scrollbar flex snap-x snap-mandatory items-center gap-4 overflow-x-auto px-6 py-6 sm:gap-6">
                  {COMPANIONS.map((pet) => {
                    const isSelected = activeSpecies === pet.id
                    return (
                      <button
                        key={pet.id}
                        ref={(el) => {
                          petRefs.current[pet.id] = el
                        }}
                        type="button"
                        onClick={() => handleSelectPet(pet.id)}
                        className={`group relative flex shrink-0 cursor-pointer snap-center flex-col items-center justify-center border-0 bg-transparent p-0 transition-all duration-300 outline-none ${
                          isSelected
                            ? 'z-10 -translate-y-2 scale-135 opacity-100'
                            : 'scale-85 opacity-40 hover:scale-100 hover:opacity-80'
                        }`}
                      >
                        <div
                          className={`h-16 w-16 transition-all duration-300 sm:h-18 sm:w-18 ${
                            isSelected
                              ? 'drop-shadow-[0_8px_24px_rgba(242,200,121,0.65)]'
                              : 'drop-shadow-none'
                          }`}
                        >
                          {renderCompanionIcon(pet.id, 'h-full w-full')}
                        </div>
                        <span
                          className={`mt-2 text-xs font-bold tracking-wide transition-colors duration-200 ${
                            isSelected
                              ? 'text-[#f2c879] drop-shadow-[0_2px_8px_rgba(242,200,121,0.8)]'
                              : 'text-white/60'
                          }`}
                        >
                          {pet.name}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Active Companion Tag Footer */}
                <div className="mt-2 border-t border-white/10 pt-2 text-center">
                  <span className="text-xs font-bold text-[#f2c879]">
                    {selectedCompanion.title}
                  </span>
                  <span className="mx-2 text-white/30">•</span>
                  <span className="text-[11px] text-white/60">{selectedCompanion.tag}</span>
                </div>
              </div>

              {/* Character Description (Right) */}
              <div className="space-y-3 text-sm leading-relaxed text-white/80 md:col-span-6">
                <h3 className={`${fredoka.className} text-xl font-bold text-[#f2c879]`}>
                  {selectedCompanion.name} — {selectedCompanion.title}
                </h3>
                <p>{selectedCompanion.desc}</p>
                <p className="text-xs leading-normal text-white/60">
                  Each companion is powered by <strong>In-Browser Chrome AI</strong>. You can chat
                  freely with your companion, name them anything you love, and they will express
                  warm affection, cheerful purrs, and cozy guidance without your text ever leaving
                  your device.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            4. 3D AVATAR STUDIO (Layout: Description Left, 3D Studio Right)
        ========================================================================= */}
        <section className="space-y-4">
          <SectionHeader title="The 3D Chibi Avatar Studio" />

          <div className="space-y-5 rounded-3xl border border-white/10 bg-linear-to-br from-[#1f1532]/85 to-[#150f24]/85 p-6 shadow-xl backdrop-blur-md sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <PillBadge label="Chibi Customizer" />
              <button
                type="button"
                onClick={() =>
                  setDemoAvatarConfig((prev) => ({ ...prev, ...randomizeAvatarConfig() }))
                }
                title="Randomize Style"
                aria-label="Randomize Style"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#f2c879]/40 bg-[#f2c879]/15 text-[#f2c879] shadow transition hover:scale-110 hover:bg-[#f2c879]/30 active:scale-95"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="h-4 w-4"
                >
                  <path
                    d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <p className="text-xs text-white/60">
              Customize hair styles, cozy winter coats, shoes, and playful accessories. Drag the 3D
              viewport below to inspect your avatar from any angle:
            </p>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-inner">
              <AvatarStudioPanel
                config={demoAvatarConfig}
                onChange={(patch) => setDemoAvatarConfig((prev) => ({ ...prev, ...patch }))}
              />
            </div>
          </div>
        </section>

        {/* =========================================================================
            5. SCENERIES & BIOMES (Layout: Dynamic Alternating Showcase)
        ========================================================================= */}
        <section className="space-y-4">
          <SectionHeader title="Sceneries & Atmosphere" />

          <div className="space-y-4">
            {/* Scenery 1: Frostholm Ridge (Visual Left, Text Right) */}
            <div className="grid grid-cols-1 items-center gap-6 rounded-3xl border border-sky-400/25 bg-linear-to-r from-sky-950/40 via-[#1c132e]/80 to-[#150f24]/80 p-6 shadow-lg backdrop-blur-md md:grid-cols-12">
              <div className="flex flex-col items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-950/30 p-4 md:col-span-4">
                <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-300">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    className="h-8 w-8"
                  >
                    <path d="M8 18l4-8 4 8" />
                    <path d="M3 20l6-12 5 10" />
                    <path d="M14 18l3-5 4 7" />
                  </svg>
                </div>
                <PillBadge label="Frostholm Summit" />
              </div>
              <div className="space-y-2 md:col-span-8">
                <div className="flex items-center gap-2">
                  <h3 className={`${fredoka.className} text-xl font-bold text-sky-200`}>
                    Frostholm Ridge
                  </h3>
                  <span className="text-xs font-medium text-sky-400/70">
                    · Snowy Peaks & Slopes
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-white/75">
                  Crisp alpine winds, footprints that press real geometric depth into powdery snow,
                  downhill skiing trails with fluffy snow sprays, and 30 spinning gold coins to
                  collect for high scores.
                </p>
              </div>
            </div>

            {/* Scenery 2: Kamakura Bay (Text Left, Visual Right) */}
            <div className="grid grid-cols-1 items-center gap-6 rounded-3xl border border-pink-400/25 bg-linear-to-l from-pink-950/40 via-[#1c132e]/80 to-[#150f24]/80 p-6 shadow-lg backdrop-blur-md md:grid-cols-12">
              <div className="order-2 space-y-2 md:order-1 md:col-span-8">
                <div className="flex items-center gap-2">
                  <h3 className={`${fredoka.className} text-xl font-bold text-pink-200`}>
                    Kamakura Bay
                  </h3>
                  <span className="text-xs font-medium text-pink-400/70">· Sakura Coastline</span>
                </div>
                <p className="text-sm leading-relaxed text-white/75">
                  Gentle rhythmic ocean tides on warm sand, soft pink cherry blossom petals swirling
                  on coastal breezes, and peaceful footsteps fading along the shoreline.
                </p>
              </div>
              <div className="order-1 flex flex-col items-center justify-center rounded-2xl border border-pink-400/20 bg-pink-950/30 p-4 md:order-2 md:col-span-4">
                <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-500/20 text-pink-300">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    className="h-8 w-8"
                  >
                    <circle cx="12" cy="7" r="3" />
                    <path
                      d="M2 18c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0"
                      strokeLinecap="round"
                    />
                    <path d="M2 14c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0" strokeLinecap="round" />
                  </svg>
                </div>
                <PillBadge label="Sakura Coast" />
              </div>
            </div>

            {/* Sceneries 3, 4, 5: Grid Cards */}
            <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-3">
              {/* Aki Highlands */}
              <div className="space-y-3 rounded-2xl border border-amber-400/20 bg-[#1c132e]/80 p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">🍂</span>
                  <PillBadge label="Aki Highlands" />
                </div>
                <h3 className={`${fredoka.className} text-base font-bold text-amber-200`}>
                  Aki Highlands
                </h3>
                <p className="text-xs leading-relaxed text-white/70">
                  Golden autumn hills under warm afternoon skies, gentle rustling maple trees, and
                  distant birdsong.
                </p>
              </div>

              {/* Sports Arena */}
              <div className="space-y-3 rounded-2xl border border-orange-400/20 bg-[#1c132e]/80 p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">🏐</span>
                  <PillBadge label="Sports Arena" />
                </div>
                <h3 className={`${fredoka.className} text-base font-bold text-orange-200`}>
                  Sunset Sports Arena
                </h3>
                <p className="text-xs leading-relaxed text-white/70">
                  Beach volleyball court with dynamic jumping/spiking, and a 10-round skeet clay
                  shooting range.
                </p>
              </div>

              {/* Observatory Peak */}
              <div className="space-y-3 rounded-2xl border border-purple-400/20 bg-[#1c132e]/80 p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">🔭</span>
                  <PillBadge label="Observatory Peak" />
                </div>
                <h3 className={`${fredoka.className} text-base font-bold text-purple-200`}>
                  Observatory Peak
                </h3>
                <p className="text-xs leading-relaxed text-white/70">
                  High-altitude telescope platform with real moon phases and interactive
                  88-constellation camera tracking.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            6. ASTRONOMY & MINIGAMES (Layout: Minigames Showcase)
        ========================================================================= */}
        <section className="space-y-4">
          <SectionHeader title="Sports, Skiing & Minigames" />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Ski & Coin Run */}
            <div className="space-y-3 rounded-2xl border border-[#f2c879]/25 bg-linear-to-b from-[#241738] to-[#150f24] p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xl">⛷️</span>
                <span className="font-mono text-[10px] font-bold text-amber-300">30 COINS RUN</span>
              </div>
              <h3 className={`${fredoka.className} text-base font-bold text-[#f2c879]`}>
                Downhill Skiing & Coin Hunt
              </h3>
              <p className="text-xs leading-relaxed text-white/70">
                At Frostholm Ridge, mount skis, glide downhill with voluminous snow plumes, and
                collect 30 spinning gold coins to set your personal best.
              </p>
            </div>

            {/* Beach Volleyball */}
            <div className="space-y-3 rounded-2xl border border-[#f2c879]/25 bg-linear-to-b from-[#241738] to-[#150f24] p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xl">🏐</span>
                <span className="font-mono text-[10px] font-bold text-[#f2c879]">FIRST TO 5</span>
              </div>
              <h3 className={`${fredoka.className} text-base font-bold text-[#f2c879]`}>
                Beach Volleyball
              </h3>
              <p className="text-xs leading-relaxed text-white/70">
                Join either side at Sunset Sports Arena. Jump with <KbdBadge>Space</KbdBadge> and
                press <KbdBadge>F</KbdBadge> in mid-air to spike the ball over the net.
              </p>
            </div>

            {/* Skeet Shooting */}
            <div className="space-y-3 rounded-2xl border border-[#f2c879]/25 bg-linear-to-b from-[#241738] to-[#150f24] p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xl">🎯</span>
                <span className="font-mono text-[10px] font-bold text-rose-300">10 ROUNDS</span>
              </div>
              <h3 className={`${fredoka.className} text-base font-bold text-[#f2c879]`}>
                Skeet Clay Shooting
              </h3>
              <p className="text-xs leading-relaxed text-white/70">
                Step up to the shooting stand, launch high-velocity clay targets, and left-click to
                intercept them mid-flight.
              </p>
            </div>
          </div>
        </section>

        {/* =========================================================================
            7. CONTROLS CHEATSHEET
        ========================================================================= */}
        <section className="space-y-4">
          <SectionHeader title="Controls & Keybindings" />

          <div className="rounded-3xl border border-white/10 bg-linear-to-br from-[#1f1532]/85 to-[#150f24]/85 p-6 shadow-xl backdrop-blur-md sm:p-8">
            <div className="space-y-6">
              {(['movement', 'interaction', 'sports', 'interface'] as KeybindingCategory[]).map(
                (cat) => {
                  const items = KEYBINDINGS.filter((k) => k.category === cat)
                  return (
                    <div key={cat} className="space-y-2">
                      <h3 className="font-mono text-xs font-bold tracking-wider text-[#f2c879]/80 uppercase">
                        {CATEGORY_LABELS[cat]}
                      </h3>
                      <div className="divide-y divide-white/8 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm">
                        {items.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                          >
                            <div className="flex min-w-35 items-center gap-1.5">
                              {item.keys.map((k, kIdx) => (
                                <KbdBadge key={kIdx}>{k}</KbdBadge>
                              ))}
                            </div>
                            <div className="min-w-50 flex-1">
                              <span className="text-sm font-semibold text-white">
                                {item.action}
                              </span>
                              <span className="ml-2 text-xs text-white/50">{item.description}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                },
              )}
            </div>
          </div>
        </section>

        {/* Bottom CTA Footer */}
        <footer className="space-y-4 py-12 text-center">
          <PillBadge label="Ready to rest & explore?" />
          <div>
            <Link
              href="/"
              className={`${fredoka.className} inline-flex items-center gap-2 rounded-2xl border border-[#f2c879]/40 bg-linear-to-r from-[#f2c879] to-[#d97706] px-8 py-3.5 text-base font-bold text-slate-950 shadow-xl transition hover:brightness-110 active:scale-95`}
            >
              Enter Chill 3D World 🚀
            </Link>
          </div>
          <p className="text-xs text-white/40">
            Chill — Crafted with WebGPU, Three.js & In-Browser AI
          </p>
        </footer>
      </main>
    </div>
  )
}
