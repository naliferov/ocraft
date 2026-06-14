// ws-exchange-test — smoke-test the cloud WebSocket exchange (stream.x8.deno.net).
//
//   node cli.js run ws-exchange-test [url] [probeText]
//
// SUCCESS = the socket opens (the exchange is reachable). It also sends one probe
// and reports whether any reply came back, but a missing reply is NOT a failure:
// the relay is not an echo server (it has a real protocol — likely pub/sub, which
// only fans messages out to *other* subscribers), so a protocol-blind probe gets
// silence. The reply field is a diagnostic, not the gate.
//
// It ALWAYS terminates: resolves once it knows whether it opened (on reply, on the
// post-open wait elapsing, or on error/close) and closes the socket. One-shot
// connectivity check; a long-lived subscriber belongs in a proc.
//
// Once the relay's source is vendored into the repo, turn the probe into a real
// protocol exchange (subscribe to a topic, publish, assert the fan-out) and gate on
// that. Uses Node's built-in global WebSocket (Node 22+) — no `ws` dependency.

const DEFAULT_URL = 'wss://stream.x8.deno.net/ws'
const CONNECT_TIMEOUT_MS = 8000 // fail if the socket never opens
const REPLY_WAIT_MS = 3000      // after open, how long to listen for a reply

export const run = async (ctx) => {
  const url = ctx.args[0] || DEFAULT_URL
  const probe = ctx.args[1] || `ocraft-ping-${Date.now()}`

  ctx.log(`connecting → ${url}`)
  const startedAt = Date.now()

  const outcome = await new Promise((resolve) => {
    let settled = false
    let opened = false
    let socket
    let connectTimer
    let replyTimer
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(connectTimer)
      clearTimeout(replyTimer)
      try { socket?.close() } catch { /* already closing */ }
      resolve(result)
    }
    connectTimer = setTimeout(
      () => finish({ ok: false, opened: false, reason: `never opened (timeout ${CONNECT_TIMEOUT_MS}ms)` }),
      CONNECT_TIMEOUT_MS
    )

    try {
      socket = new WebSocket(url)
    } catch (error) {
      finish({ ok: false, opened: false, reason: `bad url: ${error.message}` })
      return
    }

    socket.addEventListener('open', () => {
      opened = true
      const openMs = Date.now() - startedAt
      ctx.log(`open ✅ (${openMs}ms) — reachable; sending probe: ${probe}`)
      try {
        socket.send(probe)
      } catch (error) {
        ctx.log(`send failed: ${error.message}`)
      }
      // Connected = success regardless of reply; wait briefly for one as a bonus.
      clearTimeout(connectTimer)
      replyTimer = setTimeout(
        () => finish({ ok: true, opened: true, replied: false, openMs, note: 'connected; no reply (relay is not an echo server)' }),
        REPLY_WAIT_MS
      )
    })
    socket.addEventListener('message', (event) => {
      const data = typeof event.data === 'string'
        ? event.data
        : `[binary ${event.data?.byteLength ?? '?'} bytes]`
      ctx.log(`reply ⬇ ${data}`)
      finish({ ok: true, opened: true, replied: true, rttMs: Date.now() - startedAt, reply: data })
    })
    // The error event carries no detail (WHATWG WebSocket); close follows with the code.
    socket.addEventListener('error', () => ctx.log('error ❌ (see close code)'))
    socket.addEventListener('close', (event) => {
      const where = opened ? 'after open' : 'before open'
      finish({ ok: opened, opened, reason: `closed ${where} (code=${event.code}${event.reason ? ' ' + event.reason : ''})` })
    })
  })

  ctx.log(outcome.ok
    ? `reachable ✅ (replied=${outcome.replied ?? false})`
    : `unreachable ❌ — ${outcome.reason}`)

  const state = await ctx.state.load()
  state.lastCheck = { at: ctx.time.now(), url, ...outcome }
  await ctx.state.save(state)

  return outcome
}
