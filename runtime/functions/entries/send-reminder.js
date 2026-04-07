export const run = async (ctx) => {

  const token = ctx.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set')
  }

  const [reminderText] = ctx.args

  ctx.log(`sending reminder: ${reminderText}`)
  ctx.log(`token: ${token}`)
}