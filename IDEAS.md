# IDEAS

Scratchpad for things to explore, learn, or build later. Not a spec — just a
parking lot so nothing gets lost. Move items into CLAUDE.md only once they
become concrete, code-relevant work.

## Learning goals

- **WebAssembly (WASM)** — learn the fundamentals and where it could fit in this
  workspace (e.g. running compute-heavy logic in the frontend editor, or
  sharing code between backend and browser).

## Project ideas

- **Flutter for cloud-driven mobile control** — build a Flutter mobile app that
  can be controlled / driven from "cloud code" (e.g. trigger actions, push
  state, or receive commands from a backend service). Explore how this could
  connect to the existing ocraft backend/scheduler.

- **Stream-type editor on the backend** — develop the editor / tooling for the
  `stream` node type on the backend side (the stream node type was recently
  added). Flesh out how stream nodes are created, configured, and run.

- **Scripts calling other scripts by name** — let every script in the editor
  invoke another script by its name (composition / reuse between nodes). Open
  question: how does a script *discover* the other scripts it can call? Idea:
  discovery becomes organic once the node ("artifact") list is **hierarchical**
  — the tree structure itself acts as the namespace/registry, so a script can
  reference siblings/children by path-like names instead of needing a separate
  lookup mechanism.

- **CRUD nodes from the frontend + nested nodes** — add full create/read/update/
  delete for nodes directly in the frontend editor. A node should be able to
  contain other nodes (nesting), which gives the hierarchical tree above. Idea:
  introduce a `category` node type that acts like a directory — its job is to
  hold child nodes rather than run a script. This is the structural foundation
  the script discovery idea depends on.

---

_Add new ideas with a short title and a one-line note on why it's interesting._
