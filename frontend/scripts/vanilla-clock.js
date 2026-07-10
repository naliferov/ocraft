// vanilla script: gets a host element, returns a cleanup.
export default (host) => {
  const el = document.createElement('div')
  el.className = 'font-mono text-4xl tabular-nums'
  host.append(el)
  const tick = () => (el.textContent = new Date().toLocaleTimeString())
  tick()
  const timer = setInterval(tick, 1000)
  return () => clearInterval(timer)
}
