document.querySelectorAll('style').forEach((el) => el.remove())

const initCss = document.getElementById('init-css')
const style = document.createElement('style')
style.textContent = initCss.textContent

document.head.append(style)

const callFunction = (id, msg) => {
  const e = document.getElementById(id)
  if (e && e.f) return e.f(msg)
}

const elems = document.getElementsByClassName('js-fn')
for (let i = 0; i < elems.length; i++) {
  const el = elems[i]
  el.x = callFunction

  eval(el.textContent)(el)
}

window.addEventListener('click', (e) => {
  const t = e.target
  const classList = t.classList
  if (!classList.contains('click')) return

  const id = callFunction('extract-value-from-class', { 
    classList, 
    startsWith: 'to-id--' 
  })

  if (!id) return
  const el = document.getElementById(id)
  if (el.f) el.f(t)
})