/**
 * The ONLY module allowed to touch `process.env`. Everything else reads the
 * validated `appConfig`. Next inlines `NEXT_PUBLIC_*` at build time, so they must
 * be referenced as full static property accesses — `process.env[key]` does not work.
 */

export const rawEnv = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL,
  NEXT_PUBLIC_DEFAULT_SCENERY: process.env.NEXT_PUBLIC_DEFAULT_SCENERY,
} as const
