export async function sendTelegramMessage({ token, chatId, text }) {
  const api = `https://api.telegram.org/bot${token}`

  const res = await fetch(`${api}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })

  const data = await res.json()

  if (!data.ok) {
    throw new Error(data.description || 'Telegram sendMessage failed')
  }

  return data.result
}
