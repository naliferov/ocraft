// Browser-only UI surface handed to a running script node as `x.ui`.
//
// A script node is `export default (x) => { ... }`. When such a script is run
// from the editor, it gets an `x.ui` whose helpers mount real DOM controls into
// a panel ABOVE the script editor — so a script can present its own inputs,
// buttons, and a live log (e.g. the WebSocket tester lives in a node this way).
//
// Deliberately vanilla DOM with inline styles (no Vue, no naive-ui): the host
// element is owned by Script.vue but the controls are created imperatively by
// the script, and Vue's scoped styles don't reach imperatively-created nodes.
// `x.ui` exists ONLY for the top-level run in the browser; nested `x.x(...)`
// calls and any future backend runner get a ctx without `x.ui`.

const applyStyle = (element, style) => {
  for (const [key, value] of Object.entries(style)) {
    element.style[key] = value
  }
}

const makeRow = () => {
  const row = document.createElement('div')
  applyStyle(row, { display: 'flex', gap: '8px', alignItems: 'center' })
  return row
}

const makeInput = ({ value = '', placeholder = '', type = 'text', onEnter }) => {
  const input = document.createElement('input')
  input.type = type // e.g. 'password' to mask a token; default 'text'
  input.value = value
  input.placeholder = placeholder
  applyStyle(input, {
    flex: '1',
    height: '30px',
    padding: '0 10px',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#d4d4d4',
    outline: 'none',
    fontSize: '13px',
  })
  if (onEnter) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        onEnter(input.value)
      }
    })
  }
  // `.value` proxies straight to the live element so the script always reads the
  // current text and can set it (e.g. clearing a send box after sending).
  return {
    element: input,
    get value() {
      return input.value
    },
    set value(next) {
      input.value = next
    },
  }
}

const makeButton = (label, onClick) => {
  const button = document.createElement('button')
  button.textContent = label
  applyStyle(button, {
    height: '30px',
    padding: '0 12px',
    background: '#222',
    border: '1px solid #3a3a3a',
    borderRadius: '4px',
    color: '#d4d4d4',
    cursor: 'pointer',
    fontSize: '13px',
  })
  if (onClick) {
    button.addEventListener('click', (event) => onClick(event))
  }
  return button
}

const makeText = (initial = '') => {
  const span = document.createElement('span')
  span.textContent = initial
  applyStyle(span, { fontSize: '12px', opacity: '0.8' })
  return {
    element: span,
    set(next) {
      span.textContent = next
    },
  }
}

const ARROW = { up: '↑', down: '↓', sys: '·' }
const LINE_COLOR = { up: '#6cf', down: '#9f9', sys: '#999' }

const makeLog = ({ height = '300px' } = {}) => {
  const view = document.createElement('div')
  applyStyle(view, {
    height,
    overflow: 'auto',
    background: '#0f0f0f',
    border: '1px solid #2a2a2a',
    borderRadius: '4px',
    padding: '10px',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontFeatureSettings: "'liga' 0, 'calt' 0", // no programming ligatures
    fontSize: '12.5px',
    lineHeight: '1.6',
  })
  const stamp = () => new Date().toLocaleTimeString()
  // `direction` is 'up' (sent), 'down' (received), or 'sys' (status) — a named
  // mode, not a boolean, so each call site reads clearly.
  const push = (text, direction = 'sys') => {
    const line = document.createElement('div')
    applyStyle(line, {
      display: 'flex',
      gap: '8px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    })
    line.style.color = LINE_COLOR[direction] ?? LINE_COLOR.sys
    const time = document.createElement('span')
    time.textContent = stamp()
    applyStyle(time, { color: '#666', flexShrink: '0' })
    const arrow = document.createElement('span')
    arrow.textContent = ARROW[direction] ?? ARROW.sys
    applyStyle(arrow, { width: '12px', flexShrink: '0', textAlign: 'center' })
    const body = document.createElement('span')
    body.textContent = text
    line.append(time, arrow, body)
    view.append(line)
    view.scrollTop = view.scrollHeight
  }
  const clear = () => {
    view.replaceChildren()
  }
  return { element: view, push, clear }
}

// Build the host bound to a mount element. Returns the `x.ui` object plus a
// `cleanup()` Script.vue calls before a re-run and on unmount: it runs any
// teardown the script registered (close sockets, clear timers) and empties the
// panel.
//
// The panel is built detached and only inserted into `mountElement` the first
// time the script adds a visible control. A script that never touches `x.ui`
// (or only registers an `onCleanup`) leaves the host empty, so no empty styled
// box appears above the editor — the panel shows up only when it has content.
export function createScriptUi(mountElement) {
  const panel = document.createElement('div')
  applyStyle(panel, {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
    marginBottom: '4px',
    background: '#141414',
    border: '1px solid #333',
    borderRadius: '4px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: '#d4d4d4',
  })

  // Insert the panel lazily: the first added control reveals it, an unused
  // `x.ui` never does.
  let mounted = false
  const ensureMounted = () => {
    if (mounted) {
      return
    }
    mountElement.replaceChildren(panel)
    mounted = true
  }

  const teardowns = []
  const append = (built, parent) => {
    ensureMounted()
    ;(parent ?? panel).append(built.element ?? built)
  }

  const ui = {
    // A horizontal group. Pass a builder to add controls into it; returns the
    // row element so the script can also append to it later.
    row(build) {
      ensureMounted()
      const row = makeRow()
      panel.append(row)
      if (build) {
        build({
          input: (opts = {}) => {
            const field = makeInput(opts)
            row.append(field.element)
            return field
          },
          button: (label, onClick) => {
            const btn = makeButton(label, onClick)
            row.append(btn)
            return btn
          },
          text: (initial) => {
            const txt = makeText(initial)
            row.append(txt.element)
            return txt
          },
        })
      }
      return row
    },
    input(opts = {}) {
      const field = makeInput(opts)
      append(field, opts.parent)
      return field
    },
    button(label, onClick, opts = {}) {
      const btn = makeButton(label, onClick)
      append(btn, opts.parent)
      return btn
    },
    text(initial, opts = {}) {
      const txt = makeText(initial)
      append(txt, opts.parent)
      return txt
    },
    log(opts = {}) {
      const logView = makeLog(opts)
      append(logView, opts.parent)
      return logView
    },
    // Register teardown to run on re-run / unmount (e.g. () => socket.close()).
    onCleanup(fn) {
      if (typeof fn === 'function') {
        teardowns.push(fn)
      }
    },
  }

  const cleanup = () => {
    while (teardowns.length) {
      const teardown = teardowns.pop()
      try {
        teardown()
      } catch (err) {
        console.error('[script ui] cleanup failed:', err)
      }
    }
    mountElement.replaceChildren()
    // Symmetric with construction: a re-added control re-inserts the panel.
    mounted = false
  }

  return { ui, cleanup }
}
