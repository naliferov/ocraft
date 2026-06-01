export const run = async (ctx) => {
  const [arg1] = ctx.args

  const state = await ctx.state.load()
  state.test = state.test ?? 0
  state.test++
  await ctx.state.save(state)

  ctx.log('state of test entry: ', state)
  ctx.log(`run test entry with arg: ${arg1}`)
}