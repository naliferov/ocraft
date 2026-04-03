(x) => {
  //several intervals

  const tickPoints = x.nextElementSibling
  const tick = () => {
    const d = document.createElement('span')
    d.textContent = '.'
    tickPoints.append(d)

    if (tickPoints.children.length > 10) {
      tickPoints.innerHTML = ''
    }
  }

  const input = x.previousElementSibling
  input.addEventListener('input', () => {
    const v = input.value
  })
  setInterval(tick, 2000)

  

}