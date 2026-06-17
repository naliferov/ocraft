// Import the ThinkTank Obsidian vault (../../ThinkTank) into ocraft nodes.
//
// The vault is a *flat* folder of .md notes whose hierarchy lives in the wikilink
// graph (navigation.md is the map-of-content). This entry turns each note into an
// `html` node (markdown → HTML), rebuilds a category tree from navigation.md under
// a single `ThinkTank` root, copies+optimizes embedded images, and writes a
// manifest so the import is trackable and re-runnable.
//
// Idempotent: a re-run deletes the nodes recorded in the previous manifest before
// recreating, so running twice yields the same result (and existing non-import
// nodes are never touched). Run: `node cli.js run import-thinktank [vaultPath]`.
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { Marked } from 'marked'
import { getDirname } from '../lib/path.js'

const here = getDirname(import.meta.url)
const BACKEND_DIR = path.join(here, '..')
const NODES_DIR = path.join(BACKEND_DIR, 'data/nodes')
const ASSETS_IMG_DIR = path.join(BACKEND_DIR, 'data/assets/img')
const ASSETS_OPT_DIR = path.join(ASSETS_IMG_DIR, 'optimized')
const MANIFEST_PATH = path.join(BACKEND_DIR, 'data/thinktank-import.json')
const DEFAULT_VAULT = path.join(BACKEND_DIR, '../../ThinkTank')

// Notes we never migrate — credentials and private personal life (ocraft is a
// public repo). Stored lowercased, matched against the note basename (no .md).
const EXCLUDED = new Set([
  // credentials / contact data
  'job accounts',
  'contacts',
  'job contacts',
  'job todo',
  // personal life (user keeps these for a future private space)
  'самоанализ',
  'тревога',
  'знакомства',
  'женщины',
  'моя комната',
  'body',
  'medicine',
  'home',
  'finance',
  'job',
  'job ownership',
  'job productivity',
  'job interview',
])

// Vault tooling/config, not knowledge notes — don't import.
const NON_CONTENT = new Set(['claude', 'readme'])

// Defensive backstop: skip any *included* note whose body still smells like a
// real secret, even though the list above should already cover them. Tuned to
// avoid known false positives (e.g. a placeholder `PGPASSWORD='pass'`, 4 chars).
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /ssh-rsa\s+AAAA[0-9A-Za-z+/]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /\b(?:sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
]

const IMAGE_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.gif', '.svg', '.webp'])
// sharp can re-encode these raster formats; svg/gif are copied through as-is.
const OPTIMIZABLE = new Set(['.jpeg', '.jpg', '.png', '.webp'])

const stripExt = (file) => file.replace(/\.md$/i, '')
const isImageTarget = (name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase())

// --- read & filter the vault -------------------------------------------------

const readVault = async (vaultDir, ctx) => {
  const dirEntries = await fs.readdir(vaultDir, { withFileTypes: true })
  const notes = [] // { file, base, raw }
  const skipped = [] // { file, reason }
  const imageFiles = new Set()

  for (const dirEntry of dirEntries) {
    if (!dirEntry.isFile()) continue
    const ext = path.extname(dirEntry.name).toLowerCase()
    if (IMAGE_EXTENSIONS.has(ext)) {
      imageFiles.add(dirEntry.name)
      continue
    }
    if (ext !== '.md') continue

    const base = stripExt(dirEntry.name)
    if (EXCLUDED.has(base.toLowerCase())) {
      skipped.push({ file: dirEntry.name, reason: 'excluded (sensitive/private)' })
      continue
    }
    if (NON_CONTENT.has(base.toLowerCase())) {
      skipped.push({ file: dirEntry.name, reason: 'non-content (tooling)' })
      continue
    }
    const raw = await fs.readFile(path.join(vaultDir, dirEntry.name), 'utf-8')
    const secretHit = SECRET_PATTERNS.find((pattern) => pattern.test(raw))
    if (secretHit) {
      skipped.push({ file: dirEntry.name, reason: 'secret-scan tripped' })
      ctx.log(`⚠ skipped ${dirEntry.name} — secret-scan tripped`)
      continue
    }
    notes.push({ file: dirEntry.name, base, raw })
  }
  return { notes, skipped, imageFiles }
}

// --- wikilink helpers --------------------------------------------------------

// All [[targets]] in a note's text, ignoring fenced code blocks so we don't treat
// code samples as links. Returns the resolution key (basename, before any #).
const linkTargetsOf = (raw) => {
  const withoutCode = raw.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '')
  const targets = []
  for (const match of withoutCode.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
    targets.push(match[1].split('#')[0].split('|')[0].trim())
  }
  return targets
}

const looksLikeMap = (raw) => {
  const links = linkTargetsOf(raw).length
  const nonEmptyLines = raw.split('\n').filter((line) => line.trim()).length || 1
  return links >= 3 && links / nonEmptyLines >= 0.5
}

// --- markdown → HTML (with code-safe Obsidian transforms) --------------------

// Build a Marked instance whose inline extensions turn ![[x]]/[[x]] into <img>/<a>.
// Inline extensions only run on text tokens, never inside code spans/fences, so
// code samples containing [[ ]] are left untouched.
const buildMarkdown = (nameToId, assetUrlOf, referencedAssets) => {
  const renderWikilink = (target) => {
    const base = target.split('#')[0].split('|')[0].trim()
    const display = base
    if (isImageTarget(base)) {
      referencedAssets.add(base)
      return `<a href="${assetUrlOf(base)}" class="wikilink">${display}</a>`
    }
    const found = nameToId.get(base.toLowerCase())
    // Ghost link → plain text (no dead link, no brackets), per spec.
    if (!found) return display
    return `<a href="/node/${found}" class="wikilink">${display}</a>`
  }
  const renderEmbed = (target) => {
    const base = target.split('|')[0].trim()
    if (isImageTarget(base)) {
      referencedAssets.add(base)
      return `<img src="${assetUrlOf(base)}" alt="${base}" class="embed">`
    }
    // Non-image embed (transclusion) → fall back to a link/plain text.
    return renderWikilink(target)
  }

  const markdown = new Marked()
  markdown.use({
    extensions: [
      {
        name: 'embed',
        level: 'inline',
        start(src) {
          const index = src.indexOf('![[')
          return index < 0 ? undefined : index
        },
        tokenizer(src) {
          const match = /^!\[\[([^\]]+)\]\]/.exec(src)
          if (match) return { type: 'embed', raw: match[0], target: match[1].trim() }
        },
        renderer(token) {
          return renderEmbed(token.target)
        },
      },
      {
        name: 'wikilink',
        level: 'inline',
        start(src) {
          const index = src.indexOf('[[')
          return index < 0 ? undefined : index
        },
        tokenizer(src) {
          const match = /^\[\[([^\]]+)\]\]/.exec(src)
          if (match) return { type: 'wikilink', raw: match[0], target: match[1].trim() }
        },
        renderer(token) {
          return renderWikilink(token.target)
        },
      },
    ],
  })
  return markdown
}

// --- delete the previous import (idempotency) --------------------------------

const removePreviousImport = async (ctx) => {
  let manifest
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf-8'))
  } catch {
    return 0
  }
  let removed = 0
  for (const node of manifest.nodes ?? []) {
    const dir = path.join(NODES_DIR, String(node.id))
    // Guard: only remove dirs that resolve safely inside NODES_DIR.
    if (!path.resolve(dir).startsWith(NODES_DIR + path.sep)) continue
    await fs.rm(dir, { recursive: true, force: true })
    removed += 1
  }
  ctx.log(`removed ${removed} node(s) from previous import`)
  return removed
}

// Smallest next numeric id above all existing node folders (never reuses 1..N).
const mintIdAllocator = async () => {
  const dirs = await fs.readdir(NODES_DIR)
  let max = dirs.reduce((acc, dir) => {
    const num = Number(dir)
    return Number.isInteger(num) && num > acc ? num : acc
  }, 0)
  return () => String(++max)
}

const writeNode = async (id, body) => {
  const dir = path.join(NODES_DIR, id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(body, null, 2))
}

// --- images: copy original to assets/img, optimized to assets/img/optimized ---

// Write referenced images straight to assets/img/optimized/ (the served copy) —
// no duplicate in assets/img/ top-level. Raster types are re-encoded via sharp;
// svg/gif pass through unchanged (nothing to optimize).
const processImages = async (referencedAssets, imageFiles, vaultDir, ctx) => {
  await fs.mkdir(ASSETS_OPT_DIR, { recursive: true })
  const done = []
  for (const fileName of referencedAssets) {
    if (!imageFiles.has(fileName)) {
      ctx.log(`⚠ image not found in vault: ${fileName}`)
      continue
    }
    const source = path.join(vaultDir, fileName)
    const ext = path.extname(fileName).toLowerCase()
    const target = path.join(ASSETS_OPT_DIR, fileName)
    if (OPTIMIZABLE.has(ext)) {
      const image = sharp(source)
      if (ext === '.png') await image.png({ compressionLevel: 9 }).toFile(target)
      else if (ext === '.webp') await image.webp({ quality: 80 }).toFile(target)
      else await image.jpeg({ quality: 80, progressive: true }).toFile(target)
    } else {
      await fs.copyFile(source, target)
    }
    done.push(fileName)
  }
  ctx.log(`images: ${done.length} optimized → optimized/`)
  return done
}

export const run = async (ctx) => {
  const vaultDir = ctx.args[0] || DEFAULT_VAULT
  ctx.log(`vault: ${vaultDir}`)

  await removePreviousImport(ctx)

  const { notes, skipped, imageFiles } = await readVault(vaultDir, ctx)
  ctx.log(`notes to import: ${notes.length}, skipped: ${skipped.length}`)

  const allocId = await mintIdAllocator()

  // Root category + id assignment for every note (so wikilinks can resolve).
  const rootId = allocId()
  const nameToId = new Map() // basename(lower) -> node id
  const noteById = new Map() // id -> note record
  for (const note of notes) {
    const id = allocId()
    note.id = id
    note.parentId = null
    nameToId.set(note.base.toLowerCase(), id)
    noteById.set(id, note)
  }

  // --- hierarchy: parse navigation.md into category tree + note parents ------
  const categories = [] // { id, name }
  const sectionByLabel = new Map()
  const getSection = (label) => {
    const existing = sectionByLabel.get(label)
    if (existing) return existing
    const id = allocId()
    sectionByLabel.set(label, id)
    categories.push({ id, name: label.toLowerCase() })
    return id
  }
  const setParent = (id, parentId) => {
    const note = noteById.get(id)
    if (note && note.parentId == null) note.parentId = parentId
  }
  const resolveLinks = (line) => {
    const ids = []
    for (const match of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const base = match[1].split('#')[0].split('|')[0].trim()
      const id = nameToId.get(base.toLowerCase())
      if (id) ids.push(id)
    }
    return ids
  }

  const navNote = notes.find((note) => note.base.toLowerCase() === 'navigation')
  const placedOrder = [] // ids placed by navigation, for BFS seeds
  if (navNote) {
    let currentSection = rootId
    for (const line of navNote.raw.split('\n')) {
      const heading = /^(#{2,6})\s+(.+?)\s*$/.exec(line)
      if (heading) {
        const label = heading[2].trim()
        const asLink = /^\[\[([^\]]+)\]\]$/.exec(label)
        if (asLink) {
          // Heading is itself a note link → that note sits under root; following
          // bullets attach to root (its own children come from its map, later).
          for (const id of resolveLinks(label)) {
            setParent(id, rootId)
            placedOrder.push(id)
          }
          currentSection = rootId
        } else {
          currentSection = getSection(label)
        }
        continue
      }
      const isBullet = /^\s*[-*]\s/.test(line)
      for (const id of resolveLinks(line)) {
        const parent = isBullet ? currentSection : rootId
        setParent(id, parent)
        placedOrder.push(id)
      }
    }
    // navigation.md is the map itself — nothing links *to* it, so pin it directly
    // under the root (notes) instead of letting it fall into "unsorted".
    setParent(navNote.id, rootId)
  }

  // --- BFS from navigation-placed notes: nest map-notes' links beneath them ---
  const queue = [...placedOrder]
  while (queue.length) {
    const parentId = queue.shift()
    const parentNote = noteById.get(parentId)
    if (!parentNote || !looksLikeMap(parentNote.raw)) continue
    for (const target of linkTargetsOf(parentNote.raw)) {
      const childId = nameToId.get(target.toLowerCase())
      if (!childId || childId === parentId) continue
      const child = noteById.get(childId)
      if (child && child.parentId == null) {
        child.parentId = parentId
        queue.push(childId)
      }
    }
  }

  // --- leftovers → an "unsorted" category -----------------------------------
  const leftovers = notes.filter((note) => note.parentId == null && note.id !== undefined)
  let unsortedId = null
  if (leftovers.length) {
    unsortedId = allocId()
    categories.push({ id: unsortedId, name: 'unsorted' })
    for (const note of leftovers) note.parentId = unsortedId
  }

  // Prune categories that ended up with no note children (e.g. ghost sections).
  const usedParents = new Set(notes.map((note) => note.parentId))
  const liveCategories = categories.filter((category) => usedParents.has(category.id))

  // --- convert + write -------------------------------------------------------
  const assetUrlOf = (file) => `/api/assets/img/optimized/${encodeURIComponent(file)}`
  const referencedAssets = new Set()
  const markdown = buildMarkdown(nameToId, assetUrlOf, referencedAssets)

  // root + categories
  await writeNode(rootId, { name: 'notes', type: 'category', collapsed: false })
  for (const category of liveCategories) {
    await writeNode(category.id, {
      name: category.name,
      type: 'category',
      collapsed: true,
      parentId: rootId,
    })
  }
  // notes
  const manifestNodes = [{ id: rootId, name: 'notes', type: 'category', parentId: null }]
  for (const category of liveCategories) {
    manifestNodes.push({ id: category.id, name: category.name, type: 'category', parentId: rootId })
  }
  for (const note of notes) {
    const html = markdown.parse(note.raw).trim()
    const name = note.base.toLowerCase()
    // The HTML body lives in a content.html sidecar (kept out of state.json so the
    // node-list endpoint stays tiny), mirroring how script nodes store script.js.
    await writeNode(note.id, { name, type: 'html', parentId: note.parentId })
    await fs.writeFile(path.join(NODES_DIR, String(note.id), 'content.html'), html)
    manifestNodes.push({
      id: note.id,
      source: note.file,
      name,
      type: 'html',
      parentId: note.parentId,
    })
  }

  const images = await processImages(referencedAssets, imageFiles, vaultDir, ctx)

  const manifest = {
    importedAt: ctx.time.now(),
    vault: vaultDir,
    rootId,
    counts: {
      notes: notes.length,
      categories: liveCategories.length,
      images: images.length,
      skipped: skipped.length,
    },
    nodes: manifestNodes,
    images,
    skipped,
  }
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2))

  ctx.log(
    `done → ${notes.length} notes, ${liveCategories.length} categories, ${images.length} images under node ${rootId} (notes)`,
  )
  return manifest.counts
}
