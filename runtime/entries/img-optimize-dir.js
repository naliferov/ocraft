import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

export const run = async (ctx) => {
  const inputDir = 'artifacts/data/assets/img/raw'
  const outputDir = 'artifacts/data/assets/img/optimized'

  await fs.mkdir(outputDir, { recursive: true })

  const entries = await fs.readdir(inputDir, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)

  if (!files.length) {
    ctx.log(`no files in ${inputDir}`)
    return
  }

  ctx.log(`files: ${files.join(', ')}`)

  let processed = 0
  let skipped = 0

  for (const file of files) {
    const ext = path.extname(file).toLowerCase()

    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      ctx.log(`skip ${file} (unsupported format)`)
      skipped += 1
      continue
    }

    const inputPath = path.join(inputDir, file)
    const outputPath = path.join(outputDir, file)

    const image = sharp(inputPath)

    if (ext === '.jpg' || ext === '.jpeg') {
      await image.jpeg({ quality: 80, progressive: true }).toFile(outputPath)
    } else if (ext === '.png') {
      await image.png({ compressionLevel: 9 }).toFile(outputPath)
    } else if (ext === '.webp') {
      await image.webp({ quality: 80 }).toFile(outputPath)
    }

    const inputSize = (await fs.stat(inputPath)).size
    const outputSize = (await fs.stat(outputPath)).size
    const saved = inputSize > 0
      ? (((inputSize - outputSize) / inputSize) * 100).toFixed(1)
      : '0.0'

    ctx.log(`${file} → ${file}`)
    ctx.log(
      `${(inputSize / 1024).toFixed(1)}kb → ${(outputSize / 1024).toFixed(1)}kb (saved ${saved}%)`
    )

    processed += 1
  }

  ctx.log(`done: processed ${processed}, skipped ${skipped}`)
}