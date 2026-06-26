// experiment — your personal scratchpad. Edit freely and Run to try things; nothing here is
// precious. x.ui mounts controls above the editor, x.x(id, args) calls another node by id,
// x.log prints to the console. A blank canvas for poking at the `x` API.
export default async (x) => {
  if (!x.ui) {
    x.log('experiment: run from the editor')
    return
  }
  x.ui.text('experiment scratchpad — edit this script and Run')
  const out = x.ui.log({ height: '140px' })
  x.ui.row((controls) => {
    controls.button('ping', () => out.push(`pong ${new Date().toLocaleTimeString()}`))
    controls.button('clear', () => out.clear())
  })
  out.push('ready — change me and Run')
}
