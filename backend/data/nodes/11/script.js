export default (x) => {
  const ws = new WebSocket('wss://stream.x8.deno.net/ws')
  ws.onopen = () => { 
    x.log('open ws connection ✅');
    ws.send('hello from 3th tab');
  }

  ws.onmessage = (e) => x.log('recv ⬇️ ' + e.data)
  ws.onerror = () => x.log('error ❌ (see devtools Network → WS)')
  ws.onclose = (e) => x.log(`closed 🔌 code=${e.code}${e.reason ? ' reason=' + e.reason : ''}`)

  return ws;
}
