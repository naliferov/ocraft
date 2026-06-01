export const renderScene = (ctx, { width, height, dpr }, visual) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width * dpr, height * dpr)

  const vw = visual.viewport.width
  const vh = visual.viewport.height

  const scale = Math.min(width / vw, height / vh)
  const offsetX = (width - vw * scale) / 2
  const offsetY = (height - vh * scale) / 2

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY)

  for (const node of visual.nodes ?? []) {
    if (node.type === 'background' && node.props.fill) {
      ctx.fillStyle = node.props.fill
      ctx.fillRect(0, 0, vw, vh)
    }

    if (node.type === 'shape') {
      const { kind = 'rect', x = 0, y = 0, width = 10, height = 10, fill = 'white' } = node.props ?? {}
      if (kind === 'rect') {
        ctx.fillStyle = fill
        ctx.fillRect(x, y, width, height)
      }
    }
  }
}
