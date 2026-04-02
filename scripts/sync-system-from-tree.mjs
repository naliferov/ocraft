#!/usr/bin/env node
/**
 * Generates system/ from system-tree.json: folder tree + node.json per node,
 * code extracted to code.js / code.css for kind: fn; tag text -> inline.js.
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const treePath = path.join(projectRoot, 'system-tree.json')
const systemRoot = path.join(projectRoot, 'system')

function slugify(str) {
  if (str == null || str === '') return 'unnamed'
  let s = String(str).trim().toLowerCase()
  s = s.replace(/\s*\/\s*/g, '-').replace(/\s+/g, '-')
  s = s.replace(/[()[\]{}'"]/g, '')
  s = s.replace(/[^a-z0-9\u0400-\u04FF.-]/gi, '-')
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '')
  return s || 'node'
}

function uniqueSlug(base, used) {
  let s = slugify(base)
  if (!used.has(s)) {
    used.add(s)
    return s
  }
  let i = 2
  while (used.has(`${s}-${i}`)) i += 1
  const out = `${s}-${i}`
  used.add(out)
  return out
}

function getBaseSlug(node, index) {
  if (node.label != null && node.label !== '') return node.label
  if (node.kind === 'group') return 'group'
  if (node.kind === 'fn') return node.id || node.title || `fn-${index}`
  if (node.kind === 'input') return `input-${index}`
  if (node.kind === 'tickPoints') return 'tick-points'
  if (node.tag) return `${node.tag}-${node.attrs?.id ?? index}`
  return `node-${index}`
}

function getChildren(node) {
  if (Array.isArray(node.children) && node.children.length) return node.children
  if (node.kind === 'group' && Array.isArray(node.items)) return node.items
  return []
}

function codeFileName(node) {
  if (node.kind !== 'fn' || node.code == null) return null
  const t = (node.title || '').toLowerCase()
  if (node.id === 'init-css' || t === 'init css') return 'code.css'
  return 'code.js'
}

function serializeNode(node, { codeFile, textFile }) {
  const o = structuredClone(node)
  delete o.children
  delete o.items
  if (codeFile) {
    delete o.code
    o.codeFile = codeFile
  }
  if (textFile) {
    delete o.text
    o.textFile = textFile
  }
  return o
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

async function processNode(node, parentDir, siblingSlugs, index) {
  const base = getBaseSlug(node, index)
  const slug = uniqueSlug(base, siblingSlugs)
  const dir = path.join(parentDir, slug)
  await fs.mkdir(dir, { recursive: true })

  let codeFile = null
  let textFile = null

  if (node.kind === 'fn' && node.code != null) {
    const name = codeFileName(node)
    await fs.writeFile(path.join(dir, name), node.code, 'utf8')
    codeFile = name
  }

  if (node.tag && node.text != null) {
    await fs.writeFile(path.join(dir, 'inline.js'), node.text, 'utf8')
    textFile = 'inline.js'
  }

  const meta = serializeNode(node, { codeFile, textFile })
  await writeJson(path.join(dir, 'node.json'), meta)

  const kids = getChildren(node)
  const childSlugs = new Set()
  for (let i = 0; i < kids.length; i += 1) {
    await processNode(kids[i], dir, childSlugs, i)
  }
}

async function writeReadme() {
  const text = `# system

Сгенерировано из \`system-tree.json\` (корень репозитория).

\`\`\`bash
npm run sync:system
\`\`\`

В каждой папке узла: \`node.json\` (метаданные без \`children\`/\`items\`). Для \`kind: fn\` код в \`code.js\` или \`code.css\` (\`codeFile\` в node.json). Для узлов с \`tag\`+текст — \`inline.js\`.
`
  await fs.writeFile(path.join(systemRoot, 'README.md'), text, 'utf8')
}

async function main() {
  const raw = await fs.readFile(treePath, 'utf8')
  const tree = JSON.parse(raw)

  await fs.rm(systemRoot, { recursive: true, force: true })
  await fs.mkdir(systemRoot, { recursive: true })

  const topSlugs = new Set()
  const children = tree.children || []
  for (let i = 0; i < children.length; i += 1) {
    await processNode(children[i], systemRoot, topSlugs, i)
  }

  await writeReadme()
  console.log(`OK: ${systemRoot} (${children.length} top-level branches)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
