import { WebSocketServer, WebSocket } from 'ws'
import {
  LAN_RELAY_PORT,
  LAN_HEARTBEAT_PING_MS,
  SNAPSHOT_HZ,
  THOUGHT_MAX_GRAPHEMES,
  TARGET_COUNT,
  type LanClientMessage,
  type LanServerMessage,
  type LanRosterEntry,
  type LanAvatarSnapshotEntry,
  type Sid,
  type PlacedPropPayload,
} from '@chill/protocol'

/**
 * Multi-room LAN relay: in-memory WebSocket server supporting multiple isolated rooms.
 * Each room has its own state (scenery, players, snapshots, props, volleyball mini-game).
 * No database, no auth. Broadcasts are strictly scoped per room.
 */

type Client = {
  ws: WebSocket
  sid: Sid
  name: string
  avatarConfig: Record<string, string>
  roomKey: string
  last: {
    x: number
    y: number
    z: number
    yaw: number
    anim: LanAvatarSnapshotEntry['anim']
    flags: number
  }
  isHost: boolean
  isAlive: boolean
}

type RoomState = {
  key: string
  name: string
  sceneryId: string
  currentTimeOfDay: number
  hostSid: Sid | null
  hostGraceTimer: ReturnType<typeof setTimeout> | null
  clients: Map<Sid, Client>
  targetStates: boolean[]
  roomProps: PlacedPropPayload[]
  snapshotSeq: number
  nextThoughtId: number
}

const rooms = new Map<string, RoomState>()
let nextSid = 1
const HOST_GRACE_MS = 120_000

function getOrCreateRoom(rawName?: string, sceneryId = 'frostholm-ridge'): RoomState {
  const name = rawName?.trim() || 'Default Room'
  const key = name.toLowerCase()

  let room = rooms.get(key)
  if (!room) {
    room = {
      key,
      name,
      sceneryId,
      currentTimeOfDay: 0.5,
      hostSid: null,
      hostGraceTimer: null,
      clients: new Map(),
      targetStates: new Array(TARGET_COUNT).fill(false),
      roomProps: [],
      snapshotSeq: 0,
      nextThoughtId: 1,
    }
    rooms.set(key, room)
    console.log(`[lan-relay] created room "${name}" (key="${key}")`)
  }
  return room
}

function send(ws: WebSocket, msg: LanServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

function broadcastToRoom(room: RoomState, msg: LanServerMessage, excludeSid?: Sid): void {
  const payload = JSON.stringify(msg)
  for (const client of room.clients.values()) {
    if (client.sid === excludeSid) continue
    if (client.ws.readyState === WebSocket.OPEN) client.ws.send(payload)
  }
}

export function attachLanRelay(wss: WebSocketServer): WebSocketServer {
  wss.on('connection', (ws) => {
    let clientSid: Sid | null = null
    let currentRoom: RoomState | null = null
    let isAliveRef: Client | null = null

    ws.on('pong', () => {
      if (isAliveRef) isAliveRef.isAlive = true
    })

    ws.on('message', (data) => {
      if (isAliveRef) isAliveRef.isAlive = true

      let msg: LanClientMessage & { sceneryId?: string }
      try {
        msg = JSON.parse(data.toString()) as LanClientMessage & { sceneryId?: string }
      } catch {
        return
      }

      if (msg.t === 'join') {
        if (clientSid !== null) return // already joined on this socket

        const room = getOrCreateRoom(msg.roomName, msg.sceneryId || 'frostholm-ridge')
        currentRoom = room

        // Anti-ghost: If a client with the same name already exists in this room (e.g. from previous tab/refresh),
        // cleanly evict the old connection immediately before adding the new one
        for (const [existingSid, existingClient] of room.clients.entries()) {
          if (existingClient.name === msg.name) {
            console.log(
              `[lan-relay] evicting ghost connection sid=${existingSid} name="${msg.name}" in room="${room.name}"`,
            )
            room.clients.delete(existingSid)
            broadcastToRoom(room, { t: 'leave', sid: existingSid })
            try {
              existingClient.ws.close(1000, 'Reconnected from fresh tab')
            } catch {}
          }
        }

        const sid = nextSid++
        clientSid = sid
        const isHost = room.hostSid === null || room.clients.size === 0
        if (isHost) {
          room.hostSid = sid
          if (room.hostGraceTimer) {
            clearTimeout(room.hostGraceTimer)
            room.hostGraceTimer = null
          }
          if (msg.sceneryId) {
            room.sceneryId = msg.sceneryId
          }
        }

        const client: Client = {
          ws,
          sid,
          name: msg.name,
          avatarConfig: msg.avatarConfig,
          roomKey: room.key,
          last: { x: 0, y: 0, z: 0, yaw: 0, anim: 'idle', flags: 0 },
          isHost,
          isAlive: true,
        }
        room.clients.set(sid, client)
        isAliveRef = client

        const roster: LanRosterEntry[] = [...room.clients.values()]
          .filter((c) => c.sid !== sid)
          .map((c) => ({ sid: c.sid, name: c.name, avatarConfig: c.avatarConfig }))
        const avatars: LanAvatarSnapshotEntry[] = [...room.clients.values()]
          .filter((c) => c.sid !== sid)
          .map((c) => ({ sid: c.sid, ...c.last }))

        send(ws, {
          t: 'welcome',
          sid,
          sceneryId: room.sceneryId,
          timeOfDay: room.currentTimeOfDay,
          roomName: room.name,
          roster,
          avatars,
          targetStates: room.targetStates,
          props: room.roomProps,
        })

        broadcastToRoom(
          room,
          {
            t: 'roster',
            sid,
            name: msg.name,
            avatarConfig: msg.avatarConfig,
          },
          sid,
        )
        return
      }

      if (clientSid === null || !currentRoom) return

      const client = currentRoom.clients.get(clientSid)
      if (!client) return

      switch (msg.t) {
        case 'input':
          client.last = {
            x: msg.x,
            y: msg.y,
            z: msg.z,
            yaw: msg.yaw,
            anim: msg.anim,
            flags: msg.flags,
          }
          break
        case 'thought':
          broadcastToRoom(currentRoom, {
            t: 'thought',
            sid: client.sid,
            id: currentRoom.nextThoughtId++,
            text: msg.text.slice(0, THOUGHT_MAX_GRAPHEMES),
            sentAtEpochS: Math.floor(Date.now() / 1000),
          })
          break
        case 'throw':
          broadcastToRoom(
            currentRoom,
            {
              t: 'throw',
              sid: client.sid,
              x: msg.x,
              y: msg.y,
              z: msg.z,
              dirX: msg.dirX,
              dirY: msg.dirY,
              dirZ: msg.dirZ,
              kind: msg.kind,
            },
            client.sid,
          )
          break
        case 'scenery':
          if (!client.isHost) break
          currentRoom.sceneryId = msg.sceneryId
          currentRoom.targetStates = new Array(TARGET_COUNT).fill(false)
          broadcastToRoom(currentRoom, { t: 'scenery', sceneryId: currentRoom.sceneryId })
          console.log(
            `[lan-relay] room "${currentRoom.name}" scenery switched to ${currentRoom.sceneryId}`,
          )
          break
        case 'timeOfDay':
          currentRoom.currentTimeOfDay = msg.progress
          broadcastToRoom(currentRoom, { t: 'timeOfDay', progress: currentRoom.currentTimeOfDay })
          break
        case 'targetHit':
          if (msg.targetId < 0 || msg.targetId >= TARGET_COUNT) break
          currentRoom.targetStates[msg.targetId] = true
          broadcastToRoom(currentRoom, { t: 'targetHit', sid: client.sid, targetId: msg.targetId })
          break
        case 'targetsReset':
          if (!client.isHost) break
          currentRoom.targetStates = new Array(TARGET_COUNT).fill(false)
          broadcastToRoom(currentRoom, { t: 'targetsReset' })
          break
        case 'placeProp': {
          const prop = msg.prop
          currentRoom.roomProps.push(prop)
          if (currentRoom.roomProps.length > 40) currentRoom.roomProps.shift()
          broadcastToRoom(currentRoom, { t: 'placeProp', prop })
          break
        }
        case 'updatePropText': {
          const prop = currentRoom.roomProps.find((p) => p.id === msg.propId)
          if (prop) {
            prop.text = msg.text
            if (msg.authorName !== undefined) prop.authorName = msg.authorName
          }
          broadcastToRoom(currentRoom, {
            t: 'updatePropText',
            propId: msg.propId,
            text: msg.text,
            authorName: msg.authorName,
          })
          break
        }
        case 'interactProp': {
          if (msg.action === 'toggle') {
            const prop = currentRoom.roomProps.find((p) => p.id === msg.propId)
            if (prop) {
              prop.active = msg.active !== undefined ? msg.active : !prop.active
            }
          }
          broadcastToRoom(currentRoom, {
            t: 'interactProp',
            propId: msg.propId,
            action: msg.action,
            active: msg.active,
          })
          break
        }
        case 'updateAvatar':
          client.avatarConfig = msg.avatarConfig
          broadcastToRoom(currentRoom, {
            t: 'roster',
            sid: client.sid,
            name: client.name,
            avatarConfig: client.avatarConfig,
          })
          break
        case 'volleyball':
          broadcastToRoom(currentRoom, {
            t: 'volleyball',
            payload: msg.payload,
          })
          break
        case 'skeet':
          broadcastToRoom(currentRoom, {
            t: 'skeet',
            payload: msg.payload,
          })
          break
      }
    })

    ws.on('close', () => {
      if (clientSid === null || !currentRoom) return
      const client = currentRoom.clients.get(clientSid)
      currentRoom.clients.delete(clientSid)
      broadcastToRoom(currentRoom, { t: 'leave', sid: clientSid })

      if (client?.isHost) {
        currentRoom.hostSid = null
        if (currentRoom.hostGraceTimer) clearTimeout(currentRoom.hostGraceTimer)
        currentRoom.hostGraceTimer = setTimeout(() => {
          if (!currentRoom || currentRoom.hostSid !== null) return
          if (currentRoom.clients.size > 0) {
            const firstRemaining = currentRoom.clients.values().next().value as Client | undefined
            if (firstRemaining) {
              currentRoom.hostSid = firstRemaining.sid
              firstRemaining.isHost = true
              console.log(
                `[lan-relay] promoted sid=${firstRemaining.sid} to host in room="${currentRoom.name}"`,
              )
            }
          }
        }, HOST_GRACE_MS)
      }

      if (currentRoom.clients.size === 0) {
        setTimeout(() => {
          if (currentRoom && currentRoom.clients.size === 0) {
            rooms.delete(currentRoom.key)
            console.log(`[lan-relay] cleaned up inactive room "${currentRoom.name}"`)
          }
        }, 30_000)
      }
    })
  })

  // Heartbeat ping across all rooms
  setInterval(() => {
    for (const room of rooms.values()) {
      for (const client of room.clients.values()) {
        if (!client.isAlive) {
          client.ws.terminate()
          continue
        }
        client.isAlive = false
        try {
          client.ws.ping()
        } catch {}
      }
    }
  }, LAN_HEARTBEAT_PING_MS)

  // Merged snapshot broadcast at SNAPSHOT_HZ per room
  setInterval(() => {
    for (const room of rooms.values()) {
      if (room.clients.size === 0) continue
      const avatars: LanAvatarSnapshotEntry[] = [...room.clients.values()].map((c) => ({
        sid: c.sid,
        ...c.last,
      }))
      broadcastToRoom(room, { t: 'snapshot', seq: room.snapshotSeq++, avatars })
    }
  }, 1000 / SNAPSHOT_HZ)

  return wss
}

// Standalone execution entrypoint
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('lan-relay.ts') || process.argv[1].endsWith('lan-relay.js'))

if (isMain) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : LAN_RELAY_PORT
  const wss = new WebSocketServer({ port })
  attachLanRelay(wss)
  console.log(`[lan-relay] listening on ws://0.0.0.0:${port}`)
  console.log('[lan-relay] multi-room enabled; clients are isolated by room name')
}
