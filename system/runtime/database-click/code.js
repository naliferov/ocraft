(x) => {
  const db = document.getElementById('database')
  db.addEventListener('click', (e) => {
    const t = e.target
    const next = t.nextElementSibling

    if (e.metaKey) {
      const el = document.createElement('div')
      el.className = 'object'
      el.textContent = 'new obj'

      if (next) {
        next.parentNode.insertBefore(el, next)
      } else {
        t.parentNode.append(el)
      }

      return
    }


    if (!next) return

    const isCategory = t.classList.contains('category')    
    if (!isCategory) return
    
    next.classList.toggle('hidden')
  })
}