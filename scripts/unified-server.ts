import http from 'node:http'
import next from 'next'
import { WebSocketServer } from 'ws'
import { attachLanRelay } from './lan-relay'

const port = parseInt(process.env.PORT || '8080', 10)
const dev = process.env.NODE_ENV !== 'production'

const app = next({ dev, dir: 'apps/web' })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    handle(req, res)
  })

  // Attach WebSocket Relay to the exact same HTTP server
  const wss = new WebSocketServer({ noServer: true })
  attachLanRelay(wss)

  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`[chill] Unified Web & Multiplayer server listening on http://0.0.0.0:${port}`)
  })
})
