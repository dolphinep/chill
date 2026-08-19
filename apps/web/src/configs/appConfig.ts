import { z } from 'zod'
import { rawEnv } from '@/lib/env'

/**
 * Validated at module load, so a missing or malformed variable fails immediately
 * with the key name rather than surfacing as `undefined` three layers deep.
 */
const schema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),

  /** Bypasses auth and starts MSW. Never ship true against real user data. */
  demoMode: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  /** Unset in v0.1 — the engine falls back to LoopbackRoomClient with an offline badge. */
  realtimeUrl: z.string().url().optional(),

  defaultSceneryId: z.string().default('kamakura-bay'),
})

export const appConfig = schema.parse({
  nodeEnv: rawEnv.NODE_ENV,
  demoMode: rawEnv.NEXT_PUBLIC_DEMO_MODE,
  realtimeUrl: rawEnv.NEXT_PUBLIC_REALTIME_URL,
  defaultSceneryId: rawEnv.NEXT_PUBLIC_DEFAULT_SCENERY,
})

export type AppConfig = typeof appConfig
