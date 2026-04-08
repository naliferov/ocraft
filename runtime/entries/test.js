export const run = async (ctx) => {
  const [arg1] = ctx.args

  ctx.log(`run test entry with arg: ${arg1}`)
}