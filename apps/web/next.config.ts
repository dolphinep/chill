import type { NextConfig } from 'next'
import { networkInterfaces } from 'node:os'

/**
 * LAN multiplayer needs the dev server reachable from other machines on the same
 * WiFi, but Next blocks cross-origin requests to dev-only resources by default (real
 * CSRF protection, not a bug) — every guest's request looks cross-origin to the dev
 * server unless the host's own LAN address is explicitly allowlisted first. Without
 * this, a guest's page just hangs on the `next/dynamic` loading fallback forever: the
 * initial HTML loads fine, but the JS chunk requests get silently blocked.
 *
 * Detected once at startup rather than hardcoded — it depends on whatever network the
 * host's machine happens to be on, which changes every time someone hosts from a
 * different WiFi. The last octet is wildcarded so any device on the same /24 (the
 * usual shape of a home or office WiFi subnet) is allowed with zero config on the
 * guest's end — see the LAN-relay's own doc comment in `scripts/lan-relay.ts` for the
 * matching "host + friends on one WiFi" design this serves.
 */
function lanDevOrigins(): string[] {
  const patterns: string[] = []
  for (const entries of Object.values(networkInterfaces())) {
    if (!entries) continue
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      patterns.push(entry.address)
      const octets = entry.address.split('.')
      if (octets.length === 4) patterns.push(`${octets[0]}.${octets[1]}.${octets[2]}.*`)
    }
  }
  return patterns
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: lanDevOrigins(),

  // Default bottom-left collides with the Comfort settings gear
  // (components/hud/ComfortSettings.tsx, also bottom-left). Dev-only UI, so moving it
  // is free — nothing in the app itself claims bottom-right except the Autoplay pill,
  // which fades out once playback starts.
  devIndicators: {
    position: 'bottom-right',
  },

  // React Compiler handles memoization, so we never hand-write useMemo/useCallback.
  reactCompiler: true,

  // `three/webgpu` and the jsm addons ship untranspiled ESM.
  transpilePackages: ['three'],

  experimental: {
    // three/webgpu is ~278KB gz and node materials tree-shake poorly. Keep it out of
    // the shared chunk so the shell stays under budget and the engine loads lazily.
    optimizePackageImports: ['lucide-react'],
  },
}

export default nextConfig
