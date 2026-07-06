// Shared shape of a node as the frontend store holds it. `data` from state.json
// carries arbitrary per-type fields, so an index signature keeps it open (the
// migration types arbitrary JSON loosely — see eslint.config.js on `any`); the
// named fields are the ones the store and views actually read.
export interface NodeData {
  id: string
  name?: string
  type?: string
  parentId?: string | null
  collapsed?: boolean
  [key: string]: any
  // The store stashes a deleted node's body on the undo snapshot under a module-local
  // Symbol key (stores/nodes.ts) — JSON.stringify skips symbol props, so it never leaks
  // into state.json. The symbol index keeps that assignment typed.
  [key: symbol]: any
}

// A node placed into the sidebar hierarchy: NodeData plus the computed `children`
// (built from `parentId` by the store's `tree`, never stored).
export interface TreeNode extends NodeData {
  children: TreeNode[]
}
