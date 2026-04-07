export const run = async (ctx) => {
  const token = ctx.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set')

  const [reminderText] = ctx.args
  const api = `https://api.telegram.org/bot${token}`

  //const updatesRes = await fetch(`${api}/getUpdates`)
  //const { result: updates } = await updatesRes.json()

  await fetch(`${api}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: 358086473, text: reminderText }),
  })
  ctx.log(`sent to 358086473`)
}