// Run it to get a connect/send/log panel above the editor, built via x.ui
export default (x) => {
  let socket = null
  // Declared up front so the handlers can close over them; the actual controls
  // are created below in visual order (url row, message row, then the log).
  let panel
  let urlField
  let messageField
  let status

  const disconnect = () => {
    if (socket) {
      try {
        socket.close()
      } catch {}
      socket = null
    }
  }

  const connect = () => {
    disconnect() // drop any existing socket first
    status.set('connecting')
    panel.push(`connecting → ${urlField.value}`, 'sys')
    try {
      socket = new WebSocket(urlField.value)
    } catch (err) {
      status.set('error')
      panel.push(`bad URL: ${err.message}`, 'sys')
      return
    }
    socket.onopen = () => {
      status.set('open')
      panel.push('open ✅', 'sys')
    }
    socket.onmessage = (event) => {
      const data =
        typeof event.data === 'string'
          ? event.data
          : `[binary ${event.data.size ?? event.data.byteLength ?? '?'} bytes]`
      panel.push(data, 'down')
    }
    socket.onerror = () => {
      status.set('error')
      panel.push('error ❌ (see devtools Network/Console)', 'sys')
    }
    socket.onclose = (event) => {
      status.set('closed')
      panel.push(
        `closed 🔌 code=${event.code}${event.reason ? ' reason=' + event.reason : ''}`,
        'sys',
      )
    }
  }

  const send = (text) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      panel.push('not connected — hit Connect first', 'sys')
      return
    }
    socket.send(text)
    panel.push(text, 'up')
    messageField.value = ''
  }

  x.ui.row((row) => {
    urlField = row.input({
      // default to THIS ocraft's own /ws hub (same origin): ws:// on http, wss:// on https
      value: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
      placeholder: 'ws://host/path',
      onEnter: connect,
    })
    row.button('Connect', connect)
    row.button('Disconnect', disconnect)
    status = row.text('idle')
  })
  x.ui.row((row) => {
    messageField = row.input({ placeholder: 'message to send', onEnter: send })
    row.button('Send', () => send(messageField.value))
    row.button('Clear', () => panel.clear())
  })
  panel = x.ui.log({ height: '320px' })

  // Close the socket when the panel is rebuilt (re-run) or the editor unmounts.
  x.ui.onCleanup(disconnect)
}
