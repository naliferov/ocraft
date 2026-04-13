export const renderSceneP5 = (s, { width, height }, visual) => {  
  s.clear()

  const vw = visual.viewport.width
  const vh = visual.viewport.height

  const scale = Math.min(width / vw, height / vh)
  const offsetX = (width - vw * scale) / 2
  const offsetY = (height - vh * scale) / 2

  s.push()
  s.translate(offsetX, offsetY)
  s.scale(scale)

  for (const node of visual.nodes ?? []) {
    if (node.type === 'background' && node.props.fill) {
      s.noStroke()
      s.fill(node.props.fill)
      s.rect(0, 0, vw, vh)
    }

    if (node.type === 'shape') {
      const {
        kind = 'rect',
        x = 0,
        y = 0,
        width = 10,
        height = 10,
        fill = 'white'
      } = node.props ?? {}

      if (kind === 'rect') {
        s.noStroke()
        s.fill(fill)
        s.rect(x, y, width, height)
      }
    }
  }



  s.pop()

  for (const effect of visual.effects ?? []) {
    if (effect.type === 'grain') {
      const { intensity = 0.05 } = effect.props ?? {}
      
      s.loadPixels()
      for (let i = 0; i < s.pixels.length; i += 4) {
        const noise = (Math.random() - 0.5) * 2 * intensity * 255

        s.pixels[i]     = Math.min(255, Math.max(0, s.pixels[i]     + noise))
        s.pixels[i + 1] = Math.min(255, Math.max(0, s.pixels[i + 1] + noise))
        s.pixels[i + 2] = Math.min(255, Math.max(0, s.pixels[i + 2] + noise))
      }
      s.updatePixels()
    }
  }
}