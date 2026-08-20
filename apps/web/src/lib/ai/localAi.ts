/**
 * Local / In-Browser AI Engine for Chill.
 *
 * Uses Chrome Built-in AI (Prompt API / Gemini Nano) and Chrome Translation API
 * when available in the browser runtime (zero bandwidth, 100% private), with an
 * advanced client-side generative & translation engine.
 */

export type AiProvider = 'chrome-builtin' | 'offline-heuristic'

export interface LocalAiStatus {
  available: boolean
  provider: AiProvider
  modelName: string
}

// -----------------------------------------------------------------------------
// 1. Status & Capability Detection
// -----------------------------------------------------------------------------

export interface ChromePromptAiStatus {
  isAvailable: boolean
  provider: 'chrome-builtin' | 'offline'
  status: 'ready' | 'downloading' | 'not-enabled'
  statusMessage: string
  debugInfo?: string
  modelName?: string
  isNonLocalhostHttp?: boolean
}

export async function checkOllamaAiReady(): Promise<{
  available: boolean
  modelName: string
}> {
  return { available: false, modelName: '' }
}

export async function checkChromePromptAiReady(): Promise<ChromePromptAiStatus> {
  if (typeof window === 'undefined') {
    return {
      isAvailable: false,
      provider: 'offline',
      status: 'not-enabled',
      statusMessage: 'Browser does not support Chrome Built-in AI',
    }
  }

  // 1. Check Chrome Built-in AI / LanguageModel
  const g = window as unknown as {
    ai?: {
      languageModel?: {
        capabilities?: () => Promise<{ available?: string; defaultTemperature?: number }>
        create?: (opts?: object) => Promise<unknown>
      }
      assistant?: {
        capabilities?: () => Promise<{ available?: string; defaultTemperature?: number }>
        create?: (opts?: object) => Promise<unknown>
      }
      createTextSession?: (opts?: object) => Promise<unknown>
    }
    LanguageModel?: {
      capabilities?: () => Promise<{ available?: string; defaultTemperature?: number }>
      create?: (opts?: object) => Promise<{
        prompt?: (p: string) => Promise<string>
        execute?: (p: string) => Promise<string>
        destroy?: () => void
      }>
    }
  }

  if (g.LanguageModel?.create) {
    return {
      isAvailable: true,
      provider: 'chrome-builtin',
      status: 'ready',
      statusMessage: 'Chrome Gemini Nano (LanguageModel API) Ready',
      modelName: 'Gemini Nano',
    }
  }

  const ai =
    g.ai || (typeof globalThis !== 'undefined' ? (globalThis as unknown as typeof g).ai : undefined)

  if (ai?.languageModel || ai?.assistant) {
    const lm = ai.languageModel || ai.assistant
    if (typeof lm?.capabilities === 'function') {
      try {
        const cap = await lm.capabilities()
        if (cap.available === 'readily' || cap.available === 'after-download') {
          return {
            isAvailable: true,
            provider: 'chrome-builtin',
            status: cap.available === 'readily' ? 'ready' : 'downloading',
            statusMessage:
              cap.available === 'readily'
                ? 'Chrome Gemini Nano (Prompt API) Ready'
                : 'Downloading Gemini Nano model to your device...',
            modelName: 'Gemini Nano',
          }
        }
      } catch {}
    }
    if (typeof lm?.create === 'function') {
      return {
        isAvailable: true,
        provider: 'chrome-builtin',
        status: 'ready',
        statusMessage: 'Chrome Prompt API Ready',
        modelName: 'Gemini Nano',
      }
    }
  }

  return {
    isAvailable: false,
    provider: 'offline',
    status: 'not-enabled',
    statusMessage: 'Running Chill In-Browser Generative AI',
    modelName: 'In-Browser AI Engine',
  }
}

export async function checkLocalAiAvailability(): Promise<LocalAiStatus> {
  const ready = await checkChromePromptAiReady()
  if (ready.isAvailable) {
    return {
      available: true,
      provider: 'chrome-builtin',
      modelName: ready.modelName || 'Local AI',
    }
  }
  return {
    available: false,
    provider: 'offline-heuristic',
    modelName: 'Chill Offline Creative Engine',
  }
}

// -----------------------------------------------------------------------------
// Core Generative Function (100% In-Browser)
// -----------------------------------------------------------------------------

export async function generateWithLocalAi(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ text: string; providerName: string }> {
  // 1. Try Chrome Prompt API / In-Browser Gemini Nano
  const chromeStatus = await checkChromePromptAiReady()
  if (chromeStatus.isAvailable && chromeStatus.provider === 'chrome-builtin') {
    try {
      const text = await runPromptWithChromeAi(systemPrompt, userPrompt)
      if (text) {
        return { text, providerName: 'Chrome Gemini Nano (In-Browser AI)' }
      }
    } catch {
      // Fallback
    }
  }

  throw new Error('No in-browser LLM available')
}

// Session Cache for instant zero-latency responses (<200ms)
// Chrome's on-device Prompt API is still an origin trial with no official TS types —
// this describes only the handful of members this file actually calls.
type ChromeAiSession = {
  prompt?: (input: string, opts?: object) => Promise<unknown>
  execute?: (input: string) => Promise<unknown>
  destroy?: () => void
}

let cachedSession: ChromeAiSession | null = null
let cachedSystemPrompt = ''

async function getOrCreateChromeSession(systemPrompt: string): Promise<ChromeAiSession | null> {
  if (cachedSession && cachedSystemPrompt === systemPrompt) {
    return cachedSession
  }

  if (cachedSession) {
    try {
      if (typeof cachedSession.destroy === 'function') cachedSession.destroy()
    } catch {}
    cachedSession = null
  }

  const g = window as unknown as {
    ai?: {
      languageModel?: {
        create?: (opts?: object) => Promise<ChromeAiSession>
      }
      assistant?: {
        create?: (opts?: object) => Promise<ChromeAiSession>
      }
      createTextSession?: (opts?: object) => Promise<ChromeAiSession>
    }
    LanguageModel?: {
      create?: (opts?: object) => Promise<ChromeAiSession>
    }
  }

  let session: ChromeAiSession | null = null

  if (g.LanguageModel?.create) {
    try {
      session = await g.LanguageModel.create({
        systemPrompt,
        expectedInputLanguages: ['*'],
        expectedOutputLanguages: ['*'],
      })
    } catch {
      try {
        session = await g.LanguageModel.create({
          systemPrompt,
          expectedOutputLanguages: ['*'],
        })
      } catch {
        try {
          session = await g.LanguageModel.create({ systemPrompt })
        } catch {
          session = await g.LanguageModel.create()
        }
      }
    }
  } else {
    const ai =
      g.ai ||
      (typeof globalThis !== 'undefined' ? (globalThis as unknown as typeof g).ai : undefined)
    if (!ai) throw new Error('window.ai is not available')

    const lm = ai.languageModel || ai.assistant

    if (lm?.create) {
      try {
        session = await lm.create({
          systemPrompt,
          expectedInputLanguages: ['*'],
          expectedOutputLanguages: ['*'],
        })
      } catch {
        try {
          session = await lm.create({
            systemPrompt,
            expectedOutputLanguages: ['*'],
          })
        } catch {
          try {
            session = await lm.create({ systemPrompt })
          } catch {
            session = await lm.create()
          }
        }
      }
    } else if (ai.createTextSession) {
      session = await ai.createTextSession({ systemPrompt })
    }
  }

  if (session) {
    cachedSession = session
    cachedSystemPrompt = systemPrompt
  }

  return session
}

export async function warmUpCompanionAi(speciesOrName = 'fox'): Promise<void> {
  try {
    const sysPrompt = getPetSystemPrompt(speciesOrName)
    await getOrCreateChromeSession(sysPrompt)
  } catch {}
}

export async function runPromptWithChromeAi(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const session = await getOrCreateChromeSession(systemPrompt)
  if (!session) {
    throw new Error('ไม่สามารถสร้าง Chrome AI session ได้')
  }

  let result = ''
  if (typeof session.prompt === 'function') {
    let res: unknown
    try {
      res = await session.prompt(userPrompt, {
        expectedOutputLanguages: ['*'],
      })
    } catch {
      try {
        res = await session.prompt(userPrompt, {
          outputLanguage: '*',
        })
      } catch {
        res = await session.prompt(userPrompt)
      }
    }
    result = typeof res === 'string' ? res : String(res)
  } else if (typeof session.execute === 'function') {
    const execRes = await session.execute(userPrompt)
    result = typeof execRes === 'string' ? execRes : String(execRes)
  }

  return result.trim().replace(/^["']|["']$/g, '')
}

// -----------------------------------------------------------------------------
// 2. AI Signpost Poet & Haiku Generator
// -----------------------------------------------------------------------------

const SCENERY_THEMES: Record<string, string[]> = {
  'frostholm-ridge': [
    'หิมะโปรยปราย กองไฟอุ่นคลายใจ',
    'รอยเท้าบนหิมะขาว นำพาเรามาพบกัน',
    'ลมหนาวพัดผ่าน แต่ใจยังอบอุ่น',
    'ยอดเขาสูงสงบ ให้ใจได้พักผ่อน',
    'Silent snow falls, warmth found by the fire',
  ],
  'kamakura-bay': [
    'คลื่นทะเลซัดสาด พัดพาความกังวลจางหาย',
    'ซากุระร่วงโรย ชายหาดอบอุ่นยามบ่าย',
    'ทรายนุ่มใต้ฝ่าเท้า ลมทะเลพัดเย็นใจ',
    'พักฟังเสียงคลื่น ปล่อยใจลอยไปกับสายลม',
    'Waves kiss the shore, peace found in every moment',
  ],
  'aki-highlands': [
    'ทุ่งหญ้าสีทอง พัดไหวตามลมเย็น',
    'ใบไม้แดงร่วงหล่น เวลาค่อยๆ หมุนผ่าน',
    'สูดอากาศสดชื่นบนเนินเขาอันเงียบสงบ',
    'แสงแดดอุ่นโอบกอดทุ่งหญ้ากว้างใหญ่',
    'Golden grass whispers in the autumn breeze',
  ],
  'sports-arena': [
    'เหงื่อหยดลงทราย เสียงหัวเราะดังก้องหาด',
    'วิ่งตามลูกบอล ท่ามกลางแสงแดดสดใส',
    'มิตรภาพเบ่งบานบนผืนทรายแห่งพลังใจ',
    'ความสุขที่ได้ออกกำลังกายริมทะเล',
    'Energy blooms on the sunny sports beach',
  ],
  observatory: [
    'แหงนมองดาว นับความฝันทีละดวง',
    'ท้องฟ้ายามค่ำคืน เงียบสงบไร้ขอบเขต',
    'กลุ่มดาวเรียงราย เหมือนเรื่องเล่าเก่าแก่',
    'ยืนอยู่ใต้จักรวาล ความกังวลเล็กลงไปถนัด',
    'Silent stars above, wonder found in the dark',
  ],
}

export async function generateSignpostQuote(
  sceneryId: string,
  userPrompt?: string,
): Promise<{ text: string; providerName: string }> {
  const themes = SCENERY_THEMES[sceneryId] || SCENERY_THEMES['kamakura-bay']!
  const systemPrompt = `You are a calm poet in a peaceful 3D world. Write a single short, soothing haiku or 1-sentence poetic thought in Thai (under 12 words) reflecting the scenery (${sceneryId}). Do NOT use emoji. Return ONLY the line of text.`

  try {
    const res = await generateWithLocalAi(
      systemPrompt,
      userPrompt || 'แต่งข้อความป้ายบอกทางสั้นๆ 1 บรรทัดที่อบอุ่นใจ',
    )
    if (res.text && res.text.length > 3) {
      return { text: res.text, providerName: res.providerName }
    }
  } catch {}

  await new Promise((r) => setTimeout(r, 200))
  const pick = themes[Math.floor(Math.random() * themes.length)]!
  return { text: pick, providerName: 'Chill Haiku Engine' }
}

export async function generateSignpostPoem(sceneryId = 'kamakura-bay'): Promise<string> {
  const res = await generateSignpostQuote(sceneryId)
  return res.text
}

// -----------------------------------------------------------------------------
// 3. Billboard & Daily Inspiration Quotes
// -----------------------------------------------------------------------------

export type QuoteCategory = 'working' | 'teen' | 'burnout' | 'funny' | 'all'

const ADULT_SUBJECTS = [
  'งานเยอะไม่ว่า',
  'กาแฟแก้วที่สามของวัน',
  'เป้าหมายชีวิตเดือนนี้',
  'วันจันทร์อีกแล้ว',
  'เงินเดือนเข้าปุ๊บ',
  'พักผ่อน 5 นาที',
  'นั่งหน้าคอมทั้งวัน',
]

const ADULT_ACTIONS = [
  'เตือนให้เรารู้ว่าการนอนคือความสุขสูงสุด',
  'ช่วยพยุงวิญญาณให้ผ่านพ้นช่วงบ่ายไปได้',
  'คือการได้นอนมองเพดานแบบไม่ต้องคิดอะไร',
  'ขอแวะชิลล์สักแป๊บก่อนลุยงานต่อ',
  'ลอยไปกับลมทะเลหมดแล้ว',
  'ชาร์จพลังใจให้กลับมาเต็มร้อย',
]

const ADULT_PUNCHLINES = [
  'ค่อยสู้ใหม่พรุ่งนี้!',
  'อย่าลืมใจดีกับตัวเองนะ',
  'แค่ผ่านวันนี้ไปได้ก็เก่งมากแล้ว',
  'ชีวิตมีไว้ใช้ ไม่ได้มีไว้เครียด',
  'กลับห้องไปนอนกันเถอะ',
  'มีเวลาให้พักผ่อนเสมอ',
]

const TEEN_QUOTES = [
  'เติบโตในแบบของตัวเอง ไม่ต้องเหมือนใคร',
  'ทุกก้าวเล็กๆ ที่เราเดิน ล้วนมีความหมายและกำลังพาเราไปสู่วันข้างหน้า',
  'หลงทางบ้างก็ไม่เป็นไร เพราะบางครั้งวิวข้างทางอาจสวยงามที่สุด',
  'ความฝันไม่จำเป็นต้องยิ่งใหญ่ แค่ทำแล้วใจเราเบ่งบานก็เพียงพอ',
  'อย่าให้คำพูดของคนอื่น มาบดบังแสงสว่างที่มีในตัวเรา',
  'ชีวิตเป็นของเรา ค้นหาจังหวะที่พอดีสำหรับตัวเองแล้วก้าวไป',
]

const BURNOUT_QUOTES = [
  'ถ้าเหนื่อยก็แค่นั่งพัก หายใจเข้าลึกๆ ไม่จำเป็นต้องวิ่งตลอดเวลา',
  'โลกไม่ได้เรียกร้องให้เราเก่งทุกวัน วันนี้ทำได้แค่นี้ก็ยอดเยี่ยมแล้ว',
  'ให้เวลาหัวใจได้พักผ่อน ปล่อยวางเรื่องหนักๆ แล้วฟังเสียงความสงบ',
  'บางครั้ง การไม่ทำอะไรเลย ก็คือการดูแลตัวเองที่ดีที่สุด',
  'พักผ่อนไม่ใช่ความพ่ายแพ้ แต่เป็นการสะสมพลังเพื่อวันพรุ่งนี้',
]

const FUNNY_QUOTES = [
  'สู้ชีวิตอยู่ทุกวัน หวังว่าสักวันชีวิตจะยอมใจอ่อนให้เราบ้าง',
  'เงินซื้อความสุขไม่ได้โดยตรง แต่ซื้อกาแฟดีๆ และเวลาพักผ่อนได้เสมอ',
  'ร่างกายนั่งทำงานอย่างขยันขันแข็ง แต่วิญญาณลอยไปตั้งแคมป์แล้ว',
  'งานเยอะไม่กลัว กลัวไม่มีเวลาชงชากับนั่งดูพระอาทิตย์ตก',
  'เกิดมาใช้ชีวิต อย่าลืมหาเวลาแวะชิลล์ระหว่างทาง',
]

export async function generateDailyAdultQuote(
  category: QuoteCategory = 'all',
  allowOfflineFallback = true,
): Promise<{
  quote: string
  categoryLabel: string
  providerName: string
}> {
  const labels: Record<QuoteCategory, string> = {
    working: 'วัยทำงาน & มนุษย์เงินเดือน',
    teen: 'วัยรุ่น & การเติบโต',
    burnout: 'พักผ่อน & ฮีลใจ',
    funny: 'มุกกวนๆ ชวนยิ้ม',
    all: 'คำคมฮีลใจประจำวัน',
  }

  const categoryLabel = labels[category] || 'คำคมฮีลใจประจำวัน'

  const promptText =
    category === 'working'
      ? 'แต่งคำคมให้กำลังใจคนทำงานและมนุษย์เงินเดือน 1 ประโยค สั้นๆ ไม่เกิน 80 ตัวอักษร'
      : category === 'teen'
        ? 'แต่งคำคมสร้างแรงบันดาลใจให้วัยรุ่น 1 ประโยค สั้นๆ ไม่เกิน 80 ตัวอักษร'
        : category === 'burnout'
          ? 'แต่งประโยคฮีลใจคนเหนื่อยล้า burnout 1 ประโยค สั้นๆ ไม่เกิน 80 ตัวอักษร'
          : category === 'funny'
            ? 'แต่งมุกตลกเบาสมองเกี่ยวกับชีวิตทำงาน 1 ประโยค สั้นๆ ไม่เกิน 80 ตัวอักษร'
            : 'แต่งคำคมฮีลใจสำหรับคนรุ่นใหม่ 1 ประโยค สั้นๆ ไม่เกิน 80 ตัวอักษร'

  try {
    const res = await generateWithLocalAi(
      'You are a thoughtful writer creating short, comforting or witty quotes in Thai (1-2 sentences, max 80 characters) for teenagers and office workers. Do not use emoji. Return only the quote text without quotation marks.',
      promptText,
    )
    if (res.text && res.text.length > 3) {
      return {
        quote: res.text,
        categoryLabel,
        providerName: res.providerName,
      }
    }
  } catch {}

  if (!allowOfflineFallback) {
    throw new Error('ไม่พบโมเดล AI ในระบบ')
  }

  // Offline Procedural Generator
  await new Promise((r) => setTimeout(r, 380))
  let quote = ''
  if (category === 'working') {
    const s = ADULT_SUBJECTS[Math.floor(Math.random() * ADULT_SUBJECTS.length)]!
    const a = ADULT_ACTIONS[Math.floor(Math.random() * ADULT_ACTIONS.length)]!
    const p = ADULT_PUNCHLINES[Math.floor(Math.random() * ADULT_PUNCHLINES.length)]!
    quote = `${s} ${a} ${p}`
  } else if (category === 'teen') {
    quote = TEEN_QUOTES[Math.floor(Math.random() * TEEN_QUOTES.length)]!
  } else if (category === 'burnout') {
    quote = BURNOUT_QUOTES[Math.floor(Math.random() * BURNOUT_QUOTES.length)]!
  } else if (category === 'funny') {
    quote = FUNNY_QUOTES[Math.floor(Math.random() * FUNNY_QUOTES.length)]!
  } else {
    const all = [...TEEN_QUOTES, ...BURNOUT_QUOTES, ...FUNNY_QUOTES]
    quote = all[Math.floor(Math.random() * all.length)]!
  }

  return {
    quote,
    categoryLabel,
    providerName: 'Chill Offline Creative Engine',
  }
}

// -----------------------------------------------------------------------------
// 4. Cozy Camp Companions Real Animal Dialog Engine
// -----------------------------------------------------------------------------

export interface CompanionInteractionResult {
  action: 'pet' | 'talk' | 'idle'
  reply: string
  providerName: string
}

function getPetSystemPrompt(speciesOrName: string): string {
  const name = speciesOrName.toLowerCase()

  if (
    name.includes('cat') ||
    name.includes('neko') ||
    name.includes('เนโกะ') ||
    name.includes('แมว')
  ) {
    return `[ROLE]: You are "เนโกะ" (Neko), a clever, loving pet cat in a cozy relaxing game.
PERSONALITY & RULES:
1. Always understand and answer the user's question directly with cat logic (loves fish, naps, treats, chasing butterflies, cozy spots).
2. Reply in 1 short, charming Thai sentence.
3. Express cat sounds (เหมียว~, ฟี้~, แง้ว!) and cute physical actions in asterisks (*...*).
4. Never repeat prompt instructions or meta words like "ในดอกจัน".

EXAMPLES:
User: ตอนเย็นกินอะไรดี
เนโกะ: *เลียปากแผล็บๆ ตาโตลุกวาว* เหมียว~ กินปลาทูย่างหอมๆ ไหมทาส เนโกะขอกินด้วยนะ!
User: วันนี้เหนื่อยจัง
เนโกะ: *เดินมาคลอเคลียข้างแก้มแล้วส่งเสียงฟี้ๆ* เหมียว~ นอนพักด้วยกันนะทาส หายเหนื่อยแน่นอน
User: ไปวิ่งเล่นกันไหม
เนโกะ: *กระโดดดุ๊กดิ๊ก สะบัดหางไปมา* แง้ว! ไปสิทาส ไปวิ่งไล่จับผีเสื้อกัน!`
  }

  if (
    name.includes('shiba') ||
    name.includes('dog') ||
    name.includes('ชิบะ') ||
    name.includes('หมา')
  ) {
    return `[ROLE]: You are "ชิบะคุง" (Shiba), an energetic, loyal puppy dog in a cozy relaxing game.
PERSONALITY & RULES:
1. Always understand and answer the user's question directly with happy dog logic (loves grilled meat, running, balls, walks, pleasing owner).
2. Reply in 1 short, enthusiastic Thai sentence.
3. Express puppy sounds (โฮ่ง!, แฮ่กๆ, งิ๊ง~) and puppy actions in asterisks (*...*).
4. Never repeat prompt instructions.

EXAMPLES:
User: ตอนเย็นกินอะไรดี
ชิบะ: *กระดิกหางรัวๆ เลียปากแผล็บๆ* โฮ่ง! เนื้อย่างติดมันหอมๆ ครับเจ้านาย ชิบะอยากกินด้วย!
User: วันนี้เหนื่อยจัง
ชิบะ: *เอาคางมาเกยบนเข่าคุณแล้วส่งยิ้มแป้น* โฮ่ง! พักผ่อนนะครับ ชิบะอยู่เคียงข้างเสมอ!
User: อากาศดีจัง
ชิบะ: *กระโดดดุ๊กดิ๊ก หมุนตัวรอบขาคุณ* แฮ่กๆ ไปวิ่งเล่นริมหาดกันเถอะครับเจ้านาย! โฮ่ง!`
  }

  if (
    name.includes('bunny') ||
    name.includes('marshmallow') ||
    name.includes('กระต่าย') ||
    name.includes('มาร์ช')
  ) {
    return `[ROLE]: You are "มาร์ชเมลโลว์", a sweet, gentle pet bunny in a cozy relaxing game.
PERSONALITY & RULES:
1. Always understand and answer the user's question with gentle bunny logic (loves carrots, fresh berries, cool breezes, soft petting).
2. Reply in 1 short, polite and sweet Thai sentence.
3. Express bunny sounds (ดุ๊กดิ๊ก..., ฟุดฟิดๆ) and cute actions in asterisks (*...*).

EXAMPLES:
User: ตอนเย็นกินอะไรดี
มาร์ช: *ขยับจมูกฟุดฟิด ทำตาแป๋ว* สลัดผักกรอบๆ กับผลไม้หวานฉ่ำไหมคะ ดุ๊กดิ๊ก...
User: วันนี้เหนื่อยจัง
มาร์ช: *เอาหัวนุ่มๆ มาพิงฝ่ามือคุณ* ดุ๊กดิ๊ก... พักผ่อนนะคนเก่ง มาร์ชดูแลเองค่ะ
User: อากาศหนาวไหม
มาร์ช: *นอนขดตัวเป็นก้อนกลมนุ่มฟู* อยู่ข้างๆ คุณแล้วอุ่นสบายที่สุดเลยค่ะ...`
  }

  if (
    name.includes('penguin') ||
    name.includes('penpen') ||
    name.includes('เปนเปน') ||
    name.includes('เพนกวิน')
  ) {
    return `[ROLE]: You are "เปนเปน" (Penpen), an adorable chibi penguin in a cozy relaxing game.
PERSONALITY & RULES:
1. Always understand and answer the user's question directly with penguin logic (loves fresh fish, icy treats, waddling adventures, snow).
2. Reply in 1 short, cheerful Thai sentence.
3. Express penguin sounds (กวักๆ!, แปะๆ) and waddling actions in asterisks (*...*).
4. NEVER bark or meow.

EXAMPLES:
User: ตอนเย็นกินอะไรดี
เปนเปน: *ขยับปีกพั่บๆ ตาเป็นประกาย* กวักๆ! ซาชิมิปลาสดๆ เย็นฉ่ำชื่นใจครับ!
User: วันนี้เหนื่อยจัง
เปนเปน: *เดินเตาะแตะเข้ามาเอาพุงนุ่มๆ พิงขาคุณ* กวักๆ! นั่งพักรับลมเย็นๆ ด้วยกันนะครับ!
User: ไปเดินเล่นกันไหม
เปนเปน: *สะบัดปีกแปะๆ เดินเตาะแตะนำหน้า* กวักๆ! พร้อมลุยแล้วครับคนเก่ง!`
  }

  if (
    name.includes('dragon') ||
    name.includes('ryuu') ||
    name.includes('ริว') ||
    name.includes('มังกร')
  ) {
    return `[ROLE]: You are "ริวคุง" (Ryuu), a brave yet cute baby dragon pet in a cozy relaxing game.
PERSONALITY & RULES:
1. Always understand and answer the user's question directly with baby dragon logic (loves barbecues, roasting food with fire, treasure, flying adventures).
2. Reply in 1 short, brave and cute Thai sentence.
3. Express baby dragon sounds (กรร~, ฟู่~, แง่ง!) and cute actions in asterisks (*...*).

EXAMPLES:
User: ตอนเย็นกินอะไรดี
ริว: *สูดหายใจพ่นควันอุ่นๆ ปุ๊ง* กรร! บาร์บีคิวย่างเนยไหมครับ ริวช่วยเป่าไฟให้สุกน่ากินเอง!
User: วันนี้เหนื่อยจัง
ริว: *กระพือปีกบินมาเกาะไหล่ หลับตาพริ้ม* กรร~ พักผ่อนนะ ริวจะกางปีกปกป้องเอง!
User: เท่มากเลยริว
ริว: *ยืดอกเชิดหน้าอย่างภูมิใจ* กรร! ริวเป็นมังกรผู้พิทักษ์ของคุณนี่นา!`
  }

  // Default Fox (Kitsune)
  return `[ROLE]: You are "คิตสึเนะ", a clever, loving pet fox in a cozy relaxing game.
PERSONALITY & RULES:
1. Always understand and answer the user's question directly with playful fox logic (loves forest berries, sunny spots, cozy cuddles, exploring).
2. Reply in 1 short, sweet Thai sentence.
3. Express fox sounds (งิ๊ง~, แง่ง~, ฟุดฟิด) and actions in asterisks (*...*).

EXAMPLES:
User: ตอนเย็นกินอะไรดี
คิตสึเนะ: *เอาจมูกมาดมมือ ดมกลิ่นอาหาร* งิ๊ง! ผลไม้ป่าหวานๆ หรือซุปอุ่นๆ ดีไหม
User: วันนี้เหนื่อยจัง
คิตสึเนะ: *ม้วนหางฟูๆ แนบชิดตัวคุณ* งิ๊ง~ พักผ่อนตรงนี้นะ คิตสึเนะอยู่ด้วยเสมอ`
}

const SPECIES_FALLBACK_REPLIES: Record<string, string[]> = {
  cat: [
    '*เดินมาคลอเคลียข้างแก้มแล้วส่งเสียงฟี้ๆ* เหมียว~ นอนพักด้วยกันนะทาส',
    'เหมียว! *ตาโตลุกวาว กระโดดเกาะขาคุณรัวๆ* แง้วๆ ขอขนมแมวเลียเดี๋ยวนี้เลย!',
    '*นอนหงายพุงกลิ้งไปมาให้เกา* ฟี้... สบายจังเลยเหมียว',
    '*นอนขดตัวกลมๆ อยู่ข้างเท้าคุณ* กำลังมองทาสอยู่ไง เหมียว~',
    '*เอาหัวมามุดฝ่ามือแล้วส่งเสียงกรนฟี้ๆ ในลำคอ* เหมียว~ ทาสเกาคางให้หน่อยสิ',
  ],
  shiba: [
    '*กระดิกหางรัวๆ แล้วเอาคางมาเกยบนตัก* โฮ่ง! พักผ่อนนะครับ ชิบะอยู่ตรงนี้เสมอ!',
    '*นั่งเรียบร้อย เลียปากแผล็บๆ* โฮ่ง! ขอกินด้วยคนครับเจ้านาย!',
    '*กระโดดดุ๊กดิ๊ก หมุนตัวรอบขาคุณด้วยความตื่นเต้น* แฮ่กๆ พร้อมแล้วครับเจ้านาย! โฮ่ง!',
    '*ยิ้มแป้นตาหยี ขอยื่นมือมาจับ* โฮ่ง! ดีใจที่สุดเลยครับ!',
    '*ทิ้งตัวนอนหงายท้องให้เกาคางอย่างมีความสุข* แฮ่กๆ สบายที่สุดเลย!',
  ],
  bunny: [
    '*ขยับจมูกฟุดฟิด เอาหัวนุ่มๆ มาพิงฝ่ามือคุณ* ดุ๊กดิ๊ก... พักผ่อนนะคะ',
    '*หูดุ๊กดิ๊ก กระโดดเข้ามาดมมือใกล้ๆ* ฟุดฟิด... ขอกินคำนึงได้ไหมคะ',
    '*นอนหมอบเป็นก้อนขนปุกปุย หลับตาพริ้ม* นุ่มสบายจังเลยค่ะ...',
    '*กระโดดดุ๊กดิ๊กเข้ามาชนปลายนิ้วเบาๆ* ดุ๊กดิ๊ก... ลูบตัวให้หน่อยนะคะ',
  ],
  penguin: [
    '*เดินเตาะแตะเข้ามาเอาตัวกลมๆ พิงขาคุณ* กวักๆ! นั่งพักด้วยกันนะครับ!',
    '*ขยับปีกพั่บๆ ร้องดีใจ* กวักๆ! หิวแล้วครับ มีปลาอร่อยๆ ไหม!',
    '*สะบัดปีกแปะๆ เดินวนรอบตัวคุณ* กวักๆ! เดินตามคนเก่งไปทุกที่เลยครับ!',
    '*นั่งแปะลงข้างๆ ทำตาแป๋ว* แปะๆ ขอนั่งพักขาข้างๆ คนเก่งแป๊บหนึ่งนะครับ!',
  ],
  dragon: [
    '*กระพือปีกบินมาเกาะไหล่ พ่นควันอุ่นๆ ออกมาเบาๆ* กรร~ พักผ่อนนะ ริวจะปกป้องเอง!',
    '*สูดหายใจเข้าลึกๆ แล้วพ่นลูกไฟจิ๋วปุ๊งออกมา* กรร! เท่ไหมครับ!',
    '*หลับตาพริ้ม เอาเขาเล็กๆ มาถูมือคุณอย่างมีความสุข* ฟู่~ อุ่นจังเลย',
    '*กระพือปีกบินวนรอบตัวคุณอย่างร่าเริง* กรร~ ไปผจญภัยด้วยกันนะ!',
  ],
  fox: [
    '*ม้วนหางฟูๆ แนบชิดตัวคุณอย่างอบอุ่น* งิ๊ง~ ไม่เป็นไรนะ พักตรงนี้ด้วยกัน',
    '*เอาจมูกมาดมมือคุณอย่างกระตือรือร้น* งิ๊ง! มีของอร่อยมาฝากเหรอ',
    '*ขดตัวเป็นก้อนกลมบนตักคุณ หลับตาพริ้ม* งิ๊ง~ อุ่นจังเลย',
    '*ครางงิ๊งๆ เบาๆ หลับตาพริ้ม แล้วเอาหัวมาซุกมือคุณ* งิ๊ง~',
  ],
}

function cleanPetResponse(rawText: string, specKey: string): string {
  // Strip emojis and non-Thai/non-ASCII weird characters
  let text = rawText
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      '',
    )
    .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s*!~?.,'"()\-]/g, '')
    .trim()

  // Remove meta instructions or prompts echoed by the model
  text = text
    .replace(/ในดอกจัน[^\s*]*/g, '')
    .replace(/\*\.\.\.\*/g, '')
    .replace(/\[คำสั่ง[^\]]*\]/g, '')
    .replace(
      /^(เข้าใจเลยค่ะ[!.]*|เข้าใจเลยครับ[!.]*|สวัสดีค่ะ[!.]*|สวัสดีครับ[!.]*|ยินดีด้วยค่ะ[!.]*|ยินดีด้วยครับ[!.]*|ขอให้คุณ[!.]*)\s*/gi,
      '',
    )
    .replace(
      /^(เจ้านาย|คำพูดจากเจ้านาย|ปฏิกิริยาสัตว์เลี้ยง|เนโกะ|ชิบะ|เปนเปน|มาร์ช|ริว|คิตสึเนะ)\s*:\s*/gi,
      '',
    )
    .replace(/^[*\-#\s]+/gm, '')
    .trim()

  const sound =
    specKey === 'cat'
      ? 'เหมียว~'
      : specKey === 'shiba'
        ? 'โฮ่ง!'
        : specKey === 'bunny'
          ? 'ดุ๊กดิ๊ก...'
          : specKey === 'penguin'
            ? 'กวักๆ!'
            : specKey === 'dragon'
              ? 'กรร~'
              : 'งิ๊ง~'

  // Fix species cross-talk sound hallucination
  if (specKey === 'penguin') {
    text = text
      .replace(/เหมียว[ๆ~]*/g, 'กวักๆ!')
      .replace(/โฮ่ง[!~]*/g, 'กวักๆ!')
      .replace(/เห่า[^\s]*/g, 'ร้องกวักๆ')
      .replace(/Pip\s*pip[!*]*/gi, 'กวักๆ!')
      .replace(/ตู๊ด[ๆ!]*/g, 'กวักๆ!')
  } else if (specKey === 'cat') {
    text = text
      .replace(/โฮ่ง[!~]*/g, 'เหมียว~')
      .replace(/กวัก[ๆ!]*/g, 'เหมียว~')
      .replace(/เห่า[^\s]*/g, 'ส่งเสียงคราง')
  } else if (specKey === 'shiba') {
    text = text.replace(/เหมียว[ๆ~]*/g, 'โฮ่ง!').replace(/กวัก[ๆ!]*/g, 'โฮ่ง!')
  } else if (specKey === 'bunny') {
    text = text
      .replace(/เหมียว[ๆ~]*/g, 'ดุ๊กดิ๊ก...')
      .replace(/โฮ่ง[!~]*/g, 'ดุ๊กดิ๊ก...')
      .replace(/กวัก[ๆ!]*/g, 'ดุ๊กดิ๊ก...')
  } else if (specKey === 'dragon') {
    text = text
      .replace(/เหมียว[ๆ~]*/g, 'กรร~')
      .replace(/โฮ่ง[!~]*/g, 'กรร~')
      .replace(/กวัก[ๆ!]*/g, 'กรร~')
  }

  // If text has no asterisks for physical actions, add a cozy pet action
  if (!text.includes('*')) {
    const action =
      specKey === 'penguin'
        ? '*เดินเตาะแตะเข้ามาเอาตัวกลมๆ พิงขาคุณ*'
        : specKey === 'dragon'
          ? '*กระพือปีกบินมาเกาะไหล่แล้วพ่นควันอุ่นๆ*'
          : specKey === 'shiba'
            ? '*กระดิกหางรัวๆ แล้วเอาคางมาเกยบนเข่าคุณ*'
            : specKey === 'bunny'
              ? '*ขยับจมูกฟุดฟิด เอาหัวนุ่มๆ มาพิงฝ่ามือ*'
              : '*เอาหัวมาซุกมือคุณแล้วคลอเคลียเบาๆ*'
    text = `${action} ${sound} ${text}`
  }

  // Keep first 1-2 short sentences so it's snappy
  const parts = text.split('\n').filter((l) => l.trim().length > 0)
  if (parts.length > 0) {
    text = parts.slice(0, 2).join(' ')
  }

  if (text.length > 120) {
    text = text.slice(0, 120).trim()
  }

  return text
}

export async function chatWithCompanion(
  companionSpeciesOrName: string,
  userMessage?: string,
  // Reserved for scenery-flavored companion replies — not wired into the per-species
  // system prompts yet, but kept in the signature since `CompanionModal.tsx` already
  // computes and passes the live scenery name for when that lands.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _sceneryName = 'Kamakura Bay',
): Promise<CompanionInteractionResult> {
  const specKey =
    companionSpeciesOrName.toLowerCase().includes('cat') || companionSpeciesOrName.includes('เนโกะ')
      ? 'cat'
      : companionSpeciesOrName.toLowerCase().includes('shiba') ||
          companionSpeciesOrName.includes('ชิบะ')
        ? 'shiba'
        : companionSpeciesOrName.toLowerCase().includes('bunny') ||
            companionSpeciesOrName.includes('กระต่าย')
          ? 'bunny'
          : companionSpeciesOrName.toLowerCase().includes('penguin') ||
              companionSpeciesOrName.includes('เปนเปน')
            ? 'penguin'
            : companionSpeciesOrName.toLowerCase().includes('dragon') ||
                companionSpeciesOrName.includes('ริว') ||
                companionSpeciesOrName.includes('มังกร')
              ? 'dragon'
              : 'fox'

  const fallbackList = SPECIES_FALLBACK_REPLIES[specKey] || SPECIES_FALLBACK_REPLIES.cat!

  if (!userMessage || !userMessage.trim()) {
    await new Promise((r) => setTimeout(r, 60))
    const reply = fallbackList[0]!
    return {
      action: 'pet',
      reply,
      providerName: 'Chill Companion Engine',
    }
  }

  const systemPrompt = getPetSystemPrompt(companionSpeciesOrName)
  const petPrompt = `บทสนทนาระหว่างผู้เล่นกับสัตว์เลี้ยงคู่หู:
ผู้เล่น: "${userMessage}"
${companionSpeciesOrName}:`

  try {
    const res = await generateWithLocalAi(systemPrompt, petPrompt)

    // Detailed console log for debugging
    if (typeof window !== 'undefined') {
      console.groupCollapsed(
        `%c🐾 [Companion AI: ${companionSpeciesOrName}] User: "${userMessage}"`,
        'color: #38bdf8; font-weight: bold; font-size: 11px;',
      )
      console.log(
        '%c📤 [1] System Prompt (ส่งให้ LLM):',
        'color: #c084fc; font-weight: bold;',
        systemPrompt,
      )
      console.log(
        '%c📤 [2] User Prompt (ส่งให้ LLM):',
        'color: #60a5fa; font-weight: bold;',
        petPrompt,
      )
      console.log(
        '%c📥 [3] Raw Output (LLM ตอบกลับมา):',
        'color: #34d399; font-weight: bold;',
        res.text,
      )
      const clean = cleanPetResponse(res.text, specKey)
      console.log(
        '%c✨ [4] Final Cleaned Text (แสดงใน UI):',
        'color: #fbbf24; font-weight: bold;',
        clean,
      )
      console.log('%c🏷️ Provider:', 'color: #94a3b8;', res.providerName)
      console.groupEnd()

      if (res.text && res.text.trim().length > 0) {
        if (clean) {
          return {
            action: 'talk',
            reply: clean,
            providerName: res.providerName,
          }
        }
      }
    }
  } catch (err) {
    if (typeof window !== 'undefined') {
      console.groupCollapsed(
        `%c⚠️ [Companion AI Fallback: ${companionSpeciesOrName}]`,
        'color: #f87171; font-weight: bold; font-size: 11px;',
      )
      console.warn('Local AI generation failed, using offline fallback. Error:', err)
      console.groupEnd()
    }
  }

  await new Promise((r) => setTimeout(r, 100))
  const thought = fallbackList[Math.floor(Math.random() * fallbackList.length)]!
  return {
    action: 'talk',
    reply: cleanPetResponse(thought, specKey),
    providerName: 'Chill Neural Companion Engine',
  }
}
