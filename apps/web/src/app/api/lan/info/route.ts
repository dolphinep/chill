import { networkInterfaces } from 'node:os'
import { LAN_RELAY_PORT } from '@chill/protocol'

/**
 * The host's own LAN address(es), for the "share this with your friends" banner in
 * `ComfortSettings.tsx`. Server-side only — `os.networkInterfaces()` doesn't exist in
 * the browser, and this is exactly the one piece of LAN-hosting info that needs it.
 *
 * Always fresh, never statically generated: a laptop's LAN IP can change between
 * requests (switching WiFi networks, DHCP renewal), and this endpoint only matters
 * while the host is actively deciding what to share.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const addresses: string[] = []
  const interfaces = networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue
    for (const entry of entries) {
      // IPv4, not loopback, not a virtual/internal adapter — what an actual guest on
      // the same WiFi could reach.
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address)
    }
  }

  return Response.json({
    addresses,
    port: 3100,
    relayPort: LAN_RELAY_PORT,
  })
}
