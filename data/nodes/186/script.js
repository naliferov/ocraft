// collage — render and move SVG clipart on a canvas.
//
// The simplified successor to the old `scene2d` (which dragged in p5 + Tone + post-FX):
// vanilla canvas, ZERO deps. This is the seed for "collages" — load SVGs from the clipart
// pipeline (/api/assets/img/svg), place them, animate. The point of the type/script split:
// simple primitives stay built-in (html/script/category); creative things like this are
// just scripts you grow. Build a real collage by editing below — add pieces, change the
// motion, wire input, pull sprites by node id later (the `binary`/`fs` roadmap).
export default async (x) => {
  if (!x.ui) {
    x.log('collage: run from the editor (it mounts a canvas).')
    return
  }

  const stage = x.ui.row()
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 400
  canvas.style.cssText = 'background:#fff;border:1px solid #333;border-radius:6px;max-width:100%'
  stage.append(canvas)
  const ctx = canvas.getContext('2d')

  // Load an SVG as an <Image>. Same-origin, so the session cookie rides along (passes
  // auth). Resolves null on failure so one missing file doesn't break the rest.
  const loadSvg = (name) =>
    new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = `/api/assets/img/svg/${name}`
    })

  const clipart = ['car.svg', 'fish.svg', 'tree.svg', 'tree2.svg', 'tree-dark.svg']
  const images = (await Promise.all(clipart.map(loadSvg))).filter(Boolean)
  if (!images.length) {
    ctx.fillText('no clipart loaded (data/assets/img/svg)', 20, 30)
    return
  }

  // Each piece: a sprite with a position, velocity, size, and spin — edit freely.
  const pieces = images.map((img, i) => ({
    img,
    x: 40 + i * 110,
    y: 80 + (i % 2) * 120,
    vx: (i % 2 ? 1 : -1) * (0.6 + i * 0.3),
    vy: 0.4 + i * 0.25,
    size: 72,
    rot: 0,
    vr: (i % 2 ? 1 : -1) * 0.01,
  }))

  let raf = 0
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const piece of pieces) {
      piece.x += piece.vx
      piece.y += piece.vy
      piece.rot += piece.vr
      // bounce off the edges
      if (piece.x < 0 || piece.x + piece.size > canvas.width) piece.vx *= -1
      if (piece.y < 0 || piece.y + piece.size > canvas.height) piece.vy *= -1
      ctx.save()
      ctx.translate(piece.x + piece.size / 2, piece.y + piece.size / 2)
      ctx.rotate(piece.rot)
      ctx.drawImage(piece.img, -piece.size / 2, -piece.size / 2, piece.size, piece.size)
      ctx.restore()
    }
    raf = requestAnimationFrame(tick)
  }
  tick()
  x.ui.onCleanup(() => cancelAnimationFrame(raf)) // stop the loop on re-run / close
}
