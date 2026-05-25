import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendMessage(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.description ?? 'Telegram error');
  return json.result;
}

const server = new McpServer({ name: 'telegram', version: '1.0.0' });

server.tool(
  'telegram_send',
  'Send a Telegram message to a chat',
  {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Message text (HTML supported)' },
      chat_id: { type: 'string', description: 'Target chat ID (defaults to TELEGRAM_CHAT_ID env var)' },
    },
    required: ['text'],
  },
  async ({ text, chat_id }) => {
    const target = chat_id ?? DEFAULT_CHAT_ID;
    if (!BOT_TOKEN) return { content: [{ type: 'text', text: 'Error: TELEGRAM_BOT_TOKEN not set' }] };
    if (!target) return { content: [{ type: 'text', text: 'Error: no chat_id provided and TELEGRAM_CHAT_ID not set' }] };

    try {
      const msg = await sendMessage(target, text);
      return { content: [{ type: 'text', text: `Sent (message_id: ${msg.message_id})` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
