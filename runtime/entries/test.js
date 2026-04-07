export const run = async (ctx) => {
  const [projectPath] = ctx.args

  ctx.log(`run test entry: ${projectPath}`)
}