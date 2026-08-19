import http from 'node:http'
import next from 'next'
import { WebSocketServer } from 'ws'
import { attachLanRelay } from './lan-relay'

const port = parseInt(process.env.PORT || '8080', 10)
const dev = process.env.NODE_ENV !== 'production'

const app = next({ dev, dir: 'apps/web' })
const handle = app.getRequestHandler()

process.on('unhandledRejection', (reason, promise) => {
  console.error('[server] unhandledRejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err)
})

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    // Health check endpoint for Cloud Run / load balancer
    if (req.url === '/api/health' || req.url === '/_health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', time: Date.now() }))
      return
    }
    handle(req, res)
  })

  // Attach WebSocket Relay to the exact same HTTP server
  const wss = new WebSocketServer({ noServer: true })
  attachLanRelay(wss)

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', (err) => {
      console.error('[ws] client socket error before upgrade:', err)
    })

    const host = req.headers.host || 'localhost'
    const pathname = req.url ? new URL(req.url, `http://${host}`).pathname : '/'

    // If it's a Next.js internal HMR request in dev mode, let it pass or skip
    if (pathname.startsWith('/_next/webpack-hmr')) {
      return
    }

    try {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } catch (err) {
      console.error('[ws] handleUpgrade failed:', err)
      socket.destroy()
    }
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`[chill] Unified Web & Multiplayer server listening on http://0.0.0.0:${port}`)
  })
})
