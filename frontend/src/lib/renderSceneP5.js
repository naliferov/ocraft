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
  const clampedAmount = Math.min(1, Math.max(0, amount))
  if (clampedAmount <= 0) return

  const baseColor = rangeColor ? getBaseGrainColor(rangeColor) : null

  s.loadPixels()

  const d = s.pixelDensity()
  const width = s.width * d
  const height = s.height * d
  const buf = s.pixels

  // The image is tiled into grid-aligned grainSize×grainSize cells; a tinted cell
  // gets one delta applied to its whole block.
  const cols = Math.ceil(width / grainSize)
  const rows = Math.ceil(height / grainSize)

  const fillBlock = (cx, cy) => {
    const x0 = cx * grainSize
    const y0 = cy * grainSize
    const delta = getGrainDelta({ baseColor, intensity, color })
    for (let yy = 0; yy < grainSize && y0 + yy < height; yy++) {
      for (let xx = 0; xx < grainSize && x0 + xx < width; xx++) {
        applyPixelDelta(buf, ((y0 + yy) * width + (x0 + xx)) * 4, delta)
      }
    }
  }

  if (clampedAmount < 0.5) {
    // Sparse grain: scatter the *expected* number of cells directly, instead of
    // rejection-testing every one of cols*rows cells. This is the big win — at
    // grainSize 1 the old path ran Math.random() over every pixel just to keep a
    // few percent. ~1/amount fewer iterations; visually identical.
    // Stochastic rounding: round up by the fractional part with that probability,
    // so the *average* count is exact (no hard 0→1 cliff at tiny amounts) and it
    // varies frame-to-frame — sparse crackle fades in smoothly and flickers.
    const exact = cols * rows * clampedAmount
    const count = Math.floor(exact) + (Math.random() < (exact % 1) ? 1 : 0)
    for (let k = 0; k < count; k++) {
      fillBlock((Math.random() * cols) | 0, (Math.random() * rows) | 0)
    }
  } else {
    // Dense grain: visit every cell, tint with probability `amount`. Guarantees
    // coverage that random scattering wouldn't give at high density.
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (Math.random() < clampedAmount) fillBlock(cx, cy)
      }
    }
  }

  s.updatePixels()
}

// --- Clipart (SVG) elements -------------------------------------------------
// Element shape (in node.props, mirroring the `shape` element):
//   type: 'clipart'
//   src:      filename or path. Bare name -> 'img/svg/<name>'; a path with '/' is
//             taken relative to assets/, e.g. 'img/svg/cat.svg'.
//   x, y:     center of the clipart, in logical viewport units.
//   width?, height?: logical size. If one is omitted it's derived from the SVG's
//             intrinsic aspect ratio; if both are omitted, defaults to ~40 wide.
//   scale:    extra multiplier (default 1).
//   rotation: degrees, clockwise (default 0). p5 rotates in radians, so we convert.
// Layering across all element types is by `node.z` (default 0), sorted below.
//
// Each SVG is loaded once and rasterized to a high-res offscreen canvas (longest
// side RASTER_LONG_SIDE), then that bitmap is blitted every frame. This keeps it
// crisp regardless of how far the letterbox scales the viewport up, and avoids
// re-rasterizing vector art on every one of the 30fps frames.
const RASTER_LONG_SIDE = 1024
const clipartCache = new Map() // src -> { status, canvas, aspect }

const assetUrl = (src) => {
  const rel = src.includes('/') ? src : `img/svg/${src}`
  return `/api/assets/${rel.replace(/^\/+/, '')}`
}

const getClipart = (src) => {
  let entry = clipartCache.get(src)
  if (entry) return entry
  entry = { status: 'loading', canvas: null, aspect: 1 }
  clipartCache.set(src, entry)

  const img = new Image()
  img.onload = () => {
    // viewBox-only SVGs can report naturalWidth/Height as 0 — fall back to square.
    const iw = img.naturalWidth || RASTER_LONG_SIDE
    const ih = img.naturalHeight || RASTER_LONG_SIDE
    const aspect = iw / ih
    const rw = aspect >= 1 ? RASTER_LONG_SIDE : Math.round(RASTER_LONG_SIDE * aspect)
    const rh = aspect >= 1 ? Math.round(RASTER_LONG_SIDE / aspect) : RASTER_LONG_SIDE
    const off = document.createElement('canvas')
    off.width = rw
    off.height = rh
    off.getContext('2d').drawImage(img, 0, 0, rw, rh)
    entry.canvas = off
    entry.aspect = aspect
    entry.status = 'ready'
  }
  img.onerror = () => { entry.status = 'error' }
  img.src = assetUrl(src)
  return entry
}

const drawClipart = (s, node) => {
  const { src, x = 0, y = 0, width, height, scale = 1, rotation = 0 } = node.props ?? {}
  if (!src) return
  const entry = getClipart(src)
  if (entry.status !== 'ready') return // not loaded yet; a later frame will draw it

  const w = width ?? (height != null ? height * entry.aspect : 40)
  const h = height ?? w / entry.aspect

  s.push()
  s.translate(x, y) // x,y = center, so rotation/scale pivot on the clipart's middle
  if (rotation) s.rotate((rotation * Math.PI) / 180)
  if (scale !== 1) s.scale(scale)
  s.drawingContext.drawImage(entry.canvas, -w / 2, -h / 2, w, h)
  s.pop()
}

export const renderSceneP5 = (s, { width, height }, node) => {
  s.clear()

  const { width: vw, height: vh } = node.viewport ?? { width: 160, height: 90 }
  const scale = Math.min(width / vw, height / vh)

  const offsetX = (width - vw * scale) / 2
  const offsetY = (height - vh * scale) / 2

  s.push()
  s.translate(offsetX, offsetY)
  s.scale(scale)

  // Draw back-to-front by z (stable: equal-z keeps authoring/array order).
  const elements = [...(node.elements ?? [])].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))

  for (const element of elements) {
    if (element.enabled === false) continue
    if (element.type === 'background' && element.props.fill) {
      s.noStroke()
      s.fill(element.props.fill)
      s.rect(0, 0, vw, vh)
    }

    if (element.type === 'shape') {
      const {
        kind = 'rect',
        x = 0,
        y = 0,
        width = 10,
        height = 10,
        fill = 'white'
      } = element.props ?? {}

      if (kind === 'rect') {
        s.noStroke()
        s.fill(fill)
        s.rect(x, y, width, height)
      }
    }

    if (element.type === 'clipart') {
      drawClipart(s, element)
    }
  }

  s.pop()

  for (const effect of node.effects ?? []) {
    if (effect.enabled === false) continue
    if (effect.type === 'grain') {
      applyGrain(s, effect.props)
    }
  }
}

// --- Interaction (hit-testing for dragging elements) ------------------------
// The same letterbox transform renderSceneP5 uses, factored out so screen↔logical
// conversions and hit-testing stay in sync with what's actually drawn.
const viewportTransform = (canvasWidth, canvasHeight, node) => {
  const { width: vw, height: vh } = node.viewport ?? { width: 160, height: 90 }
  const scale = Math.min(canvasWidth / vw, canvasHeight / vh)
  return { scale, offsetX: (canvasWidth - vw * scale) / 2, offsetY: (canvasHeight - vh * scale) / 2 }
}

// Canvas pixel coords -> logical viewport units (the space element x/y live in).
export const screenToLogical = (canvasWidth, canvasHeight, node, screenX, screenY) => {
  const { scale, offsetX, offsetY } = viewportTransform(canvasWidth, canvasHeight, node)
  return { x: (screenX - offsetX) / scale, y: (screenY - offsetY) / scale }
}

// Axis-aligned bounds of a draggable element in logical units, mirroring the
// sizing the renderer applies. Returns null for non-draggable elements
// (background) so they're never picked. Rotation isn't accounted for — the box is
// the unrotated extent, which is good enough for grabbing.
const elementBounds = (element) => {
  if (element.type === 'shape') {
    const { x = 0, y = 0, width = 10, height = 10 } = element.props ?? {}
    return { left: x, top: y, right: x + width, bottom: y + height }
  }
  if (element.type === 'clipart') {
    const { src, x = 0, y = 0, width, height, scale = 1 } = element.props ?? {}
    const aspect = (src ? clipartCache.get(src)?.aspect : null) ?? 1
    const baseWidth = width ?? (height != null ? height * aspect : 40)
    const baseHeight = height ?? baseWidth / aspect
    const halfWidth = (baseWidth / 2) * scale
    const halfHeight = (baseHeight / 2) * scale // x,y is the clipart's center
    return { left: x - halfWidth, top: y - halfHeight, right: x + halfWidth, bottom: y + halfHeight }
  }
  return null
}

// Topmost draggable element at a canvas point, or null. Front-to-back is the
// render order (by z, stable) reversed, so the visually top element wins.
export const pickElement = (canvasWidth, canvasHeight, node, screenX, screenY) => {
  const { x, y } = screenToLogical(canvasWidth, canvasHeight, node, screenX, screenY)
  const ordered = [...(node.elements ?? [])].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
  for (let index = ordered.length - 1; index >= 0; index--) {
    const element = ordered[index]
    if (element.enabled === false) continue
    const bounds = elementBounds(element)
    if (!bounds) continue
    if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) return element
  }
  return null
}