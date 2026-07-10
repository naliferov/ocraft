// One-off, best-effort migration: pull ocraft script NODES into devlab.
//
// Two sources, auto-selected:
//   • DB (local, no auth) — set DATABASE_URL (dotenv from the ocraft repo root is auto-loaded):
//         node projects/devlab/import-from-ocraft.js            # run from the repo root
//       Optional OCRAFT_USER_ID to pick one user (default: all script nodes).
//   • API (remote/prod) — set OCRAFT_COOKIE (endpoints are auth-gated + user-scoped):
//         OCRAFT_URL=https://ocraft.dev OCRAFT_COOKIE='ocraft_session=…' node import-from-ocraft.js
//       OCRAFT_URL defaults to http://127.0.0.1:3001; cookie from devtools -> Application -> Cookies.
//
// Honest and lossy by design (plans/devlab-plan.txt): a clean vue-sfc node (no `x` API, or only
// x.log) becomes a runnable scripts/<name>.vue; anything still using x.x/x.ui/x.args/x.vue/x.onStop
// — or a plain js/vue-esm node — can't be mechanically ported, so its raw source is dumped to
// scripts/_legacy/<name>.txt to hand-port. Output is a starting point, not a finished port.
//
// postgres/dotenv resolve from the ocraft monorepo root (Node walks up node_modules); the devlab
// app itself stays dependency-clean.
await import('dotenv/config').catch(() => {}) // optional: populate DATABASE_URL from the repo .env
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scriptsDir = join(here, 'scripts')
const legacyDir = join(scriptsDir, '_legacy')

const readFromDb = async () => {
  const { default: postgres } = await import('postgres')
  const sql = postgres(process.env.DATABASE_URL)
  try {
    const userId = process.env.OCRAFT_USER_ID
    const rows = await sql`
      select n.id, n.name, n.data, b.content
      from nodes n left join node_bodies b on b.node_id = n.id
      where n.type = 'script' ${userId ? sql`and n.user_id = ${userId}` : sql``}
      order by n.id`
    return rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      scriptType: r.data?.scriptType || 'js',
      runOnOpen: !!r.data?.runOnOpen,
      body: r.content ? Buffer.from(r.content).toString('utf-8') : '',
    }))
  } finally {
    await sql.end()
  }
}

const readFromApi = async () => {
  const base = process.env.OCRAFT_URL || 'http://127.0.0.1:3001'
  const cookie = process.env.OCRAFT_COOKIE
  const get = async (path) => {
    const res = await fetch(`${base}${path}`, { headers: { cookie } })
    if (res.status === 401) throw new Error('401 unauthorized — bad or expired OCRAFT_COOKIE')
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`)
    return res
  }
  const nodes = await (await get('/api/nodes')).json()
  const out = []
  for (const n of nodes.filter((x) => x.type === 'script')) {
    out.push({
      id: String(n.id),
      name: n.name,
      scriptType: n.data?.scriptType || 'js',
      runOnOpen: !!n.data?.runOnOpen,
      body: await (await get(`/api/nodes/${n.id}/body`)).text(),
    })
  }
  return out
}

const source = process.env.OCRAFT_COOKIE ? 'api' : process.env.DATABASE_URL ? 'db' : null
if (!source) {
  console.error('Set DATABASE_URL (local pg) or OCRAFT_COOKIE (remote API). See README / the header.')
  process.exit(1)
}

const slug = (name) =>
  (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled'

const USES_X = /\bx\.(x|ui|args|vue|onStop)\b/

// ocraft compiles vue-sfc bodies with the Vue APIs already in scope (`with (Vue)`), so their source
// calls ref()/computed()/… WITHOUT importing them, and every <style> is force-scoped at runtime.
// Standard Vite SFC compilation does neither — so re-add explicit `import … from 'vue'` for the APIs
// actually used, and mark <style> scoped, to make the imported SFC valid + non-bleeding.
const VUE_APIS = [
  'ref', 'shallowRef', 'reactive', 'shallowReactive', 'computed', 'watch', 'watchEffect',
  'toRef', 'toRefs', 'readonly', 'nextTick', 'provide', 'inject',
  'onMounted', 'onUnmounted', 'onBeforeMount', 'onBeforeUnmount', 'onUpdated', 'onBeforeUpdate',
  'defineComponent', 'markRaw', 'toRaw', 'h', 'isVNode',
]
const prepareSfc = (body) => {
  let code = body.replace(/\bx\.log\s*\(/g, 'console.log(')
  code = code.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/, (whole, open, inner, close) => {
    if (/from\s*['"]vue['"]/.test(inner)) return whole // already imports from vue
    const used = VUE_APIS.filter((api) => new RegExp(`\\b${api}\\s*\\(`).test(inner))
    return used.length ? `${open}\nimport { ${used.join(', ')} } from 'vue'\n${inner}${close}` : whole
  })
  return code.replace(/<style(?![^>]*\bscoped\b)([^>]*)>/g, '<style$1 scoped>')
}

const scripts = source === 'db' ? await readFromDb() : await readFromApi()

// id -> unique slug (dedupe collisions deterministically)
const taken = new Set()
for (const s of scripts) {
  const base = slug(s.name)
  let name = base
  let i = 2
  while (taken.has(name)) name = `${base}-${i++}`
  taken.add(name)
  s.slug = name
}

await mkdir(scriptsDir, { recursive: true })

const converted = []
const legacy = []

for (const s of scripts) {
  const portable = s.scriptType === 'vue-sfc' && !USES_X.test(s.body)
  if (portable) {
    await writeFile(join(scriptsDir, `${s.slug}.vue`), prepareSfc(s.body))
    converted.push(s.slug)
  } else {
    await mkdir(legacyDir, { recursive: true })
    await writeFile(join(legacyDir, `${s.slug}.txt`), s.body)
    legacy.push(`${s.slug} (${s.scriptType !== 'vue-sfc' ? s.scriptType : 'uses x.*'})`)
  }
}

console.log(`\nsource: ${source} — found ${scripts.length} script node(s)`)
console.log(`converted ${converted.length} -> scripts/*.vue: ${converted.join(', ') || '(none)'}`)
if (legacy.length) {
  console.log(`\ndumped ${legacy.length} to scripts/_legacy/ (need manual port):`)
  for (const l of legacy) console.log(`  ${l}`)
}
