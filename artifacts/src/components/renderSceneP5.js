const clamp = (value) => Math.min(255, Math.max(0, value))

const applyPixelDelta = (pixels, index, delta) => {
  pixels[index]     = clamp(pixels[index]     + delta[0])
  pixels[index + 1] = clamp(pixels[index + 1] + delta[1])
  pixels[index + 2] = clamp(pixels[index + 2] + delta[2])
}

const getBaseGrainColor = (rangeColor) => {
  const t = Math.random()
  return [
    rangeColor.min[0] + t * (rangeColor.max[0] - rangeColor.min[0]),
    rangeColor.min[1] + t * (rangeColor.max[1] - rangeColor.min[1]),
    rangeColor.min[2] + t * (rangeColor.max[2] - rangeColor.min[2]),
  ]
}

const getGrainDelta = ({ baseColor, color, intensity }) => {

  if (baseColor) {
    const strength = Math.random() * intensity
    return [
      baseColor[0] * strength,
      baseColor[1] * strength,
      baseColor[2] * strength,
    ]
  }

  if (color) {
    const strength = Math.random() * intensity
    return [
      color[0] * strength,
      color[1] * strength,
      color[2] * strength,
    ]
  }

  const noise = (Math.random() - 0.5) * 2 * intensity * 255
  return [noise, noise, noise]
}

const applyGrain = (s, props) => {
  const { rangeColor, intensity, color, amount = 1, grainSize = 10 } = props ?? {}

  const baseColor = rangeColor ? getBaseGrainColor(rangeColor) : null
  
  s.loadPixels()

  const d = s.pixelDensity()
  const width = s.width * d
  const height = s.height * d

  for (let y = 0; y < height; y += grainSize) {
    for (let x = 0; x < width; x += grainSize) {
      if (Math.random() > amount) continue

      const delta = getGrainDelta({ baseColor, intensity, color })

      for (let yy = 0; yy < grainSize && y + yy < height; yy++) {
        for (let xx = 0; xx < grainSize && x + xx < width; xx++) {
          const px = x + xx
          const py = y + yy
          const i = (py * width + px) * 4

          applyPixelDelta(s.pixels, i, delta)
        }
      }
    }
  }



  s.updatePixels()
}

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

      // if (kind === 'rect') {
      //   s.noStroke()
      //   s.fill(fill)
      //   s.rect(x, y, width, height)
      // }
    }
  }

  s.pop()

  for (const effect of visual.effects ?? []) {
    if (effect.type === 'grain') {
      applyGrain(s, effect.props)
    }
  }
}