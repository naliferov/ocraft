// wsServer.js — the local WebSocket EXCHANGE on /ws.
//
// A dumb meeting point, NOT a feed of server state. It does not know or care about the
// node store; it only:
//   - gives each client a unique funny name on connect (its address for direct messages),
//   - tells everyone when a client joins or leaves,
//   - routes a direct message from one client to another by name.
//
// Same origin as /api, gated by the same session auth, attached to the existing
// http.Server via its 'upgrade' event (no separate port, no second deploy).
//
// Protocol (JSON text frames):
//   server → you  (on connect): { type: 'welcome', name, clients: [names] }
//   server → others:            { type: 'join', name }
//                               { type: 'leave', name }
//   you → server:               { type: 'message', to, data }   DM another client by name
//                               { type: 'ping' }                → { type: 'pong' }
//   server → recipient:         { type: 'message', from, data }
//   server → you (bad target):  { type: 'error', error: 'no such client', to }
import type { Server, IncomingMessage } from 'node:http'
import { WebSocketServer } from 'ws'
import { uniqueName } from './lib/nameGenerator.ts'

const HEARTBEAT_MS = 30_000

// name -> socket. Each socket also carries `name` and `isAlive`.
const clients = new Map()

const send = (socket, message) => {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

// Tell every client except `selfName` (used for join/leave presence).
const announce = (selfName, message) => {
  for (const [name, socket] of clients) {
    if (name !== selfName) {
      send(socket, message)
    }
  }
}

const handleMessage = (socket, raw) => {
  let message
  try {
    message = JSON.parse(raw)
  } catch {
    return // the exchange ignores non-JSON frames
  }
  if (message.type === 'ping') {
    send(socket, { type: 'pong' })
    return
  }
  if (message.type === 'message') {
    const target = clients.get(message.to)
    if (!target) {
      send(socket, { type: 'error', error: 'no such client', to: message.to })
      return
    }
    send(target, { type: 'message', from: socket.name, data: message.data })
    return
  }
  send(socket, { type: 'error', error: 'unknown type', received: message.type })
}

// Attach the exchange to an existing http.Server. Upgrades on /api/ws (canonical — one proxied
// prefix with the rest of the API; /ws still accepted for old script-node bodies that hardcode
// it), behind the same auth as /api (resolveUser reads the session cookie off the upgrade
// request; null = reject).
export const attachWsServer = (
  server: Server,
  { resolveUser }: { resolveUser: (req: IncomingMessage) => Promise<string | undefined> },
) => {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', async (req, socket, head) => {
    const path = req.url.split('?')[0]
    if (path !== '/api/ws') {
      socket.destroy() // not our endpoint, and there's no other upgrade handler — drop it
      return
    }
    if (!(await resolveUser(req))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  wss.on('connection', (ws: any) => {
    // ws gets ad-hoc fields (name, isAlive) tracked per socket
    const name = uniqueName((candidate) => clients.has(candidate))
    ws.name = name
    ws.isAlive = true
    // Welcome the newcomer with its name + who's already here, then announce it to the rest.
    send(ws, { type: 'welcome', name, clients: [...clients.keys()] })
    announce(name, { type: 'join', name })
    clients.set(name, ws)

    // Remove on disconnect and tell the others. Guarded so close+error don't double-fire.
    const drop = () => {
      if (clients.delete(ws.name)) {
        announce(ws.name, { type: 'leave', name: ws.name })
      }
    }

    ws.on('pong', () => {
      ws.isAlive = true
    })
    ws.on('message', (raw) => handleMessage(ws, raw))
    ws.on('close', drop)
    ws.on('error', drop) // a single socket erroring must not sink the exchange
  })

  // Heartbeat: drop sockets that stop answering pings (half-open) so `clients` doesn't leak.
  const heartbeat = setInterval(() => {
    for (const [name, ws] of clients) {
      if (!ws.isAlive) {
        ws.terminate()
        if (clients.delete(name)) {
          announce(name, { type: 'leave', name })
        }
        continue
      }
      ws.isAlive = false
      ws.ping()
    }
  }, HEARTBEAT_MS)
  heartbeat.unref?.() // never keep the process alive just for the heartbeat

  return wss
}
