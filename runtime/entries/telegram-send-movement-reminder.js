import { sendTelegramMessage } from '../api/telegram.js'

export const run = async (ctx) => {
  const token = ctx.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set')

  const text = 'Walking reminder'

  await sendTelegramMessage({ token, chatId: 358086473, text })
  ctx.log(`sent to 358086473`)
}
