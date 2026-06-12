import { useNodesStore } from '../stores/nodes.js'

// Runtime for "scripts calling other scripts by id".
//
// A node script is `export default (x) => { ... }`. The `x` (context) handed in
// lets a script invoke ANOTHER node's script by its bare id via `x.x(id, ...)`:
//
//   export default async (x) => {
//     const out = await x.x("5", [42])   // run node 5's script with args [42]
//     return out
//   }
//
// Identity is the flat numeric id — no path, no alias, no manifest. The editor
// makes the id readable (the picker shows the name at authoring time); only the
// stable id is ever stored in the source.
//
// Frontend-only on purpose: node scripts execute solely in the browser (blob
// import), unlike backend *entries* which run via executor.js. The `x` shape is
// kept simple so it can be reimplemented backend-side later if headless node
// execution is ever needed.

// id -> Promise<module>. Cached so repeated calls don't re-fetch/re-import.
// Cleared whenever a script is saved (see clearCache), so edits take effect.
const moduleCache = new Map()
const wasmCache = new Map()

export function clearCache() {
  moduleCache.clear()
  wasmCache.clear()
}

// Compile (server-side) + instantiate a wasm node, returning its exports. Cached
// by id like JS modules; cleared on save so edits take effect.
async function loadWasmExports(id) {
  if (!wasmCache.has(id)) {
    wasmCache.set(id, (async () => {
      const res = await fetch(`/api/nodes/${id}/wasm`)
      if (!res.ok) throw new Error(`wasm compile failed:\n${await res.text()}`)
      const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {})
      return instance.exports
    })())
  }
  return wasmCache.get(id)
}

async function loadModule(id) {
  if (!moduleCache.has(id)) {
    moduleCache.set(id, (async () => {
      const res = await fetch(`/api/nodes/${id}/script`)
      if (!res.ok) throw new Error(`node "${id}": no script found`)
      const code = await res.text()
      const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
      try {
        return await import(/* @vite-ignore */ url)
      } finally {
        URL.revokeObjectURL(url)
      }
    })())
  }
  return moduleCache.get(id)
}

// Resolve a node id to a "name (id)" label for log prefixes, via the store.
const nodeLabel = (id) => {
  const node = useNodesStore().nodes.find((n) => n.id === id)
  return node?.name ? `${node.name} (${id})` : `node ${id}`
}

// Build the `x` context passed to a running script. `stack` carries the chain
// of node ids currently executing, so a re-entry is caught as a cycle instead of
// recursing forever.
function makeCtx(selfId, args, stack) {
  return {
    args,
    log: (...a) => console.log(`[${nodeLabel(selfId)}]`, ...a),
    // x.x(id, ...args) — run another node's script by its bare id.
    // x.x(id, args?) — args is an ARRAY of arguments (it becomes the callee's
    // x.args, or is spread into a wasm main()).
    x: async (targetId, args = []) => {
      const id = String(targetId)
      if (stack.includes(id)) {
        throw new Error(`call cycle: ${[...stack, id].join(' → ')}`)
      }
      // wasm: `main` is the "default" — if present, x.x runs it (args spread in)
      // and returns its result, just like a JS node's default export. With no
      // main, hand back the exports so the caller picks a named function:
      // `const w = await x.x("10"); w.add(2, 3)`.
      const target = useNodesStore().nodes.find((n) => n.id === id)
      if (target?.isWasm) {
        const ex = await loadWasmExports(id)
        return typeof ex.main === 'function' ? ex.main(...args) : ex
      }
      const mod = await loadModule(id)
      if (typeof mod.default !== 'function') {
        throw new Error(`node "${id}": script has no default export to call`)
      }
      return await mod.default(makeCtx(id, args, [...stack, id]))
    },
  }
}

// Run a raw source string as node `selfId` (e.g. the current editor buffer,
// which may be unsaved). Its ctx.call resolves OTHER nodes from their saved
// scripts via the loader.
export async function runNodeCode(code, selfId) {
  const id = String(selfId)
  const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
  try {
    const mod = await import(/* @vite-ignore */ url)
    if (typeof mod.default !== 'function') {
      throw new Error('script has no default export')
    }
    return await mod.default(makeCtx(id, [], [id]))
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Run an isWasm node: the backend compiles its (saved) AssemblyScript source to
// wasm at GET /api/nodes/:id/wasm; we instantiate it. `main()` is just our Run
// convention (the wasm analog of a JS node's `export default`) — it is NOT
// required by AssemblyScript. If present, Run calls it; otherwise we report the
// module's exports (still callable) rather than erroring. Compile errors arrive
// as a 400 with asc's diagnostics.
export async function runWasmNode(id) {
  const ex = await loadWasmExports(id)
  if (typeof ex.main === 'function') {
    const result = ex.main()
    console.log(`[${nodeLabel(id)}] wasm main() =`, result)
    return result
  }
  const fns = Object.keys(ex).filter((k) => typeof ex[k] === 'function')
  console.log(`[${nodeLabel(id)}] wasm ready — exports: ${fns.join(', ') || '(none)'}. Add a main() for Run to call one.`)
  return ex
}
