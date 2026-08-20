'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { EngineCommand } from '@/engine/core/Engine'
import {
  COMPANION_SPECIES_LIST,
  useCompanionStore,
  renderCompanionIcon,
  type CompanionSpeciesInfo,
} from '@/lib/companion/companionStore'
import {
  chatWithCompanion,
  warmUpCompanionAi,
  checkChromePromptAiReady,
  type ChromePromptAiStatus,
} from '@/lib/ai/localAi'
import { useSceneryId } from '@/lib/scenery/sceneryStore'
import { ChromeAiGuide } from './ChromeAiGuide'

function HidePetIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={className}
    >
      <circle cx="12" cy="15" r="3.2" stroke="currentColor" />
      <circle cx="7.5" cy="10.5" r="1.5" fill="currentColor" />
      <circle cx="16.5" cy="10.5" r="1.5" fill="currentColor" />
      <circle cx="10.5" cy="7.5" r="1.4" fill="currentColor" />
      <circle cx="13.5" cy="7.5" r="1.4" fill="currentColor" />
      <line
        x1="4.5"
        y1="4.5"
        x2="19.5"
        y2="19.5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CompanionModal({ command }: { command?: (cmd: EngineCommand) => void }) {
  const {
    isOpen,
    setIsOpen,
    species,
    setSpecies,
    petName,
    setPetName,
    activeTab,
    setActiveTab,
    messages,
    addMessage,
    isThinking,
    setIsThinking,
  } = useCompanionStore()

  const sceneryId = useSceneryId()
  const [inputVal, setInputVal] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [aiStatus, setAiStatus] = useState<ChromePromptAiStatus | null>(null)
  const [showAiGuide, setShowAiGuide] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activePetInfo =
    COMPANION_SPECIES_LIST.find((s) => s.id === species) || COMPANION_SPECIES_LIST[0]!

  // Warm up AI in background immediately on mount or when modal opens
  useEffect(() => {
    void warmUpCompanionAi(species)
  }, [isOpen, species])

  // Same "is Chrome Built-in AI actually enabled" check the billboard panel does —
  // without it, a player without AI enabled just gets generic offline fallback
  // replies with no indication anything's missing or how to fix it.
  useEffect(() => {
    if (isOpen) {
      void checkChromePromptAiReady().then(setAiStatus)
    }
  }, [isOpen])

  const closeModal = () => {
    setIsOpen(false)
    setShowAiGuide(false)
  }

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, activeTab])

  // Keyboard shortcut: ESC to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        setShowAiGuide(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, setIsOpen, setShowAiGuide])

  if (!isOpen) return null

  const handleHideCompanion = () => {
    setSpecies('none')
    command?.({ type: 'setCompanion', species: 'none' })
  }

  const handleSelectSpecies = (info: CompanionSpeciesInfo) => {
    if (species === info.id) {
      // Clicking the already selected pet unselects & hides it
      handleHideCompanion()
      return
    }
    setSpecies(info.id)
    void warmUpCompanionAi(info.id)
    command?.({ type: 'setCompanion', species: info.id })
    command?.({ type: 'petCompanion' })
    setActiveTab('chat')
  }

  const handleSaveName = (newName: string) => {
    const clean = newName.trim()
    if (clean) {
      setPetName(clean)
      command?.({ type: 'setCompanionName', name: clean })
    }
    setIsEditingName(false)
  }

  const handlePetAction = () => {
    if (species === 'none') return
    command?.({ type: 'petCompanion' })
    addMessage({
      sender: 'user',
      text: '*Gently pet and scratch companion with care*',
    })
    setIsThinking(true)
    setTimeout(() => {
      setIsThinking(false)
      const actionText =
        species === 'dragon'
          ? '*Flutters wings, breathes a warm puff of smoke, and nuzzles into your palm* Purr~'
          : species === 'cat'
            ? '*Closes eyes, purrs softly, and rubs cheek against your hand* Meow~'
            : species === 'shiba'
              ? '*Wags tail excitedly, gives a cheerful squinty-eyed grin, and rests chin on your knee* Woof!'
              : species === 'bunny'
                ? '*Twitches nose and gently touches your palm with soft fluffy ears* Snuggle...'
                : species === 'penguin'
                  ? '*Flaps flippers happily, makes a cheerful chirp, and leans on your leg* Peep!'
                  : '*Nuzzles into your hand with gentle warmth* Whimper~'

      addMessage({
        sender: 'pet',
        text: actionText,
      })
    }, 180)
  }

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputVal).trim()
    if (!text || isThinking || species === 'none') return

    addMessage({ sender: 'user', text })
    setInputVal('')
    setIsThinking(true)

    try {
      const sceneryName =
        sceneryId === 'frostholm-ridge'
          ? 'Frostholm Ridge'
          : sceneryId === 'aki-highlands'
            ? 'Aki Highlands'
            : sceneryId === 'sports-arena'
              ? 'Sports Arena'
              : sceneryId === 'observatory'
                ? 'Observatory Peak'
                : 'Kamakura Bay'

      const result = await chatWithCompanion(petName || activePetInfo.name, text, sceneryName)
      addMessage({
        sender: 'pet',
        text: result.reply,
      })
    } catch {
      addMessage({
        sender: 'pet',
        text: '*Looks up at you with affection and snuggles closer*',
      })
    } finally {
      setIsThinking(false)
    }
  }

  const isHidden = species === 'none'

  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 fixed right-6 bottom-24 z-40 flex flex-col items-end duration-200">
      {/* Floating Bottom-Right Widget Card */}
      <div className="border-glass-edge bg-glass-surface text-glass-foreground relative flex h-130 w-95 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-3xl border shadow-2xl backdrop-blur-2xl transition-all">
        {/* Header */}
        <div className="border-glass-edge flex items-center justify-between border-b bg-black/20 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${
                isHidden
                  ? 'border-white/15 bg-white/10 text-white/60 shadow-inner'
                  : `${activePetInfo.cardBorder} ${activePetInfo.cardBg}`
              } p-1.5 shadow-inner ring-1 ring-white/10`}
            >
              {isHidden ? (
                <HidePetIcon className="h-5 w-5 text-white/70" />
              ) : (
                renderCompanionIcon(species, 'h-7 w-7')
              )}
            </div>
            <div>
              {isHidden ? (
                <div>
                  <h2 className="text-sm font-bold tracking-wide text-white">
                    No Companion Active
                  </h2>
                  <p className="text-glass-muted text-[10px]">Pet is currently hidden</p>
                </div>
              ) : isEditingName ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSaveName(nameInput)
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="glass w-28 rounded-lg border border-white/30 px-2 py-0.5 text-xs font-bold text-white scheme-dark outline-none"
                    autoFocus
                    maxLength={16}
                  />
                  <button
                    type="submit"
                    className="px-1 text-xs font-bold text-emerald-300 hover:text-emerald-200"
                    title="Save name"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingName(false)}
                    className="px-1 text-xs text-white/40 hover:text-white"
                    title="Cancel"
                  >
                    ✕
                  </button>
                </form>
              ) : (
                <div
                  className="group flex cursor-pointer items-center gap-1.5"
                  onClick={() => {
                    setNameInput(petName)
                    setIsEditingName(true)
                  }}
                  title="Click to rename companion"
                >
                  <h2 className="text-sm font-bold tracking-wide text-white transition group-hover:text-amber-200">
                    {petName || activePetInfo.name}
                  </h2>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="h-3 w-3 text-white/30 transition group-hover:text-white/80"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
              )}
              {!isHidden && <p className="text-glass-muted text-[10px]">{activePetInfo.title}</p>}
            </div>
          </div>

          <button
            type="button"
            onClick={closeModal}
            aria-label="Close"
            className="text-glass-muted hover:bg-glass-foreground/10 hover:text-glass-foreground flex h-7 w-7 items-center justify-center rounded-full transition"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4"
            >
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-glass-edge flex border-b bg-black/10 px-4 py-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
              activeTab === 'chat'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-3.5 w-3.5"
            >
              <path
                d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                strokeLinejoin="round"
              />
            </svg>
            <span>Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('select')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
              activeTab === 'select'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-3.5 w-3.5"
            >
              <rect x="3" y="3" width="7" height="7" rx="2" />
              <rect x="14" y="3" width="7" height="7" rx="2" />
              <rect x="3" y="14" width="7" height="7" rx="2" />
              <rect x="14" y="14" width="7" height="7" rx="2" />
            </svg>
            <span>Choose Companion</span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'select' ? (
          /* Species Selector List */
          <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-4">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium tracking-wide text-white/70">
                Choose or hide your companion pet
              </p>
            </div>

            {/* Option to Hide Companion */}
            <div
              onClick={handleHideCompanion}
              className={`group relative flex cursor-pointer items-center justify-between rounded-2xl border p-3 transition-all ${
                isHidden
                  ? 'border-amber-400 bg-amber-500/15 shadow-md ring-1 ring-amber-400/30'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 p-1 text-white/70 shadow-inner">
                  <HidePetIcon className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white transition group-hover:text-amber-200">
                    No Companion (Hide Pet)
                  </span>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-white/60">
                    Explore the world quietly without a companion pet.
                  </p>
                </div>
              </div>
              {isHidden && <span className="text-xs font-bold text-amber-400">✓</span>}
            </div>

            {COMPANION_SPECIES_LIST.map((info) => {
              const isSelected = species === info.id
              return (
                <div
                  key={info.id}
                  onClick={() => handleSelectSpecies(info)}
                  className={`group relative flex cursor-pointer items-center justify-between rounded-2xl border p-3 transition-all ${
                    isSelected
                      ? 'border-amber-400 bg-amber-500/15 shadow-md ring-1 ring-amber-400/30'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border ${info.cardBorder} ${info.cardBg} p-1 shadow-inner`}
                    >
                      {renderCompanionIcon(info.id, 'h-7 w-7')}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white transition group-hover:text-amber-200">
                          {info.name}
                        </span>
                        <span className="text-[10px] text-white/50">{info.title}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-white/60">
                        {info.description}
                      </p>
                    </div>
                  </div>
                  {isSelected && <span className="text-xs font-bold text-amber-400">✓</span>}
                </div>
              )
            })}
          </div>
        ) : isHidden ? (
          /* Empty State when Companion is Hidden */
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-white/60 shadow-inner">
              <HidePetIcon className="h-8 w-8" />
            </div>
            <h3 className="mb-1 text-sm font-bold text-white">Companion is Hidden</h3>
            <p className="mb-5 max-w-xs text-xs leading-relaxed text-white/60">
              You do not have an active pet with you right now. Choose a companion pet to walk with
              you and chat!
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('select')}
              className="flex items-center gap-2 rounded-2xl bg-amber-400 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg transition hover:bg-amber-300"
            >
              <span>Choose Companion</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-3.5 w-3.5"
              >
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ) : (
          /* Interactive AI Chat Tab */
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* AI Status Banner if Offline/Not-Ready */}
            {aiStatus && !aiStatus.isAvailable && (
              <div className="flex flex-col border-b border-amber-500/20 bg-amber-500/10">
                <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-amber-200">
                  <span>Using offline response mode</span>
                  <button
                    type="button"
                    onClick={() => setShowAiGuide((v) => !v)}
                    className="underline hover:text-white"
                  >
                    {showAiGuide ? 'Hide Guide' : 'Setup Chrome Built-in AI'}
                  </button>
                </div>
                {showAiGuide && (
                  <div className="p-2 pt-0">
                    <ChromeAiGuide
                      aiStatus={aiStatus}
                      show={showAiGuide}
                      onToggle={() => setShowAiGuide((v) => !v)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Message Feed */}
            <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m) => {
                const isUser = m.sender === 'user'
                return (
                  <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                        isUser
                          ? 'bg-amber-400 font-medium text-slate-950 shadow-md'
                          : 'border-glass-edge border bg-white/10 text-white shadow backdrop-blur-md'
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                )
              })}

              {isThinking && (
                <div className="flex justify-start">
                  <div className="border-glass-edge bg-glass-foreground/10 flex items-center gap-1 rounded-2xl border px-3 py-1.5">
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400" />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400 [animation-delay:0.2s]" />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400 [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Chips & Neutral Pet Action */}
            <div className="border-glass-edge flex flex-wrap items-center gap-1.5 border-t bg-black/15 px-4 py-2">
              <button
                type="button"
                onClick={handlePetAction}
                className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90 transition hover:bg-white/20 hover:text-white"
              >
                <span>Pet / Hug</span>
              </button>
              {activePetInfo.quickPrompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleSendMessage(q)}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 transition hover:bg-white/15 hover:text-white"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleSendMessage()
              }}
              className="border-glass-edge flex items-center gap-2 border-t bg-black/20 p-3"
            >
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={`Chat with ${petName || activePetInfo.name}...`}
                className="flex-1 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-xs text-white outline-none placeholder:text-white/40 focus:border-amber-400/50"
              />
              <button
                type="submit"
                disabled={!inputVal.trim() || isThinking}
                className="flex items-center gap-1 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-amber-300 disabled:opacity-40"
              >
                <span>Send</span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="h-3 w-3"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
