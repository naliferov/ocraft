import { sendTelegramMessage } from '../api/telegram.js'

export const run = async (ctx) => {
  const token = ctx.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set')

  const [text] = ctx.args
  if (!text) throw new Error('text arg is required')

  await sendTelegramMessage({ token, chatId: 358086473, text })
  ctx.log(`sent: ${text}`)
}
