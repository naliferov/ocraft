// ws-test — smoke-test the local WebSocket hub (runtime/wsServer.js, /ws on the api server).
//
//   node runtime/cli.js run ws-test [url]
//
// Connects with the API_TOKEN bearer (the hub is auth-gated, same as /api), expects the
// `welcome` frame, then does a ping → pong round-trip and gates on the pong. Always
// terminates (resolves on pong, on error/close, or on timeout) and closes the socket.
//
// Uses the `ws` package — a real client that CAN send the Authorization header (the global
// WHATWG WebSocket can't), so it works against the gated hub, not just an open dev server.
import { WebSocket } from 'ws'

const PORT = process.env.PORT || 3001
const DEFAULT_URL = `ws://127.0.0.1:${PORT}/ws`
const TIMEOUT_MS = 8000

export const run = async (ctx) => {
  const url = ctx.args[0] || DEFAULT_URL
  const token = process.env.API_TOKEN || ''
  ctx.log(`connecting → ${url}`)
  const startedAt = Date.now()

  const outcome = await new Promise((resolve) => {
    let settled = false
    let welcomed = false
    const socket = new WebSocket(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })

    const finish = (result) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        /* already closing */
      }
      resolve(result)
    }
    const timer = setTimeout(
      () => finish({ ok: false, reason: `timeout ${TIMEOUT_MS}ms (no pong)` }),
      TIMEOUT_MS,
    )

    socket.on('open', () => {
      ctx.log(`open ✅ (${Date.now() - startedAt}ms) — sending ping`)
      socket.send(JSON.stringify({ type: 'ping' }))
    })
    socket.on('message', (raw) => {
      let message
      try {
        message = JSON.parse(raw)
      } catch {
        return
      }
      if (message.type === 'welcome') {
        welcomed = true
        ctx.log(`welcome ⬇ (${message.clients} client(s) on the hub)`)
      } else if (message.type === 'pong') {
        ctx.log('pong ⬇ — round-trip ok')
        finish({ ok: true, welcomed, rttMs: Date.now() - startedAt })
      }
    })
    socket.on('error', (error) => finish({ ok: false, reason: error.message }))
    socket.on('close', (code) => {
      // Closed before pong — a 401 here means the bearer was missing/wrong.
      finish({ ok: false, reason: `closed (code=${code})${token ? '' : ' — no API_TOKEN set'}` })
    })
  })

  ctx.log(
    outcome.ok ? `hub reachable ✅ (rtt ${outcome.rttMs}ms)` : `unreachable ❌ — ${outcome.reason}`,
  )

  const state = await ctx.state.load()
  state.lastCheck = { at: ctx.time.now(), url, ...outcome }
  await ctx.state.save(state)

  return outcome
}
