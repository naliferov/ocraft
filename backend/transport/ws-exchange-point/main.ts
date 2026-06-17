import { Hono } from "hono";

const app = new Hono();

const sockets = new Set<WebSocket>();

function broadcast(data: string, except?: WebSocket) {


  for (const ws of sockets) {
    if (ws === except) {
      continue;
    }
    console.log('ws.send', data)
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

app.get("/", (c) => {
  return c.text("Hello Deno!");
  });

app.get("/ws", (c) => {
  if (c.req.header("upgrade") !== "websocket") {
    return c.text("expected websocket", 426);
  }

  const { socket, response } = Deno.upgradeWebSocket(c.req.raw);

  socket.onopen = () => {
    sockets.add(socket);
    console.log(`+ connected (${sockets.size} total)`);
    broadcast(JSON.stringify({ type: "system", text: `a user joined — ${sockets.size} online` }), socket);
  };
  socket.onclose = () => {
    sockets.delete(socket);
    console.log(`- disconnected (${sockets.size} total)`);
    broadcast(JSON.stringify({ type: "system", text: `a user left — ${sockets.size} online` }), socket);
  };
  socket.onerror = (err) => console.error("ws error:", err);
   socket.onmessage = (e) => {
    const text = typeof e.data === "string" ? e.data : "";
    broadcast(JSON.stringify({ type: "msg", text }), socket);
  };

  return response;
});

//setInterval(() => console.log('interval tick'), 5000)

Deno.serve(app.fetch);