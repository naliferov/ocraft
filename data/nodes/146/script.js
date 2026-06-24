// Auth token store. Paste a token here once; it persists in the browser (via
// x.auth) and any other script can read it with `x.auth.get(slot)` — e.g. the
// websocket tester grabbing a bearer for the cloud exchange. Runs on open (the
// node has runOnOpen), so the field is here the moment you select it.
export default (x) => {
  const slot = (x.args && x.args[0]) || 'default' // x.x("146", ["ws"]) targets a named slot
  let tokenField
  let status
  let masked = true

  const refresh = () => {
    status.set(x.auth.get(slot) ? `saved ✓  (slot: ${slot})` : `empty  (slot: ${slot})`)
  }

  x.ui.row((row) => {
    tokenField = row.input({
      type: 'password',
      value: x.auth.get(slot),
      placeholder: 'paste token…',
      onEnter: () => save(),
    })
    row.button('Show', (event) => {
      masked = !masked
      tokenField.element.type = masked ? 'password' : 'text'
      event.target.textContent = masked ? 'Show' : 'Hide'
    })
  })
  x.ui.row((row) => {
    row.button('Save', () => save())
    row.button('Clear', () => {
      x.auth.clear(slot)
      tokenField.value = ''
      refresh()
    })
    status = row.text('')
  })

  const save = () => {
    x.auth.set(slot, tokenField.value.trim())
    refresh()
  }

  refresh()
  // Other scripts read it with: x.auth.get()  // or x.auth.get("<slot>")
  return { get: () => x.auth.get(slot) }
}
